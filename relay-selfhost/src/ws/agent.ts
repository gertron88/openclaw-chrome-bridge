import { FastifyInstance } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import { getDatabase } from '../db/index.js';
import { CONFIG } from '../config.js';

export interface AgentConnection {
  socket: SocketStream;
  agentId: string;
  connectedAt: number;
  lastPing: number;
}

// Global map to track agent connections
const agentConnections = new Map<string, AgentConnection>();

// Import router functions - will be set by router.ts
let broadcastToClients: (agentId: string, message: any) => void;
let handleClientMessage: (agentId: string, message: any) => void;

export function setRouterFunctions(
  broadcast: (agentId: string, message: any) => void,
  handleMessage: (agentId: string, message: any) => void
) {
  broadcastToClients = broadcast;
  handleClientMessage = handleMessage;
}

export async function setupAgentWebSocket(fastify: FastifyInstance) {
  const db = getDatabase();

  fastify.register(async function (fastify) {
    fastify.get('/ws/agent', { websocket: true }, (connection, request) => {
      const socket = connection.socket;
      let agentConnection: AgentConnection | null = null;
      
      // Extract agent_id from query params
      const url = new URL(request.url, `http://${request.headers.host}`);
      const agentId = url.searchParams.get('agent_id');
      
      if (!agentId) {
        socket.send(JSON.stringify({
          type: 'error',
          code: 'MISSING_AGENT_ID',
          message: 'agent_id parameter is required'
        }));
        socket.close();
        return;
      }

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
          if (!agentConnection) {
            if (message.type !== 'hello') {
              socket.send(JSON.stringify({
                type: 'error',
                code: 'INVALID_HANDSHAKE',
                message: 'First message must be hello'
              }));
              socket.close();
              return;
            }

            // Verify agent credentials
            const agent = db.getAgentBySecret(message.agent_secret);
            if (!agent || agent.id !== agentId) {
              socket.send(JSON.stringify({
                type: 'error',
                code: 'INVALID_CREDENTIALS',
                message: 'Invalid agent credentials'
              }));
              socket.close();
              return;
            }

            // Create agent connection
            agentConnection = {
              socket,
              agentId: agent.id,
              connectedAt: Date.now(),
              lastPing: Date.now()
            };

            agentConnections.set(agent.id, agentConnection);
            db.updateAgentLastSeen(agent.id);

            // Send welcome message
            socket.send(JSON.stringify({
              type: 'welcome',
              agent_id: agent.id,
              ts: Date.now()
            }));

            // Broadcast agent online status to clients
            if (broadcastToClients) {
              broadcastToClients(agent.id, {
                type: 'presence',
                agent_id: agent.id,
                online: true,
                ts: Date.now()
              });
            }

            return;
          }

          // Handle different message types
          switch (message.type) {
            case 'ping':
              agentConnection.lastPing = Date.now();
              socket.send(JSON.stringify({
                type: 'pong',
                ts: Date.now()
              }));
              break;

            case 'chat.response':
              // Validate required fields
              if (!message.request_id || !message.session_id || !message.reply) {
                socket.send(JSON.stringify({
                  type: 'error',
                  request_id: message.request_id,
                  code: 'INVALID_MESSAGE',
                  message: 'Missing required fields: request_id, session_id, reply'
                }));
                return;
              }

              // Forward response to clients
              if (handleClientMessage) {
                handleClientMessage(agentConnection.agentId, {
                  type: 'chat.response',
                  request_id: message.request_id,
                  agent_id: agentConnection.agentId,
                  session_id: message.session_id,
                  reply: message.reply,
                  ts: Date.now()
                });
              }
              break;

            case 'presence':
              // Agent is updating presence status
              agentConnection.lastPing = Date.now();
              if (broadcastToClients) {
                broadcastToClients(agentConnection.agentId, {
                  type: 'presence',
                  agent_id: agentConnection.agentId,
                  online: message.online !== false,
                  ts: Date.now()
                });
              }
              break;

            default:
              socket.send(JSON.stringify({
                type: 'error',
                code: 'UNKNOWN_MESSAGE_TYPE',
                message: `Unknown message type: ${message.type}`
              }));
          }

        } catch (error) {
          fastify.log.error('Error processing agent message:', error);
          socket.send(JSON.stringify({
            type: 'error',
            code: 'PROCESSING_ERROR',
            message: 'Error processing message'
          }));
        }
      });

      socket.on('close', () => {
        if (agentConnection) {
          agentConnections.delete(agentConnection.agentId);
          
          // Broadcast agent offline status
          if (broadcastToClients) {
            broadcastToClients(agentConnection.agentId, {
              type: 'presence',
              agent_id: agentConnection.agentId,
              online: false,
              ts: Date.now()
            });
          }
        }
      });

      socket.on('error', (error) => {
        fastify.log.error('Agent WebSocket error:', error);
        if (agentConnection) {
          agentConnections.delete(agentConnection.agentId);
        }
      });
    });
  });
}

/**
 * Send a message to a specific agent
 */
export function sendToAgent(agentId: string, message: any): boolean {
  const connection = agentConnections.get(agentId);
  if (connection && connection.socket.readyState === 1) { // WebSocket.OPEN
    try {
      connection.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Error sending message to agent:', error);
      return false;
    }
  }
  return false;
}

/**
 * Check if an agent is currently connected
 */
export function isAgentOnline(agentId: string): boolean {
  const connection = agentConnections.get(agentId);
  return connection !== undefined && connection.socket.readyState === 1;
}

/**
 * Get all connected agents
 */
export function getConnectedAgents(): string[] {
  return Array.from(agentConnections.keys());
}

/**
 * Cleanup stale connections
 */
export function cleanupStaleConnections(): void {
  const now = Date.now();
  const staleTimeout = 60000; // 60 seconds

  for (const [agentId, connection] of agentConnections.entries()) {
    if (now - connection.lastPing > staleTimeout) {
      console.log(`Cleaning up stale connection for agent: ${agentId}`);
      connection.socket.close();
      agentConnections.delete(agentId);
    }
  }
}

// Setup cleanup interval
setInterval(cleanupStaleConnections, 30000); // Every 30 seconds