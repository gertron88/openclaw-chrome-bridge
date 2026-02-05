import { FastifyRequest, FastifyReply } from 'fastify';
import { getDatabaseSync } from '../db/index.js';
import { CONFIG } from '../config.js';

/**
 * Extract client IP address from request
 */
function getClientIP(request: FastifyRequest): string {
  // Check for forwarded IP from proxy
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  
  // Check for real IP header
  const realIP = request.headers['x-real-ip'];
  if (realIP && typeof realIP === 'string') {
    return realIP.trim();
  }
  
  // Fallback to connection remote address
  return request.socket.remoteAddress || 'unknown';
}

/**
 * Rate limiting middleware for pairing endpoints
 */
export async function pairingRateLimit(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const db = getDatabaseSync();
  const clientIP = getClientIP(request);
  
  const maxAttempts = CONFIG.PAIRING_RATE_LIMIT;
  const windowMs = 60 * 60 * 1000; // 1 hour
  
  const allowed = db.checkRateLimit(clientIP, maxAttempts, windowMs);
  
  if (!allowed) {
    reply.status(429).send({
      error: 'Rate limit exceeded',
      message: `Too many pairing attempts. Maximum ${maxAttempts} attempts per hour.`,
      retryAfter: 3600 // 1 hour in seconds
    });
    return;
  }
}

/**
 * General rate limiting middleware
 */
export function createRateLimit(options: {
  maxRequests: number;
  windowMs: number;
  message?: string;
}) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const db = getDatabaseSync();
    const clientIP = getClientIP(request);
    
    const allowed = db.checkRateLimit(clientIP, options.maxRequests, options.windowMs);
    
    if (!allowed) {
      reply.status(429).send({
        error: 'Rate limit exceeded',
        message: options.message || `Too many requests. Maximum ${options.maxRequests} requests per ${Math.floor(options.windowMs / 1000)} seconds.`,
        retryAfter: Math.floor(options.windowMs / 1000)
      });
      return;
    }
  };
}

/**
 * Middleware to check message size limits
 */
export async function messageSizeLimit(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const contentLength = request.headers['content-length'];
  
  if (contentLength && parseInt(contentLength) > CONFIG.MAX_MESSAGE_SIZE) {
    reply.status(413).send({
      error: 'Payload too large',
      message: `Message size exceeds maximum allowed size of ${CONFIG.MAX_MESSAGE_SIZE} bytes`,
      maxSize: CONFIG.MAX_MESSAGE_SIZE
    });
    return;
  }
}

/**
 * Authentication middleware for API endpoints
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header'
    });
    return;
  }
  
  // Token validation will be handled by individual routes
  // This middleware just checks that the header format is correct
}

/**
 * CORS middleware for development
 */
export async function corsMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (CONFIG.NODE_ENV === 'development') {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (request.method === 'OPTIONS') {
      reply.status(200).send();
      return;
    }
  }
}

/**
 * Security headers middleware
 */
export async function securityHeaders(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  if (CONFIG.IS_PRODUCTION) {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}