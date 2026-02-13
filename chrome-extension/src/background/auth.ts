import { AuthTokens, PairingRequest, PairingResponse, RelayConfig } from '@/types';
import { SyncStorageManager, SessionStorageManager, isTokenExpired } from '@/lib/storage';
import { 
  PairCompleteRequestSchema, 
  TokenRefreshRequestSchema,
  PairCompleteResponse,
  TokenRefreshResponse
} from '@/lib/protocol';

export class AuthManager {
  private static readonly TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

  private static async getActiveRelayUrl(defaultUrl: string): Promise<string> {
    const relayConfigs = await SyncStorageManager.getRelayConfigs();
    const configResult = await chrome.storage.sync.get(['active_relay_config', 'connection_mode', 'local_webui_url']);
    const activeConfigId = configResult.active_relay_config as string | undefined;
    const connectionMode = configResult.connection_mode as string | undefined;
    const localGatewayUrl = configResult.local_webui_url as string | undefined;

    if (connectionMode === 'local_webui') {
      return localGatewayUrl || 'http://127.0.0.1:18789';
    }

    if (activeConfigId && relayConfigs[activeConfigId]?.url) {
      return relayConfigs[activeConfigId].url;
    }

    if (relayConfigs.hosted?.url) {
      return relayConfigs.hosted.url;
    }

    return Object.values(relayConfigs)[0]?.url || defaultUrl;
  }


  /**
   * Complete pairing with an agent using pairing code
   */
  static async completePairing(request: PairingRequest): Promise<PairingResponse> {
    const relayUrl = request.relay_url || 'https://openclaw-chrome-relay.gertron88.workers.dev';
    const url = `${relayUrl}/api/pair/complete`;

    // Validate request data
    const validatedRequest = PairCompleteRequestSchema.parse({
      code: request.code,
      device_label: request.device_label,
    });

    const billingSession = await chrome.storage.local.get('billing_session_token');
    const billingSessionToken = billingSession.billing_session_token as string | undefined;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (billingSessionToken) {
      headers['Authorization'] = `Bearer ${billingSessionToken}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(validatedRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Pairing failed: ${response.status} ${errorText}`);
    }

    const data: PairCompleteResponse = await response.json();
    
    // Store auth tokens
    const tokens: AuthTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
      device_id: data.device_id,
    };

    await SyncStorageManager.setAuthTokens(data.agent_id, tokens);

    // Store agent info
    await SyncStorageManager.setAgent(data.agent_id, {
      id: data.agent_id,
      display_name: data.agent_display_name,
      online: false,
      device_id: data.device_id,
    });

    return {
      refresh_token: data.refresh_token,
      access_token: data.access_token,
      expires_in: data.expires_in,
      agent_id: data.agent_id,
      agent_display_name: data.agent_display_name,
      device_id: data.device_id,
    };
  }

  /**
   * Get valid access token for agent (refresh if needed)
   */
  static async getValidAccessToken(agentId: string): Promise<string | null> {
    const tokens = await this.getTokensForAgent(agentId);
    if (!tokens) {
      return null;
    }

    // Check if token needs refresh
    const needsRefresh = await isTokenExpired(tokens) || 
      (tokens.expires_at - Date.now() < this.TOKEN_REFRESH_BUFFER_MS);

    if (needsRefresh) {
      try {
        const newTokens = await this.refreshToken(agentId, tokens.refresh_token);
        return newTokens.access_token;
      } catch (error) {
        console.error('Token refresh failed:', error);
        // Remove invalid tokens
        await SyncStorageManager.removeAuthTokens(agentId);
        return null;
      }
    }

    return tokens.access_token;
  }

  /**
   * Refresh access token using refresh token
   */
  static async refreshToken(agentId: string, refreshToken: string): Promise<AuthTokens> {
    const agents = await SyncStorageManager.getAgents();
    const agent = agents[agentId];
    
    if (!agent) {
      throw new Error('Agent not found');
    }

    // Get relay URL from stored config or default
    const relayUrl = await this.getActiveRelayUrl('https://openclaw-chrome-relay.gertron88.workers.dev');
    const url = `${relayUrl}/api/token/refresh`;

    const validatedRequest = TokenRefreshRequestSchema.parse({
      refresh_token: refreshToken,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validatedRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
    }

    const data: TokenRefreshResponse = await response.json();

    // Update stored tokens
    const newTokens: AuthTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
      device_id: agent.device_id || '',
    };

    await SyncStorageManager.setAuthTokens(agentId, newTokens);
    return newTokens;
  }

  /**
   * Get stored tokens for an agent
   */
  static async getTokensForAgent(agentId: string): Promise<AuthTokens | null> {
    const allTokens = await SyncStorageManager.getAuthTokens();
    return allTokens[agentId] || null;
  }

  /**
   * Remove agent and all associated data
   */
  static async removeAgent(agentId: string): Promise<void> {
    await SyncStorageManager.removeAgent(agentId);
    await SyncStorageManager.removeAuthTokens(agentId);
    await SessionStorageManager.removeSessionsByAgent(agentId);
  }

  /**
   * Get list of agents from relay (authenticated call)
   */
  static async getAgentsList(agentId: string): Promise<any[]> {
    const accessToken = await this.getValidAccessToken(agentId);
    if (!accessToken) {
      throw new Error('No valid access token');
    }

    const agents = await SyncStorageManager.getAgents();
    const agent = agents[agentId];
    if (!agent) {
      throw new Error('Agent not found');
    }

    const relayUrl = await this.getActiveRelayUrl('https://openclaw-chrome-relay.gertron88.workers.dev');
    const url = `${relayUrl}/api/agents`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get agents list: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.agents || [];
  }

  /**
   * Check if agent is authenticated (has valid tokens)
   */
  static async isAgentAuthenticated(agentId: string): Promise<boolean> {
    const accessToken = await this.getValidAccessToken(agentId);
    return accessToken !== null;
  }

  /**
   * Store relay configuration
   */
  static async storeRelayConfig(config: RelayConfig): Promise<void> {
    const configId = config.type === 'hosted' ? 'hosted' : config.url;
    await SyncStorageManager.setRelayConfig(configId, config);
  }

  /**
   * Get WebSocket URL for agent connection
   */
  static async getWebSocketUrl(agentId: string, accessToken?: string): Promise<string> {
    const agents = await SyncStorageManager.getAgents();
    const agent = agents[agentId];
    
    if (!agent) {
      throw new Error('Agent not found');
    }

    const relayUrl = await this.getActiveRelayUrl('wss://openclaw-chrome-relay.gertron88.workers.dev');
    
    // Convert HTTP to WebSocket URL
    const wsUrl = relayUrl.replace(/^https?:/, 'wss:').replace(/^http:/, 'ws:');
    const clientUrl = new URL(`${wsUrl}/ws/client`);

    if (accessToken) {
      clientUrl.searchParams.set('access_token', accessToken);
    }

    return clientUrl.toString();
  }
}