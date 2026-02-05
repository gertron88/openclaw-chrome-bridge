import { z } from 'zod';
import { WS_MESSAGE_TYPES, ROLES, ERROR_CODES, MESSAGE_LIMITS } from './constants';

/**
 * Hello message - sent when establishing WebSocket connection
 * Role indicates if this is an agent connector or client (Chrome extension)
 */
export const HelloMessageSchema = z.object({
  type: z.literal(WS_MESSAGE_TYPES.HELLO),
  role: z.enum([ROLES.AGENT, ROLES.CLIENT]),
  agent_id: z.string().optional(),
  device_id: z.string().optional(),
  tenant_id: z.string().optional(),
  ts: z.number().optional(),
});

/**
 * Presence message - indicates agent online/offline status
 */
export const PresenceMessageSchema = z.object({
  type: z.literal(WS_MESSAGE_TYPES.PRESENCE),
  agent_id: z.string(),
  online: z.boolean(),
  ts: z.number(),
});

/**
 * Chat request message - sent from client to agent
 */
export const ChatRequestMessageSchema = z.object({
  type: z.literal(WS_MESSAGE_TYPES.CHAT_REQUEST),
  request_id: z.string(),
  agent_id: z.string(),
  session_id: z.string(),
  text: z.string().max(MESSAGE_LIMITS.MAX_TEXT_LENGTH),
  ts: z.number(),
});

/**
 * Chat response message - sent from agent back to client
 */
export const ChatResponseMessageSchema = z.object({
  type: z.literal(WS_MESSAGE_TYPES.CHAT_RESPONSE),
  request_id: z.string(),
  agent_id: z.string(),
  session_id: z.string(),
  reply: z.string().max(MESSAGE_LIMITS.MAX_TEXT_LENGTH),
  ts: z.number(),
});

/**
 * Error message - sent when something goes wrong
 */
export const ErrorMessageSchema = z.object({
  type: z.literal(WS_MESSAGE_TYPES.ERROR),
  request_id: z.string().optional(), // May not have request_id for connection errors
  code: z.enum([
    ERROR_CODES.INVALID_MESSAGE,
    ERROR_CODES.UNAUTHORIZED,
    ERROR_CODES.AGENT_OFFLINE,
    ERROR_CODES.MESSAGE_TOO_LARGE,
    ERROR_CODES.RATE_LIMITED,
    ERROR_CODES.TOKEN_EXPIRED,
    ERROR_CODES.TOKEN_INVALID,
    ERROR_CODES.INTERNAL_ERROR,
  ]),
  message: z.string(),
  ts: z.number().optional(),
});

/**
 * Union type for all possible WebSocket messages
 */
export const WebSocketMessageSchema = z.discriminatedUnion('type', [
  HelloMessageSchema,
  PresenceMessageSchema,
  ChatRequestMessageSchema,
  ChatResponseMessageSchema,
  ErrorMessageSchema,
]);

// TypeScript type inference
export type HelloMessage = z.infer<typeof HelloMessageSchema>;
export type PresenceMessage = z.infer<typeof PresenceMessageSchema>;
export type ChatRequestMessage = z.infer<typeof ChatRequestMessageSchema>;
export type ChatResponseMessage = z.infer<typeof ChatResponseMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

// Helper type guards
export const isHelloMessage = (msg: unknown): msg is HelloMessage => 
  HelloMessageSchema.safeParse(msg).success;

export const isPresenceMessage = (msg: unknown): msg is PresenceMessage => 
  PresenceMessageSchema.safeParse(msg).success;

export const isChatRequestMessage = (msg: unknown): msg is ChatRequestMessage => 
  ChatRequestMessageSchema.safeParse(msg).success;

export const isChatResponseMessage = (msg: unknown): msg is ChatResponseMessage => 
  ChatResponseMessageSchema.safeParse(msg).success;

export const isErrorMessage = (msg: unknown): msg is ErrorMessage => 
  ErrorMessageSchema.safeParse(msg).success;