import { type CloudflareBindings, CONFIG } from '@/config';

interface QueuedMessage {
  message: any;
  timestamp: number;
  attempts: number;
}

interface AgentConnection {
  agentId: string;
  durableObjectId: string;
  connectedAt: number;
  lastSeen: number;
}

interface ClientConnection {
  deviceId: string;
  agentId: string;
  durableObjectId: string;
  connectedAt: number;
  lastSeen: number;
}

/**
 * Global message router - coordinates message passing between agents and clients
 * This is a singleton Durable Object (using fixed name 'global')
 */
export class MessageRouter {
  private state: DurableObjectState;
  private env: CloudflareBindings;
  
  constructor(state: DurableObjectState, env: CloudflareBindings) {
    this.state = state;
    this.env = env;
    
    // Clean up old connections and queued messages periodically
    this.scheduleCleanup();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    try {
      switch (url.pathname) {
        case '/route-message':
          return this.handleRouteMessage(request);
          
        case '/client-connect':
          return this.handleClientConnect(request);
          
        case '/client-disconnect':
          return this.handleClientDisconnect(request);
          
        case '/agent-connect':
          return this.handleAgentConnect(request);
          
        case '/agent-disconnect':
          return this.handleAgentDisconnect(request);
          
        case '/presence-update':
          return this.handlePresenceUpdate(request);
          
        case '/status':
          return this.handleStatus(request);
          
        default:
          return new Response('Not found', { status: 404 });
      }
    } catch (error) {
      console.error('MessageRouter error:', error);
      return new Response('Internal error', { status: 500 });
    }
  }

  private async handleRouteMessage(request: Request): Promise<Response> {
    const { type, from_client, from_agent, message } = await request.json();
    
    if (type === 'chat.request' && from_client) {
      return this.routeChatRequest(message);
    }
    
    if (type === 'chat.response' && from_agent) {
      return this.routeChatResponse(message);
    }
    
    return new Response('Invalid message type', { status: 400 });
  }

  private async routeChatRequest(message: any): Promise<Response> {
    const { agent_id, request_id } = message;
    
    // Find connected agent
    const agentConnections = await this.state.storage.get('agentConnections') as Map<string, AgentConnection> || new Map();
    const agentConn = agentConnections.get(agent_id);
    
    if (!agentConn) {
      // Agent not connected - try to queue message
      return this.queueMessage(agent_id, message, 'agent');
    }
    
    try {
      // Forward to agent
      const agentDO = this.env.AGENT_CONNECTION.get(this.env.AGENT_CONNECTION.idFromString(agentConn.durableObjectId));
      await agentDO.fetch('http://internal/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      
      // Update last seen
      agentConn.lastSeen = Date.now();
      agentConnections.set(agent_id, agentConn);
      await this.state.storage.put('agentConnections', agentConnections);
      
      return new Response('Delivered');
      
    } catch (error) {
      console.error('Failed to deliver message to agent:', error);
      return this.queueMessage(agent_id, message, 'agent');
    }
  }

  private async routeChatResponse(message: any): Promise<Response> {
    const { agent_id, request_id } = message;
    
    // Find clients connected to this agent
    const clientConnections = await this.state.storage.get('clientConnections') as Map<string, ClientConnection> || new Map();
    const agentClients = Array.from(clientConnections.values()).filter(conn => conn.agentId === agent_id);
    
    if (agentClients.length === 0) {
      // No clients connected - could queue or drop
      console.warn(`No clients connected for agent ${agent_id}, dropping response`);
      return new Response('No connected clients');
    }
    
    // Send to all connected clients for this agent
    const results = await Promise.allSettled(
      agentClients.map(async (clientConn) => {
        const clientDO = this.env.CLIENT_CONNECTION.get(this.env.CLIENT_CONNECTION.idFromString(clientConn.durableObjectId));
        await clientDO.fetch('http://internal/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });
        
        // Update last seen
        clientConn.lastSeen = Date.now();
        return clientConn;
      })
    );
    
    // Update successful connections
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        clientConnections.set(agentClients[index].deviceId, result.value);
      }
    });
    
    await this.state.storage.put('clientConnections', clientConnections);
    
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    return new Response(`Delivered to ${successCount}/${agentClients.length} clients`);
  }

  private async queueMessage(targetId: string, message: any, type: 'agent' | 'client'): Promise<Response> {
    const queueKey = `queue_${type}_${targetId}`;
    const queue = await this.state.storage.get(queueKey) as QueuedMessage[] || [];
    
    // Check queue limits
    if (queue.length >= CONFIG.MESSAGE.QUEUE_SIZE) {
      return new Response('Queue full', { status: 503 });
    }
    
    const queuedMessage: QueuedMessage = {
      message,
      timestamp: Date.now(),
      attempts: 0,
    };
    
    queue.push(queuedMessage);
    await this.state.storage.put(queueKey, queue);
    
    return new Response('Queued');
  }

  private async handleClientConnect(request: Request): Promise<Response> {
    const { device_id, agent_id, tenant_id, durable_object_id } = await request.json();
    
    const clientConnections = await this.state.storage.get('clientConnections') as Map<string, ClientConnection> || new Map();
    
    const connection: ClientConnection = {
      deviceId: device_id,
      agentId: agent_id,
      durableObjectId: durable_object_id,
      connectedAt: Date.now(),
      lastSeen: Date.now(),
    };
    
    clientConnections.set(device_id, connection);
    await this.state.storage.put('clientConnections', clientConnections);
    
    // Process any queued messages for this client
    await this.processQueuedMessages(device_id, 'client');
    
    return new Response('Client registered');
  }

  private async handleClientDisconnect(request: Request): Promise<Response> {
    const { device_id } = await request.json();
    
    const clientConnections = await this.state.storage.get('clientConnections') as Map<string, ClientConnection> || new Map();
    clientConnections.delete(device_id);
    await this.state.storage.put('clientConnections', clientConnections);
    
    return new Response('Client unregistered');
  }

  private async handleAgentConnect(request: Request): Promise<Response> {
    const { agent_id, durable_object_id } = await request.json();
    
    const agentConnections = await this.state.storage.get('agentConnections') as Map<string, AgentConnection> || new Map();
    
    const connection: AgentConnection = {
      agentId: agent_id,
      durableObjectId: durable_object_id,
      connectedAt: Date.now(),
      lastSeen: Date.now(),
    };
    
    agentConnections.set(agent_id, connection);
    await this.state.storage.put('agentConnections', agentConnections);
    
    // Process any queued messages for this agent
    await this.processQueuedMessages(agent_id, 'agent');
    
    // Broadcast presence update to clients
    await this.broadcastPresenceUpdate(agent_id, true);
    
    return new Response('Agent registered');
  }

  private async handleAgentDisconnect(request: Request): Promise<Response> {
    const { agent_id } = await request.json();
    
    const agentConnections = await this.state.storage.get('agentConnections') as Map<string, AgentConnection> || new Map();
    agentConnections.delete(agent_id);
    await this.state.storage.put('agentConnections', agentConnections);
    
    // Broadcast presence update to clients
    await this.broadcastPresenceUpdate(agent_id, false);
    
    return new Response('Agent unregistered');
  }

  private async handlePresenceUpdate(request: Request): Promise<Response> {
    const { agent_id, online } = await request.json();
    
    await this.broadcastPresenceUpdate(agent_id, online);
    
    return new Response('Presence updated');
  }

  private async handleStatus(request: Request): Promise<Response> {
    const agentConnections = await this.state.storage.get('agentConnections') as Map<string, AgentConnection> || new Map();
    const clientConnections = await this.state.storage.get('clientConnections') as Map<string, ClientConnection> || new Map();
    
    return new Response(JSON.stringify({
      agents: Array.from(agentConnections.values()),
      clients: Array.from(clientConnections.values()),
      timestamp: Date.now(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async processQueuedMessages(targetId: string, type: 'agent' | 'client'): Promise<void> {
    const queueKey = `queue_${type}_${targetId}`;
    const queue = await this.state.storage.get(queueKey) as QueuedMessage[] || [];
    
    if (queue.length === 0) return;
    
    const now = Date.now();
    const validMessages = queue.filter(qm => 
      (now - qm.timestamp) < CONFIG.MESSAGE.QUEUE_TTL * 1000 && 
      qm.attempts < 3
    );
    
    // Try to deliver queued messages
    for (const queuedMessage of validMessages) {
      try {
        if (type === 'agent') {
          await this.routeChatRequest(queuedMessage.message);
        } else {
          await this.routeChatResponse(queuedMessage.message);
        }
      } catch (error) {
        queuedMessage.attempts++;
        console.error(`Failed to deliver queued message (attempt ${queuedMessage.attempts}):`, error);
      }
    }
    
    // Clear the queue
    await this.state.storage.delete(queueKey);
  }

  private async broadcastPresenceUpdate(agentId: string, online: boolean): Promise<void> {
    const clientConnections = await this.state.storage.get('clientConnections') as Map<string, ClientConnection> || new Map();
    const agentClients = Array.from(clientConnections.values()).filter(conn => conn.agentId === agentId);
    
    const presenceMessage = {
      type: 'presence',
      agent_id: agentId,
      online,
      ts: Date.now(),
    };
    
    // Send presence update to all clients of this agent
    await Promise.allSettled(
      agentClients.map(async (clientConn) => {
        const clientDO = this.env.CLIENT_CONNECTION.get(this.env.CLIENT_CONNECTION.idFromString(clientConn.durableObjectId));
        await clientDO.fetch('http://internal/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(presenceMessage),
        });
      })
    );
  }

  private scheduleCleanup(): void {
    // Clean up stale connections every 10 minutes
    setInterval(async () => {
      const now = Date.now();
      const staleThreshold = 10 * 60 * 1000; // 10 minutes
      
      // Clean agent connections
      const agentConnections = await this.state.storage.get('agentConnections') as Map<string, AgentConnection> || new Map();
      for (const [agentId, conn] of agentConnections.entries()) {
        if (now - conn.lastSeen > staleThreshold) {
          agentConnections.delete(agentId);
          await this.broadcastPresenceUpdate(agentId, false);
        }
      }
      await this.state.storage.put('agentConnections', agentConnections);
      
      // Clean client connections
      const clientConnections = await this.state.storage.get('clientConnections') as Map<string, ClientConnection> || new Map();
      for (const [deviceId, conn] of clientConnections.entries()) {
        if (now - conn.lastSeen > staleThreshold) {
          clientConnections.delete(deviceId);
        }
      }
      await this.state.storage.put('clientConnections', clientConnections);
      
    }, 10 * 60 * 1000); // Every 10 minutes
  }
}