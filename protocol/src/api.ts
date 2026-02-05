import { z } from 'zod';
import { TOKEN_EXPIRY } from './constants';

/**
 * Pairing flow schemas
 */

// POST /api/pair/start - Agent requests pairing code
export const PairStartRequestSchema = z.object({
  agent_id: z.string(),
  agent_display_name: z.string().optional(),
  tenant_id: z.string().optional(),
});

export const PairStartResponseSchema = z.object({
  code: z.string(),
  expires_at: z.number(), // Unix timestamp
  agent_id: z.string(),
});

// POST /api/pair/complete - Client exchanges pairing code for tokens
export const PairCompleteRequestSchema = z.object({
  code: z.string(),
  device_label: z.string().optional(),
});

export const PairCompleteResponseSchema = z.object({
  refresh_token: z.string(),
  access_token: z.string(),
  agent_id: z.string(),
  agent_display_name: z.string(),
  expires_in: z.number().default(TOKEN_EXPIRY.ACCESS_TOKEN_MS), // milliseconds
});

/**
 * Token management schemas
 */

// POST /api/token/refresh - Refresh access token
export const TokenRefreshRequestSchema = z.object({
  refresh_token: z.string(),
});

export const TokenRefreshResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(), // New refresh token (rotation)
  expires_in: z.number(), // Access token expiry in milliseconds
});

/**
 * Agent listing schemas
 */

// Agent info object
export const AgentInfoSchema = z.object({
  agent_id: z.string(),
  agent_display_name: z.string(),
  online: z.boolean(),
  last_seen: z.number().optional(), // Unix timestamp
  tenant_id: z.string().optional(),
});

// GET /api/agents - List paired agents
export const AgentsListResponseSchema = z.object({
  agents: z.array(AgentInfoSchema),
});

/**
 * Common API response wrapper
 */
export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

export const ApiSuccessResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

/**
 * TypeScript type inference
 */
export type PairStartRequest = z.infer<typeof PairStartRequestSchema>;
export type PairStartResponse = z.infer<typeof PairStartResponseSchema>;
export type PairCompleteRequest = z.infer<typeof PairCompleteRequestSchema>;
export type PairCompleteResponse = z.infer<typeof PairCompleteResponseSchema>;

export type TokenRefreshRequest = z.infer<typeof TokenRefreshRequestSchema>;
export type TokenRefreshResponse = z.infer<typeof TokenRefreshResponseSchema>;

export type AgentInfo = z.infer<typeof AgentInfoSchema>;
export type AgentsListResponse = z.infer<typeof AgentsListResponseSchema>;

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

/**
 * Helper functions for API response validation
 */
export const validatePairStartRequest = (data: unknown): PairStartRequest => 
  PairStartRequestSchema.parse(data);

export const validatePairCompleteRequest = (data: unknown): PairCompleteRequest => 
  PairCompleteRequestSchema.parse(data);

export const validateTokenRefreshRequest = (data: unknown): TokenRefreshRequest => 
  TokenRefreshRequestSchema.parse(data);

export const createApiSuccessResponse = <T>(data: T) => ({
  success: true as const,
  data,
});

export const createApiErrorResponse = (code: string, message: string, details?: Record<string, unknown>) => ({
  error: {
    code,
    message,
    details,
  },
});