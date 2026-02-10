import { Agent, AuthTokens, RelayConfig, Session, ChatMessage, SyncStorage, SessionStorage } from '@/types';

// Constants
const SCROLLBACK_EXPIRY_HOURS = 24;
const SCROLLBACK_EXPIRY_MS = SCROLLBACK_EXPIRY_HOURS * 60 * 60 * 1000;

// Sync storage keys (persist across Chrome profiles)
const SYNC_KEYS = {
  AGENTS: 'agents',
  AUTH_TOKENS: 'auth_tokens',
  RELAY_CONFIGS: 'relay_configs',
  DEVICE_ID: 'device_id',
} as const;

// Session storage keys (expire with browser session or after 24h)
const SESSION_KEYS = {
  SESSIONS: 'sessions',
  MESSAGES: 'messages',
  SCROLLBACK_EXPIRY: 'scrollback_expiry',
} as const;

// Sync storage helpers (chrome.storage.sync)
export class SyncStorageManager {
  static async getAgents(): Promise<Record<string, Agent>> {
    const result = await chrome.storage.sync.get(SYNC_KEYS.AGENTS);
    return result[SYNC_KEYS.AGENTS] || {};
  }

  static async setAgent(agentId: string, agent: Agent): Promise<void> {
    const agents = await this.getAgents();
    agents[agentId] = agent;
    await chrome.storage.sync.set({ [SYNC_KEYS.AGENTS]: agents });
  }

  static async removeAgent(agentId: string): Promise<void> {
    const agents = await this.getAgents();
    delete agents[agentId];
    await chrome.storage.sync.set({ [SYNC_KEYS.AGENTS]: agents });
  }

  static async getAuthTokens(): Promise<Record<string, AuthTokens>> {
    const result = await chrome.storage.sync.get(SYNC_KEYS.AUTH_TOKENS);
    return result[SYNC_KEYS.AUTH_TOKENS] || {};
  }

  static async setAuthTokens(agentId: string, tokens: AuthTokens): Promise<void> {
    const authTokens = await this.getAuthTokens();
    authTokens[agentId] = tokens;
    await chrome.storage.sync.set({ [SYNC_KEYS.AUTH_TOKENS]: authTokens });
  }

  static async removeAuthTokens(agentId: string): Promise<void> {
    const authTokens = await this.getAuthTokens();
    delete authTokens[agentId];
    await chrome.storage.sync.set({ [SYNC_KEYS.AUTH_TOKENS]: authTokens });
  }

  static async getRelayConfigs(): Promise<Record<string, RelayConfig>> {
    const result = await chrome.storage.sync.get(SYNC_KEYS.RELAY_CONFIGS);
    return result[SYNC_KEYS.RELAY_CONFIGS] || {};
  }

  static async setRelayConfig(configId: string, config: RelayConfig): Promise<void> {
    const configs = await this.getRelayConfigs();
    configs[configId] = config;
    await chrome.storage.sync.set({ [SYNC_KEYS.RELAY_CONFIGS]: configs });
  }

  static async getDeviceId(): Promise<string> {
    const result = await chrome.storage.sync.get(SYNC_KEYS.DEVICE_ID);
    return result[SYNC_KEYS.DEVICE_ID];
  }

  static async setDeviceId(deviceId: string): Promise<void> {
    await chrome.storage.sync.set({ [SYNC_KEYS.DEVICE_ID]: deviceId });
  }

  static async clear(): Promise<void> {
    await chrome.storage.sync.clear();
  }
}

// Session storage helpers (chrome.storage.session - 24h expiry)
export class SessionStorageManager {
  static async getSessions(): Promise<Record<string, Session>> {
    const result = await chrome.storage.session.get(SESSION_KEYS.SESSIONS);
    return result[SESSION_KEYS.SESSIONS] || {};
  }

  static async setSession(sessionId: string, session: Session): Promise<void> {
    const sessions = await this.getSessions();
    sessions[sessionId] = session;
    await chrome.storage.session.set({ [SESSION_KEYS.SESSIONS]: sessions });
  }

  static async removeSession(sessionId: string): Promise<void> {
    const sessions = await this.getSessions();
    delete sessions[sessionId];
    await chrome.storage.session.set({ [SESSION_KEYS.SESSIONS]: sessions });
    
    // Also remove messages for this session
    await this.removeMessages(sessionId);
  }

  static async getMessages(sessionId: string): Promise<ChatMessage[]> {
    // Check if scrollback has expired
    if (await this.hasScrollbackExpired(sessionId)) {
      await this.removeMessages(sessionId);
      return [];
    }

    const result = await chrome.storage.session.get(SESSION_KEYS.MESSAGES);
    const allMessages = result[SESSION_KEYS.MESSAGES] || {};
    return allMessages[sessionId] || [];
  }

  static async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const result = await chrome.storage.session.get(SESSION_KEYS.MESSAGES);
    const allMessages = result[SESSION_KEYS.MESSAGES] || {};
    
    if (!allMessages[sessionId]) {
      allMessages[sessionId] = [];
    }
    
    allMessages[sessionId].push(message);
    
    // Update expiry timestamp
    await this.updateScrollbackExpiry(sessionId);
    
    await chrome.storage.session.set({ [SESSION_KEYS.MESSAGES]: allMessages });
  }

  static async removeMessages(sessionId: string): Promise<void> {
    const result = await chrome.storage.session.get(SESSION_KEYS.MESSAGES);
    const allMessages = result[SESSION_KEYS.MESSAGES] || {};
    delete allMessages[sessionId];
    await chrome.storage.session.set({ [SESSION_KEYS.MESSAGES]: allMessages });

    // Also remove expiry timestamp
    const expiryResult = await chrome.storage.session.get(SESSION_KEYS.SCROLLBACK_EXPIRY);
    const expiry = expiryResult[SESSION_KEYS.SCROLLBACK_EXPIRY] || {};
    delete expiry[sessionId];
    await chrome.storage.session.set({ [SESSION_KEYS.SCROLLBACK_EXPIRY]: expiry });
  }

  static async updateScrollbackExpiry(sessionId: string): Promise<void> {
    const result = await chrome.storage.session.get(SESSION_KEYS.SCROLLBACK_EXPIRY);
    const expiry = result[SESSION_KEYS.SCROLLBACK_EXPIRY] || {};
    expiry[sessionId] = Date.now() + SCROLLBACK_EXPIRY_MS;
    await chrome.storage.session.set({ [SESSION_KEYS.SCROLLBACK_EXPIRY]: expiry });
  }

  static async hasScrollbackExpired(sessionId: string): Promise<boolean> {
    const result = await chrome.storage.session.get(SESSION_KEYS.SCROLLBACK_EXPIRY);
    const expiry = result[SESSION_KEYS.SCROLLBACK_EXPIRY] || {};
    const expiryTime = expiry[sessionId];
    
    if (!expiryTime) {
      return false;
    }
    
    return Date.now() > expiryTime;
  }

  static async cleanupExpiredScrollback(): Promise<void> {
    const result = await chrome.storage.session.get(SESSION_KEYS.SCROLLBACK_EXPIRY);
    const expiry = result[SESSION_KEYS.SCROLLBACK_EXPIRY] || {};
    const now = Date.now();
    
    for (const [sessionId, expiryTime] of Object.entries(expiry)) {
      if (typeof expiryTime === 'number' && now > expiryTime) {
        await this.removeMessages(sessionId);
      }
    }
  }

  static async clear(): Promise<void> {
    await chrome.storage.session.clear();
  }
}

// Utility functions
export async function initializeDeviceId(): Promise<string> {
  let deviceId = await SyncStorageManager.getDeviceId();
  if (!deviceId) {
    // Generate a new device ID
    deviceId = 'ext_' + crypto.randomUUID();
    await SyncStorageManager.setDeviceId(deviceId);
  }
  return deviceId;
}

export async function isTokenExpired(tokens: AuthTokens): Promise<boolean> {
  return Date.now() >= tokens.expires_at;
}

export function createSessionId(agentId: string): string {
  return `${agentId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createRequestId(): string {
  return `req_${Date.now()}_${crypto.randomUUID()}`;
}
