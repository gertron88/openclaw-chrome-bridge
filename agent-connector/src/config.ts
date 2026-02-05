import { config } from 'dotenv';

// Load environment variables from .env file
config();

export interface ConnectorConfig {
  relayUrl: string;
  agentId: string;
  agentSecret: string;
  agentDisplayName: string;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  reconnectBackoffMultiplier?: number;
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): ConnectorConfig {
  const relayUrl = process.env.RELAY_URL;
  const agentId = process.env.AGENT_ID;
  const agentSecret = process.env.AGENT_SECRET;
  const agentDisplayName = process.env.AGENT_DISPLAY_NAME || 'OpenClaw Agent';

  if (!relayUrl) {
    throw new Error('RELAY_URL environment variable is required');
  }

  if (!agentId) {
    throw new Error('AGENT_ID environment variable is required');
  }

  if (!agentSecret) {
    throw new Error('AGENT_SECRET environment variable is required');
  }

  return {
    relayUrl,
    agentId,
    agentSecret,
    agentDisplayName,
    reconnectDelayMs: parseInt(process.env.RECONNECT_DELAY_MS || '1000', 10),
    maxReconnectDelayMs: parseInt(process.env.MAX_RECONNECT_DELAY_MS || '30000', 10),
    reconnectBackoffMultiplier: parseFloat(process.env.RECONNECT_BACKOFF_MULTIPLIER || '1.5'),
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: ConnectorConfig): void {
  if (!config.relayUrl.startsWith('ws://') && !config.relayUrl.startsWith('wss://')) {
    throw new Error('RELAY_URL must be a WebSocket URL (ws:// or wss://)');
  }

  if (!config.agentId.trim()) {
    throw new Error('AGENT_ID cannot be empty');
  }

  if (!config.agentSecret.trim()) {
    throw new Error('AGENT_SECRET cannot be empty');
  }

  if (!config.agentDisplayName.trim()) {
    throw new Error('AGENT_DISPLAY_NAME cannot be empty');
  }
}