// Core data types
export interface Agent {
  id: string;
  display_name: string;
  online: boolean;
  last_seen?: string;
  device_id?: string;
}

export interface Session {
  id: string;
  agent_id: string;
  agent_name: string;
  created_at: string;
  last_activity: string;
  message_count: number;
}

export interface ChatMessage {
  id: string;
  request_id: string;
  agent_id: string;
  session_id: string;
  type: 'request' | 'response';
  text: string;
  timestamp: string;
  status?: 'pending' | 'delivered' | 'error';
  error?: string;
}

// Auth & pairing
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  device_id: string;
}

export interface PairingRequest {
  code: string;
  device_label: string;
  relay_url?: string; // for custom relay
}

export interface PairingResponse {
  refresh_token: string;
  access_token: string;
  expires_in: number;
  agent_id: string;
  agent_display_name: string;
  device_id: string;
}

// Relay configuration
export interface RelayConfig {
  type: 'hosted' | 'custom';
  url: string;
  display_name: string;
}

// Storage schemas
export interface SyncStorage {
  agents: Record<string, Agent>;
  auth_tokens: Record<string, AuthTokens>;
  relay_configs: Record<string, RelayConfig>;
  device_id: string;
}

export interface SessionStorage {
  sessions: Record<string, Session>;
  messages: Record<string, ChatMessage[]>; // key: session_id
  scrollback_expiry: Record<string, number>; // key: session_id, value: timestamp
}

// WebSocket message types (matches protocol)
export interface WSMessage {
  type: string;
  [key: string]: any;
}

export interface HelloMessage extends WSMessage {
  type: 'hello';
  role: 'client';
  device_id: string;
  tenant_id?: string;
}

export interface PresenceMessage extends WSMessage {
  type: 'presence';
  agent_id: string;
  online: boolean;
  ts: string;
}

export interface ChatRequestMessage extends WSMessage {
  type: 'chat.request';
  request_id: string;
  agent_id: string;
  session_id: string;
  text: string;
  ts: string;
}

export interface ChatResponseMessage extends WSMessage {
  type: 'chat.response';
  request_id: string;
  agent_id: string;
  session_id: string;
  reply: string;
  ts: string;
}

export interface ErrorMessage extends WSMessage {
  type: 'error';
  request_id?: string;
  code: string;
  message: string;
}

// UI state
export interface UIState {
  current_session?: string;
  current_agent?: string;
  pairing_mode: boolean;
  connection_status: 'disconnected' | 'connecting' | 'connected' | 'error';
}

// Events for internal messaging
export interface ExtensionMessage {
  type: string;
  [key: string]: any;
}

export interface ConnectionStatusEvent extends ExtensionMessage {
  type: 'connection_status';
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  agent_id?: string;
}

export interface NewMessageEvent extends ExtensionMessage {
  type: 'new_message';
  message: ChatMessage;
}

export interface AgentStatusEvent extends ExtensionMessage {
  type: 'agent_status';
  agent_id: string;
  online: boolean;
}