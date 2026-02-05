/**
 * OpenClaw Agent Connector
 * 
 * Main entry point for the Agent Connector library.
 * Exports the AgentConnector class and related types for use in other applications.
 */

export { AgentConnector, type AgentConnectorEvents, type ChatRequestHandler } from './connector';
export { type ConnectorConfig, loadConfig, validateConfig } from './config';

// Re-export protocol types for convenience
export type {
  ChatRequestMessage,
  ChatResponseMessage,
  HelloMessage,
  WebSocketMessage,
} from '@openclaw/protocol/src/messages';

export {
  WS_MESSAGE_TYPES,
  ROLES,
  ERROR_CODES,
  MESSAGE_LIMITS,
} from '@openclaw/protocol/src/constants';