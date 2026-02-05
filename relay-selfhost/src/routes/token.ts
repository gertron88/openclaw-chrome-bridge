import { FastifyInstance } from 'fastify';
import { refreshAccessToken } from '../auth/tokens.js';
import { messageSizeLimit, createRateLimit } from '../middleware/ratelimit.js';

interface RefreshTokenRequest {
  Body: {
    refresh_token: string;
  };
}

export async function tokenRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/token/refresh
   * Refreshes an access token using a refresh token
   * Public endpoint but rate limited
   */
  fastify.post<RefreshTokenRequest>('/api/token/refresh', {
    preHandler: [
      messageSizeLimit,
      createRateLimit({
        maxRequests: 10, // 10 refresh attempts per minute per IP
        windowMs: 60 * 1000,
        message: 'Too many token refresh attempts'
      })
    ],
    schema: {
      body: {
        type: 'object',
        required: ['refresh_token'],
        properties: {
          refresh_token: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            access_token: { type: 'string' },
            refresh_token: { type: 'string' },
            expires_in: { type: 'number' },
            token_type: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
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
    const { refresh_token } = request.body;

    if (!refresh_token) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'refresh_token is required'
      });
    }

    try {
      const tokens = await refreshAccessToken(refresh_token);

      return {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_in: tokens.expiresIn,
        token_type: 'Bearer'
      };

    } catch (error) {
      fastify.log.error('Error refreshing token:', error);
      
      // Distinguish between client errors and server errors
      if (error.message.includes('Invalid refresh token') || 
          error.message.includes('not found') || 
          error.message.includes('expired') ||
          error.message.includes('mismatch')) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid or expired refresh token'
        });
      }

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to refresh token'
      });
    }
  });

  /**
   * POST /api/token/revoke
   * Revokes a refresh token
   * Requires the refresh token to be provided
   */
  fastify.post<RefreshTokenRequest>('/api/token/revoke', {
    preHandler: [
      messageSizeLimit,
      createRateLimit({
        maxRequests: 20, // 20 revoke attempts per minute per IP
        windowMs: 60 * 1000,
        message: 'Too many token revoke attempts'
      })
    ],
    schema: {
      body: {
        type: 'object',
        required: ['refresh_token'],
        properties: {
          refresh_token: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
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
    const { refresh_token } = request.body;

    if (!refresh_token) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'refresh_token is required'
      });
    }

    try {
      // Import here to avoid circular dependency
      const { revokeRefreshToken } = await import('../auth/tokens.js');
      await revokeRefreshToken(refresh_token);

      return {
        message: 'Token revoked successfully'
      };

    } catch (error) {
      fastify.log.error('Error revoking token:', error);
      
      // For security, we don't want to reveal whether the token existed or not
      // Always return success for revoke operations
      return {
        message: 'Token revoked successfully'
      };
    }
  });
}