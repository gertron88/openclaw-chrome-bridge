/**
 * Environment bindings for Cloudflare Workers
 */
export interface CloudflareBindings {
  // D1 Database
  DB: D1Database;
  
  // Durable Objects
  AGENT_CONNECTION: DurableObjectNamespace;
  CLIENT_CONNECTION: DurableObjectNamespace;
  MESSAGE_ROUTER: DurableObjectNamespace;
  
  // Environment Variables/Secrets
  JWT_SECRET: string;
  AGENT_SECRET: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_ID?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  BILLING_SUCCESS_URL?: string;
  BILLING_CANCEL_URL?: string;
  BILLING_PORTAL_RETURN_URL?: string;
}

/**
 * Configuration constants
 */
export const CONFIG = {
  JWT: {
    ACCESS_TOKEN_TTL: 15 * 60, // 15 minutes in seconds
    REFRESH_TOKEN_TTL: 30 * 24 * 60 * 60, // 30 days in seconds
    ALGORITHM: 'HS256' as const,
    ISSUER: 'openclaw-chrome-relay',
  },
  
  PAIRING: {
    CODE_LENGTH: 8,
    CODE_TTL: 10 * 60, // 10 minutes in seconds
    MAX_ATTEMPTS: 5,
  },
  
  MESSAGE: {
    MAX_SIZE: 32 * 1024, // 32KB
    QUEUE_SIZE: 10,
    QUEUE_TTL: 60, // 60 seconds
  },
  
  RATE_LIMIT: {
    PAIRING_ATTEMPTS: 5,
    PAIRING_WINDOW: 60, // 1 minute
    MESSAGE_RATE: 60,
    MESSAGE_WINDOW: 60,
  },
} as const;

/**
 * Generate a random pairing code
 */
export function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  
  for (let i = 0; i < CONFIG.PAIRING.CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return code;
}