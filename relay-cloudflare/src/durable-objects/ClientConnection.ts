import { type CloudflareBindings } from '@/config';
import { verifyJWT, type JWTPayload } from '@/auth/jwt';

export interface ClientConnectionState {
  deviceId: string;
  agentId: string;
  tenantId?: string;
  connectedAt: number;
  lastActivity: number;
}

/**
 * Durable Object for maintaining client WebSocket connections
 */
export class ClientConnection {
  private state: DurableObjectState;
  private env: CloudflareBindings;
  private websocket?: WebSocket;
  private clientState?: ClientConnectionState;
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
    
    if (url.pathname === '/message' && request.method === 'POST') {
      return this.handleIncomingMessage(request);
    }
    
    return new Response('Not found', { status: 404 });
  }

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected websocket', { status: 400 });
    }

    // Verify client authentication with JWT (header or query fallback)
    const authHeader = request.headers.get('Authorization');
    const queryToken = new URL(request.url).searchParams.get('access_token');
    const bearerToken = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : queryToken;

    if (!bearerToken) {
      return new Response('Missing Authorization header or access_token query parameter', { status: 401 });
    }

    const token = bearerToken;
    const payload = await verifyJWT(token, this.env.JWT_SECRET);
    
    if (!payload) {
      return new Response('Invalid or expired token', { status: 401 });
    }

    // Verify device exists
    const device = await this.env.DB.prepare(`
      SELECT id, agent_id, tenant_id FROM devices WHERE id = ?
    `).bind(payload.sub).first();

    if (!device) {
      return new Response('Device not found', { status: 404 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    this.websocket = server;
    this.clientState = {
      deviceId: payload.sub,
      agentId: payload.agent_id,
      tenantId: payload.tenant_id,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
    };

    // Store client state
    await this.state.storage.put('clientState', this.clientState);
    
    // Update device last_seen in database
    await this.env.DB.prepare(`
      UPDATE devices SET last_seen_at = ? WHERE id = ?
    `).bind(Math.floor(Date.now() / 1000), payload.sub).run();

    server.accept();
    server.addEventListener('message', (event) => this.handleMessage(event));
    server.addEventListener('close', () => this.handleClose());
    server.addEventListener('error', (error) => this.handleError(error));

    // Start heartbeat
    this.startHeartbeat();

    // Register with MessageRouter
    const routerId = this.env.MESSAGE_ROUTER.idFromName('global');
    const routerStub = this.env.MESSAGE_ROUTER.get(routerId);
    
    await routerStub.fetch('http://internal/client-connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: this.clientState.deviceId,
        agent_id: this.clientState.agentId,
        tenant_id: this.clientState.tenantId,
        durable_object_id: this.state.id.toString(),
      }),
    });

    // Send hello message
    this.sendMessage({
      type: 'hello',
      role: 'client',
      device_id: this.clientState.deviceId,
      agent_id: this.clientState.agentId,
      tenant_id: this.clientState.tenantId,
      ts: Date.now(),
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async handleIncomingMessage(request: Request): Promise<Response> {
    if (!this.clientState) {
      return new Response('Client not connected', { status: 400 });
    }

    try {
      const message = await request.json();
      this.sendMessage(message);
      return new Response('OK');
    } catch (error) {
      console.error('Error handling incoming message for client:', error);
      return new Response('Error', { status: 500 });
    }
  }

  private async handleMessage(event: MessageEvent) {
    if (!this.clientState) return;

    this.clientState.lastActivity = Date.now();
    await this.state.storage.put('clientState', this.clientState);

    try {
      const message = JSON.parse(event.data as string);
      
      // Handle different message types
      switch (message.type) {
        case 'chat.request':
          await this.handleChatRequest(message);
          break;
          
        case 'pong':
          // Just update activity timestamp
          break;
          
        default:
          console.warn('Unknown message type from client:', message.type);
      }
    } catch (error) {
      console.error('Error handling client message:', error);
      this.sendError('Invalid message format');
    }
  }

  private async handleChatRequest(message: any) {
    if (!this.clientState) return;

    // Validate required fields
    if (!message.request_id || !message.agent_id || !message.session_id || !message.text) {
      this.sendError('Missing required fields in chat.request');
      return;
    }

    // Check message size limit
    if (message.text.length > 32 * 1024) {
      this.sendError('Message too large (max 32KB)');
      return;
    }

    // Ensure client can only send to their paired agents
    if (message.agent_id !== this.clientState.agentId) {
      this.sendError('Unauthorized agent access');
      return;
    }

    // Forward to MessageRouter
    const routerId = this.env.MESSAGE_ROUTER.idFromName('global');
    const routerStub = this.env.MESSAGE_ROUTER.get(routerId);
    
    await routerStub.fetch('http://internal/route-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'chat.request',
        from_client: this.clientState.deviceId,
        message: {
          ...message,
          device_id: this.clientState.deviceId,
          ts: Date.now(),
        },
      }),
    });
  }

  private async handleClose() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.clientState) {
      // Unregister from MessageRouter
      const routerId = this.env.MESSAGE_ROUTER.idFromName('global');
      const routerStub = this.env.MESSAGE_ROUTER.get(routerId);
      
      await routerStub.fetch('http://internal/client-disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: this.clientState.deviceId,
          agent_id: this.clientState.agentId,
        }),
      });

      await this.state.storage.delete('clientState');
    }
  }

  private handleError(error: any) {
    console.error('Client WebSocket error:', error);
    this.handleClose();
  }

  private sendMessage(message: any) {
    if (this.websocket && this.websocket.readyState === WebSocket.READY_STATE_OPEN) {
      this.websocket.send(JSON.stringify(message));
    }
  }

  private sendError(message: string, requestId?: string) {
    this.sendMessage({
      type: 'error',
      request_id: requestId,
      code: 'INVALID_MESSAGE',
      message,
      ts: Date.now(),
    });
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (!this.clientState) return;

      const now = Date.now();
      const timeSinceActivity = now - this.clientState.lastActivity;
      
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
}