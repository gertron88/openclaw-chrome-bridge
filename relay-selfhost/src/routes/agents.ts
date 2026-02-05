import { FastifyInstance } from 'fastify';
import { getDatabaseSync } from '../db/index.js';
import { verifyAccessToken, extractBearerToken } from '../auth/jwt.js';
import { messageSizeLimit, requireAuth, createRateLimit } from '../middleware/ratelimit.js';

interface AgentInfo {
  agent_id: string;
  display_name: string;
  online: boolean;
  last_seen_at?: number;
}

export async function agentRoutes(fastify: FastifyInstance) {
  const db = getDatabaseSync();

  /**
   * GET /api/agents
   * Returns list of agents paired with the authenticated device
   * Requires valid access token
   */
  fastify.get('/api/agents', {
    preHandler: [
      messageSizeLimit,
      requireAuth,
      createRateLimit({
        maxRequests: 30, // 30 requests per minute per IP
        windowMs: 60 * 1000,
        message: 'Too many agent list requests'
      })
    ],
    schema: {
      headers: {
        type: 'object',
        properties: {
          authorization: { type: 'string' }
        },
        required: ['authorization']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            agents: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  agent_id: { type: 'string' },
                  display_name: { type: 'string' },
                  online: { type: 'boolean' },
                  last_seen_at: { type: 'number' }
                }
              }
            }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Extract and verify access token
      const token = extractBearerToken(request.headers.authorization);
      if (!token) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid authorization header format'
        });
      }

      let payload;
      try {
        payload = await verifyAccessToken(token);
      } catch (error) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid or expired access token'
        });
      }

      // Get agents for this device
      const agents = db.getAgentsForDevice(payload.device_id);
      
      // Check online status from WebSocket connections
      // This would need to be integrated with the WebSocket server
      const agentList: AgentInfo[] = agents.map(agent => ({
        agent_id: agent.id,
        display_name: agent.display_name,
        online: isAgentOnline(agent.id), // This function needs to be implemented
        last_seen_at: agent.last_seen_at
      }));

      return {
        agents: agentList
      };

    } catch (error) {
      fastify.log.error('Error fetching agents: ' + (error instanceof Error ? error.message : String(error)));
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch agent list'
      });
    }
  });

  /**
   * GET /api/agents/:agent_id
   * Returns details for a specific agent
   * Requires valid access token and agent must be paired with the device
   */
  fastify.get<{
    Params: { agent_id: string };
  }>('/api/agents/:agent_id', {
    preHandler: [
      messageSizeLimit,
      requireAuth,
      createRateLimit({
        maxRequests: 60, // 60 requests per minute per IP
        windowMs: 60 * 1000,
        message: 'Too many agent detail requests'
      })
    ],
    schema: {
      params: {
        type: 'object',
        properties: {
          agent_id: { type: 'string' }
        },
        required: ['agent_id']
      },
      headers: {
        type: 'object',
        properties: {
          authorization: { type: 'string' }
        },
        required: ['authorization']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            agent_id: { type: 'string' },
            display_name: { type: 'string' },
            online: { type: 'boolean' },
            last_seen_at: { type: 'number' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { agent_id } = request.params;

      // Extract and verify access token
      const token = extractBearerToken(request.headers.authorization);
      if (!token) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid authorization header format'
        });
      }

      let payload;
      try {
        payload = await verifyAccessToken(token);
      } catch (error) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid or expired access token'
        });
      }

      // Check if agent is paired with this device
      const agents = db.getAgentsForDevice(payload.device_id);
      const agent = agents.find(a => a.id === agent_id);

      if (!agent) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Agent not found or not paired with this device'
        });
      }

      return {
        agent_id: agent.id,
        display_name: agent.display_name,
        online: isAgentOnline(agent.id),
        last_seen_at: agent.last_seen_at
      };

    } catch (error) {
      fastify.log.error('Error fetching agent details: ' + (error instanceof Error ? error.message : String(error)));
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch agent details'
      });
    }
  });
}

/**
 * Check if an agent is currently online
 * This function should be integrated with the WebSocket connection tracking
 */
function isAgentOnline(agentId: string): boolean {
  // TODO: Implement this by checking active WebSocket connections
  // For now, return false as a placeholder
  // This should check if there's an active WebSocket connection for this agent
  return false;
}