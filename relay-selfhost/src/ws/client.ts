import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { verifyAccessToken } from '../auth/jwt.js';
import { getDatabaseSync } from '../db/index.js';
import { CONFIG } from '../config.js';

export interface ClientConnection {
  socket: WebSocket;
  deviceId: string;
  connectedAt: number;
  lastPing: number;
  sessionId: string;
}

// Global map to track client connections by session
const clientConnections = new Map<string, ClientConnection>();

// Import router functions - will be set by router.ts
let sendToAgent: (agentId: string, message: any) => void;
let broadcastToClients: (agentId: string, message: any) => void;

export function setRouterFunctions(
  sendAgent: (agentId: string, message: any) => void,
  broadcast: (agentId: string, message: any) => void
) {
  sendToAgent = sendAgent;
  broadcastToClients = broadcast;
}

export async function setupClientWebSocket(fastify: FastifyInstance) {
  const db = getDatabaseSync();

  fastify.register(async function (fastify) {
    fastify.get('/ws/client', { websocket: true }, (connection, request) => {
      const socket = connection;
      let clientConnection: ClientConnection | null = null;
      
      socket.on('message', async (data: Buffer) => {
        try {
          if (data.length > CONFIG.MAX_MESSAGE_SIZE) {
            socket.send(JSON.stringify({
              type: 'error',
              code: 'MESSAGE_TOO_LARGE',
              message: `Message exceeds maximum size of ${CONFIG.MAX_MESSAGE_SIZE} bytes`
            }));
            return;
          }

          const message = JSON.parse(data.toString());
          
          // Handle authentication on first message
          if (!clientConnection) {
            if (message.type !== 'hello') {
              socket.send(JSON.stringify({
                type: 'error',
                code: 'INVALID_HANDSHAKE',
                message: 'First message must be hello'
              }));
              socket.close();
              return;
            }

            // Verify access token
            if (!message.access_token) {
              socket.send(JSON.stringify({
                type: 'error',
                code: 'MISSING_TOKEN',
                message: 'access_token is required'
              }));
              socket.close();
              return;
            }

            let payload;
            try {
              payload = await verifyAccessToken(message.access_token);
            } catch (error) {
              socket.send(JSON.stringify({
                type: 'error',
                code: 'INVALID_TOKEN',
                message: 'Invalid or expired access token'
              }));
              socket.close();
              return;
            }

            // Generate session ID
            const sessionId = crypto.randomUUID();

            // Create client connection
            clientConnection = {
              socket,
              deviceId: payload.device_id,
              connectedAt: Date.now(),
              lastPing: Date.now(),
              sessionId
            };

            clientConnections.set(sessionId, clientConnection);

            // Send welcome message with paired agents
            const agents = db.getAgentsForDevice(payload.device_id);
            const agentList = agents.map(agent => ({
              agent_id: agent.id,
              display_name: agent.display_name,
              online: isAgentOnline(agent.id),
              last_seen_at: agent.last_seen_at
            }));

            socket.send(JSON.stringify({
              type: 'welcome',
              session_id: sessionId,
              device_id: payload.device_id,
              agents: agentList,
              ts: Date.now()
            }));

            return;
          }

          // Handle different message types
          switch (message.type) {
            case 'ping':
              clientConnection.lastPing = Date.now();
              socket.send(JSON.stringify({
                type: 'pong',
                ts: Date.now()
              }));
              break;

            case 'chat.request':
              // Validate required fields
              if (!message.request_id || !message.agent_id || !message.session_id || !message.text) {
                socket.send(JSON.stringify({
                  type: 'error',
                  request_id: message.request_id,
                  code: 'INVALID_MESSAGE',
                  message: 'Missing required fields: request_id, agent_id, session_id, text'
                }));
                return;
              }

              // Verify that the agent is paired with this device
              const agents = db.getAgentsForDevice(clientConnection.deviceId);
              const targetAgent = agents.find(a => a.id === message.agent_id);
              
              if (!targetAgent) {
                socket.send(JSON.stringify({
                  type: 'error',
                  request_id: message.request_id,
                  code: 'AGENT_NOT_PAIRED',
                  message: 'Agent not paired with this device'
                }));
                return;
              }

              // Forward request to agent
              const chatRequest = {
                type: 'chat.request',
                request_id: message.request_id,
                agent_id: message.agent_id,
                session_id: message.session_id,
                text: message.text,
                device_id: clientConnection.deviceId,
                ts: Date.now()
              };

              if (sendToAgent && typeof sendToAgent === 'function' && sendToAgent(message.agent_id, chatRequest)) {
                // Message sent successfully
                socket.send(JSON.stringify({
                  type: 'message_sent',
                  request_id: message.request_id,
                  agent_id: message.agent_id,
                  ts: Date.now()
                }));
              } else {
                // Agent is offline, queue message or send error
                socket.send(JSON.stringify({
                  type: 'error',
                  request_id: message.request_id,
                  code: 'AGENT_OFFLINE',
                  message: 'Agent is currently offline'
                }));
              }
              break;

            case 'presence.request':
              // Request current presence status for agents
              const deviceAgents = db.getAgentsForDevice(clientConnection.deviceId);
              const presenceList = deviceAgents.map(agent => ({
                type: 'presence',
                agent_id: agent.id,
                online: isAgentOnline(agent.id),
                ts: Date.now()
              }));

              presenceList.forEach(presence => {
                socket.send(JSON.stringify(presence));
              });
              break;

            default:
              socket.send(JSON.stringify({
                type: 'error',
                code: 'UNKNOWN_MESSAGE_TYPE',
                message: `Unknown message type: ${message.type}`
              }));
          }

        } catch (error) {
          fastify.log.error('Error processing client message: ' + (error instanceof Error ? error.message : String(error)));
          socket.send(JSON.stringify({
            type: 'error',
            code: 'PROCESSING_ERROR',
            message: 'Error processing message'
          }));
        }
      });

      socket.on('close', () => {
        if (clientConnection) {
          clientConnections.delete(clientConnection.sessionId);
        }
      });

      socket.on('error', (error: Error) => {
        fastify.log.error('Client WebSocket error: ' + error.message);
        if (clientConnection) {
          clientConnections.delete(clientConnection.sessionId);
        }
      });
    });
  });
}

/**
 * Send a message to all clients connected to a specific device
 */
export function sendToClientsForDevice(deviceId: string, message: any): void {
  for (const connection of clientConnections.values()) {
    if (connection.deviceId === deviceId && connection.socket.readyState === WebSocket.OPEN) {
      try {
        connection.socket.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending message to client:', error);
      }
    }
  }
}

/**
 * Send a message to a specific client session
 */
export function sendToClientSession(sessionId: string, message: any): boolean {
  const connection = clientConnections.get(sessionId);
  if (connection && connection.socket.readyState === WebSocket.OPEN) {
    try {
      connection.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Error sending message to client session:', error);
      return false;
    }
  }
  return false;
}

/**
 * Broadcast a message to all clients that have the specified agent paired
 */
export function broadcastToAgentClients(agentId: string, message: any): void {
  const db = getDatabaseSync();
  
  for (const connection of clientConnections.values()) {
    // Check if this device has the agent paired
    const agents = db.getAgentsForDevice(connection.deviceId);
    if (agents.some(agent => agent.id === agentId)) {
      if (connection.socket.readyState === WebSocket.OPEN) {
        try {
          connection.socket.send(JSON.stringify(message));
        } catch (error) {
          console.error('Error broadcasting to client:', error);
        }
      }
    }
  }
}

/**
 * Get all connected client sessions
 */
export function getConnectedClients(): string[] {
  return Array.from(clientConnections.keys());
}

/**
 * Check if an agent is online (this is imported from agent.ts)
 */
function isAgentOnline(agentId: string): boolean {
  // This will be implemented by the router to check agent connections
  return false;
}

/**
 * Cleanup stale connections
 */
export function cleanupStaleConnections(): void {
  const now = Date.now();
  const staleTimeout = 60000; // 60 seconds

  for (const [sessionId, connection] of clientConnections.entries()) {
    if (now - connection.lastPing > staleTimeout) {
      console.log(`Cleaning up stale client connection: ${sessionId}`);
      connection.socket.close();
      clientConnections.delete(sessionId);
    }
  }
}

// Setup cleanup interval
setInterval(cleanupStaleConnections, 30000); // Every 30 seconds