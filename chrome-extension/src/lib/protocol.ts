import { z } from 'zod';

// Base WebSocket message schema
export const WSMessageSchema = z.object({
  type: z.string(),
});

// Hello message (client auth)
export const HelloMessageSchema = z.object({
  type: z.literal('hello'),
  role: z.literal('client'),
  device_id: z.string(),
  tenant_id: z.string().optional(),
});

// Presence updates
export const PresenceMessageSchema = z.object({
  type: z.literal('presence'),
  agent_id: z.string(),
  online: z.boolean(),
  ts: z.union([z.string(), z.number()]),
});

// Chat request from client to agent
export const ChatRequestSchema = z.object({
  type: z.literal('chat.request'),
  request_id: z.string(),
  agent_id: z.string(),
  session_id: z.string(),
  text: z.string().max(32000), // 32KB limit per spec
  ts: z.string(),
});

// Chat response from agent to client
export const ChatResponseSchema = z.object({
  type: z.literal('chat.response'),
  request_id: z.string(),
  agent_id: z.string(),
  session_id: z.string(),
  reply: z.string().optional(),
  text: z.string().optional(),
  message: z.string().optional(),
  ts: z.union([z.string(), z.number()]),
}).refine((value) => Boolean(value.reply || value.text || value.message), {
  message: 'chat.response requires reply/text/message',
});

// Error messages
export const ErrorMessageSchema = z.object({
  type: z.literal('error'),
  request_id: z.string().optional(),
  code: z.string(),
  message: z.string(),
});

// Union of all message types
export const IncomingMessageSchema = z.union([
  PresenceMessageSchema,
  ChatResponseSchema,
  ErrorMessageSchema,
]);

export const OutgoingMessageSchema = z.union([
  HelloMessageSchema,
  ChatRequestSchema,
]);

// REST API schemas
export const PairStartRequestSchema = z.object({
  agent_secret: z.string(),
  agent_id: z.string(),
});

export const PairStartResponseSchema = z.object({
  code: z.string(),
  expires_at: z.string(),
  agent_id: z.string(),
});

export const PairCompleteRequestSchema = z.object({
  code: z.string(),
  device_label: z.string(),
});

export const PairCompleteResponseSchema = z.object({
  refresh_token: z.string(),
  access_token: z.string(),
  expires_in: z.number(),
  agent_id: z.string(),
  agent_display_name: z.string(),
  device_id: z.string(),
});

export const TokenRefreshRequestSchema = z.object({
  refresh_token: z.string(),
});

export const TokenRefreshResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});

export const AgentsListResponseSchema = z.object({
  agents: z.array(z.object({
    id: z.string(),
    display_name: z.string(),
    online: z.boolean(),
    last_seen: z.string().optional(),
  })),
});

// Type exports for TypeScript
export type HelloMessage = z.infer<typeof HelloMessageSchema>;
export type PresenceMessage = z.infer<typeof PresenceMessageSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type IncomingMessage = z.infer<typeof IncomingMessageSchema>;
export type OutgoingMessage = z.infer<typeof OutgoingMessageSchema>;

export type PairStartRequest = z.infer<typeof PairStartRequestSchema>;
export type PairStartResponse = z.infer<typeof PairStartResponseSchema>;
export type PairCompleteRequest = z.infer<typeof PairCompleteRequestSchema>;
export type PairCompleteResponse = z.infer<typeof PairCompleteResponseSchema>;
export type TokenRefreshRequest = z.infer<typeof TokenRefreshRequestSchema>;
export type TokenRefreshResponse = z.infer<typeof TokenRefreshResponseSchema>;
export type AgentsListResponse = z.infer<typeof AgentsListResponseSchema>;

// Validation helpers
export function validateIncomingMessage(data: unknown): IncomingMessage {
  return IncomingMessageSchema.parse(data);
}

export function validateOutgoingMessage(data: unknown): OutgoingMessage {
  return OutgoingMessageSchema.parse(data);
}

// Constants
export const MESSAGE_SIZE_LIMIT = 32000; // 32KB
export const DEFAULT_RELAY_URL = 'wss://openclaw-chrome-relay.gertron88.workers.dev';
export const AUTH_HEADER = 'Authorization';
export const WEBSOCKET_TIMEOUT = 30000; // 30s
export const RECONNECT_DELAY = 5000; // 5s