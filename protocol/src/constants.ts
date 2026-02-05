/**
 * Shared constants for OpenClaw Chrome Bridge protocol
 */

// Token expiry times
export const TOKEN_EXPIRY = {
  ACCESS_TOKEN_MINUTES: 15,
  ACCESS_TOKEN_MS: 15 * 60 * 1000, // 15 minutes
  REFRESH_TOKEN_DAYS: 30,
  REFRESH_TOKEN_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
} as const;

// Message size limits
export const MESSAGE_LIMITS = {
  MAX_MESSAGE_SIZE_BYTES: 32 * 1024, // 32KB
  MAX_TEXT_LENGTH: 30000, // Reserve some bytes for metadata
  MAX_QUEUE_MESSAGES: 10, // Max messages to queue when agent offline
  QUEUE_TIMEOUT_MS: 60 * 1000, // 60 seconds
} as const;

// Session limits
export const SESSION_LIMITS = {
  SCROLLBACK_EXPIRY_HOURS: 24,
  SCROLLBACK_EXPIRY_MS: 24 * 60 * 60 * 1000,
} as const;

// Rate limiting
export const RATE_LIMITS = {
  PAIRING_ATTEMPTS_PER_HOUR: 10,
  PAIRING_CODE_EXPIRY_MINUTES: 10,
  PAIRING_CODE_EXPIRY_MS: 10 * 60 * 1000,
} as const;

// WebSocket message types
export const WS_MESSAGE_TYPES = {
  HELLO: 'hello',
  PRESENCE: 'presence', 
  CHAT_REQUEST: 'chat.request',
  CHAT_RESPONSE: 'chat.response',
  ERROR: 'error',
} as const;

// Roles
export const ROLES = {
  AGENT: 'agent',
  CLIENT: 'client',
} as const;

// HTTP status codes for API responses
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// Error codes
export const ERROR_CODES = {
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  AGENT_OFFLINE: 'AGENT_OFFLINE',
  MESSAGE_TOO_LARGE: 'MESSAGE_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  PAIRING_EXPIRED: 'PAIRING_EXPIRED',
  PAIRING_INVALID: 'PAIRING_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;