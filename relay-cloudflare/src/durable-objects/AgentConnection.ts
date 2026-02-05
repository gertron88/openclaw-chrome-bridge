import { type CloudflareBindings } from '@/config';
import { hashToken } from '@/auth/tokens';

export interface AgentConnectionState {
  agentId: string;
  tenantId?: string;
  connectedAt: number;
  lastActivity: number;
}

/**
 * Durable Object for maintaining agent WebSocket connections
 */
export class AgentConnection {
  private state: DurableObjectState;
  private env: CloudflareBindings;
  private websocket?: WebSocket;
  private agentState?: AgentConnectionState;
  private heartbeatInterval?: number;

  constructor(state: DurableObjectState, env: CloudflareBindings) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/websocket') {
      return this.handleWebSocketUpgrade(request);
    }
    
    return new Response('Not found', { status: 404 });
  }

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected websocket', { status: 400 });
    }

    // Get agent_id from URL params
    const url = new URL(request.url);
    const agentId = url.searchParams.get('agent_id');
    
    if (!agentId) {
      return new Response('Missing agent_id parameter', { status: 400 });
    }

    // Verify agent authentication
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('Missing Authorization header', { status: 401 });
    }

    const providedSecret = authHeader.slice(7);
    if (providedSecret !== this.env.AGENT_SECRET) {
      return new Response('Invalid agent secret', { status: 401 });
    }

    // Verify agent exists in database
    const agent = await this.env.DB.prepare(`
      SELECT id, display_name, tenant_id FROM agents WHERE id = ?
    `).bind(agentId).first();

    if (!agent) {
      return new Response('Agent not found', { status: 404 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    this.websocket = server;
    this.agentState = {
      agentId,
      tenantId: agent.tenant_id as string | undefined,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
    };

    // Store agent state
    await this.state.storage.put('agentState', this.agentState);
    
    // Update agent last_seen in database
    await this.env.DB.prepare(`
      UPDATE agents SET last_seen_at = ? WHERE id = ?
    `).bind(Math.floor(Date.now() / 1000), agentId).run();

    server.accept();
    server.addEventListener('message', (event) => this.handleMessage(event));
    server.addEventListener('close', () => this.handleClose());
    server.addEventListener('error', (error) => this.handleError(error));

    // Start heartbeat
    this.startHeartbeat();

    // Send hello message
    this.sendMessage({
      type: 'hello',
      role: 'agent',
      agent_id: agentId,
      tenant_id: this.agentState.tenantId,
      ts: Date.now(),
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async handleMessage(event: MessageEvent) {
    if (!this.agentState) return;

    this.agentState.lastActivity = Date.now();
    await this.state.storage.put('agentState', this.agentState);

    try {
      const message = JSON.parse(event.data as string);
      
      // Handle different message types
      switch (message.type) {
        case 'chat.response':
          await this.handleChatResponse(message);
          break;
          
        case 'presence':
          await this.handlePresenceUpdate(message);
          break;
          
        default:
          console.warn('Unknown message type from agent:', message.type);
      }
    } catch (error) {
      console.error('Error handling agent message:', error);
      this.sendError('Invalid message format');
    }
  }

  private async handleChatResponse(message: any) {
    if (!this.agentState) return;

    // Validate required fields
    if (!message.request_id || !message.session_id || !message.reply) {
      this.sendError('Missing required fields in chat.response');
      return;
    }

    // Forward to MessageRouter
    const routerId = this.env.MESSAGE_ROUTER.idFromName('global');
    const routerStub = this.env.MESSAGE_ROUTER.get(routerId);
    
    await routerStub.fetch('http://internal/route-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'chat.response',
        from_agent: this.agentState.agentId,
        message: {
          ...message,
          agent_id: this.agentState.agentId,
          ts: Date.now(),
        },
      }),
    });
  }

  private async handlePresenceUpdate(message: any) {
    if (!this.agentState) return;

    // Forward presence update to MessageRouter
    const routerId = this.env.MESSAGE_ROUTER.idFromName('global');
    const routerStub = this.env.MESSAGE_ROUTER.get(routerId);
    
    await routerStub.fetch('http://internal/presence-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: this.agentState.agentId,
        online: message.online || true,
        ts: Date.now(),
      }),
    });
  }

  private async handleClose() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.agentState) {
      // Update agent offline status
      const routerId = this.env.MESSAGE_ROUTER.idFromName('global');
      const routerStub = this.env.MESSAGE_ROUTER.get(routerId);
      
      await routerStub.fetch('http://internal/presence-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: this.agentState.agentId,
          online: false,
          ts: Date.now(),
        }),
      });

      await this.state.storage.delete('agentState');
    }
  }

  private handleError(error: any) {
    console.error('Agent WebSocket error:', error);
    this.handleClose();
  }

  private sendMessage(message: any) {
    if (this.websocket && this.websocket.readyState === WebSocket.READY_STATE_OPEN) {
      this.websocket.send(JSON.stringify(message));
    }
  }

  private sendError(message: string) {
    this.sendMessage({
      type: 'error',
      code: 'INVALID_MESSAGE',
      message,
      ts: Date.now(),
    });
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (!this.agentState) return;

      const now = Date.now();
      const timeSinceActivity = now - this.agentState.lastActivity;
      
      // Close connection if no activity for 5 minutes
      if (timeSinceActivity > 5 * 60 * 1000) {
        this.websocket?.close(1000, 'Inactive');
        return;
      }

      // Send ping
      this.sendMessage({
        type: 'ping',
        ts: now,
      });
    }, 30000); // Every 30 seconds
  }

  // Method to receive messages from MessageRouter
  async receiveMessage(message: any): Promise<void> {
    this.sendMessage(message);
  }
}