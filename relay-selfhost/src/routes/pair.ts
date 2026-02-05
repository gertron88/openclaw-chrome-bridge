import { FastifyInstance } from 'fastify';
import { getDatabaseSync } from '../db/index.js';
import { generatePairingCode, createTokenPair, generateDeviceId } from '../auth/tokens.js';
import { pairingRateLimit, messageSizeLimit } from '../middleware/ratelimit.js';

interface StartPairingRequest {
  Body: {
    agent_id: string;
    agent_secret: string;
    display_name?: string;
  };
}

interface CompletePairingRequest {
  Body: {
    pairing_code: string;
    device_label: string;
  };
}

export async function pairRoutes(fastify: FastifyInstance) {
  const db = getDatabaseSync();

  /**
   * POST /api/pair/start
   * Initiates pairing process for an agent
   * Requires agent authentication via agent_secret
   */
  fastify.post<StartPairingRequest>('/api/pair/start', {
    preHandler: [messageSizeLimit, pairingRateLimit],
    schema: {
      body: {
        type: 'object',
        required: ['agent_id', 'agent_secret'],
        properties: {
          agent_id: { type: 'string' },
          agent_secret: { type: 'string' },
          display_name: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            pairing_code: { type: 'string' },
            expires_at: { type: 'number' },
            agent_id: { type: 'string' }
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
    const { agent_id, agent_secret, display_name } = request.body;

    try {
      // Verify agent exists or create new one
      let agent = db.getAgentBySecret(agent_secret);
      
      if (!agent) {
        // Create new agent
        if (!display_name) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'display_name is required for new agents'
          });
        }
        
        agent = db.createAgent({
          id: agent_id,
          display_name,
          agent_secret
        });
      } else if (agent.id !== agent_id) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Agent ID mismatch'
        });
      }

      // Generate pairing code and expiration
      const pairingCode = generatePairingCode();
      const expiresAt = Math.floor(Date.now() / 1000) + (10 * 60); // 10 minutes

      // Create pairing record
      db.createPairing({
        agent_id: agent.id,
        device_id: '', // Will be set when pairing is completed
        pairing_code: pairingCode,
        expires_at: expiresAt,
        status: 'pending'
      });

      return {
        pairing_code: pairingCode,
        expires_at: expiresAt,
        agent_id: agent.id
      };

    } catch (error) {
      fastify.log.error('Error starting pairing: ' + (error instanceof Error ? error.message : String(error)));
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to start pairing process'
      });
    }
  });

  /**
   * POST /api/pair/complete
   * Completes pairing process using pairing code
   * Public endpoint (no authentication required)
   */
  fastify.post<CompletePairingRequest>('/api/pair/complete', {
    preHandler: [messageSizeLimit, pairingRateLimit],
    schema: {
      body: {
        type: 'object',
        required: ['pairing_code', 'device_label'],
        properties: {
          pairing_code: { type: 'string' },
          device_label: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            access_token: { type: 'string' },
            refresh_token: { type: 'string' },
            expires_in: { type: 'number' },
            agent_id: { type: 'string' },
            agent_display_name: { type: 'string' },
            device_id: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { pairing_code, device_label } = request.body;

    try {
      // Find pairing by code
      const pairing = db.getPairingByCode(pairing_code);
      
      if (!pairing) {
        return reply.status(400).send({
          error: 'Invalid Code',
          message: 'Pairing code not found or expired'
        });
      }

      // Check if pairing is still valid
      const now = Math.floor(Date.now() / 1000);
      if (pairing.expires_at && pairing.expires_at < now) {
        return reply.status(400).send({
          error: 'Code Expired',
          message: 'Pairing code has expired'
        });
      }

      if (pairing.status !== 'pending') {
        return reply.status(400).send({
          error: 'Code Used',
          message: 'Pairing code has already been used'
        });
      }

      // Get agent information
      const agent = db.getAgentById(pairing.agent_id);
      if (!agent) {
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Agent not found'
        });
      }

      // Generate device ID and create device
      const deviceId = generateDeviceId();
      
      // Create or update device
      db.createDevice({
        id: deviceId,
        device_label
      });

      // Complete pairing
      db.completePairing(pairing.id, deviceId);

      // Generate token pair
      const tokens = await createTokenPair(agent.id, deviceId);

      return {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_in: tokens.expiresIn,
        agent_id: agent.id,
        agent_display_name: agent.display_name,
        device_id: deviceId
      };

    } catch (error) {
      fastify.log.error('Error completing pairing: ' + (error instanceof Error ? error.message : String(error)));
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to complete pairing process'
      });
    }
  });
}