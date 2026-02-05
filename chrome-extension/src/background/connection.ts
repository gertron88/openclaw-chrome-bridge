import { AuthManager } from './auth';
import { SyncStorageManager, SessionStorageManager, initializeDeviceId, createRequestId } from '@/lib/storage';
import { 
  validateIncomingMessage, 
  HelloMessage, 
  ChatRequest,
  IncomingMessage,
  WEBSOCKET_TIMEOUT,
  RECONNECT_DELAY 
} from '@/lib/protocol';
import { Agent, ChatMessage, ConnectionStatusEvent, NewMessageEvent, AgentStatusEvent } from '@/types';

export class ConnectionManager {
  private ws: WebSocket | null = null;
  private agentId: string;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private isConnecting = false;
  private shouldReconnect = true;
  private messageQueue: any[] = [];

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  /**
   * Connect to the relay WebSocket
   */
  async connect(): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    this.shouldReconnect = true;
    
    try {
      const accessToken = await AuthManager.getValidAccessToken(this.agentId);
      if (!accessToken) {
        throw new Error('No valid access token');
      }

      const wsUrl = await AuthManager.getWebSocketUrl(this.agentId);
      const deviceId = await initializeDeviceId();

      this.broadcastStatus('connecting');

      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected for agent:', this.agentId);
        this.isConnecting = false;
        this.broadcastStatus('connected');
        
        // Send hello message for authentication
        this.sendHello(deviceId, accessToken);
        
        // Start heartbeat
        this.startHeartbeat();
        
        // Process queued messages
        this.processMessageQueue();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed for agent:', this.agentId, event.code, event.reason);
        this.isConnecting = false;
        this.stopHeartbeat();
        this.broadcastStatus('disconnected');
        
        if (this.shouldReconnect && !event.wasClean) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error for agent:', this.agentId, error);
        this.isConnecting = false;
        this.broadcastStatus('error');
      };

      // Connection timeout
      setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          console.log('WebSocket connection timeout for agent:', this.agentId);
          this.ws.close();
        }
      }, WEBSOCKET_TIMEOUT);

    } catch (error) {
      console.error('Failed to connect WebSocket for agent:', this.agentId, error);
      this.isConnecting = false;
      this.broadcastStatus('error');
      
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Disconnect from the relay WebSocket
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
    
    this.broadcastStatus('disconnected');
  }

  /**
   * Send a chat message to the agent
   */
  async sendChatMessage(sessionId: string, text: string): Promise<string> {
    const requestId = createRequestId();
    
    const message: ChatRequest = {
      type: 'chat.request',
      request_id: requestId,
      agent_id: this.agentId,
      session_id: sessionId,
      text: text,
      ts: new Date().toISOString(),
    };

    // Store the outgoing message
    const chatMessage: ChatMessage = {
      id: requestId,
      request_id: requestId,
      agent_id: this.agentId,
      session_id: sessionId,
      type: 'request',
      text: text,
      timestamp: message.ts,
      status: 'pending',
    };

    await SessionStorageManager.addMessage(sessionId, chatMessage);
    this.broadcastNewMessage(chatMessage);

    // Send via WebSocket
    if (this.isConnected()) {
      this.sendMessage(message);
    } else {
      // Queue message for later
      this.messageQueue.push(message);
      // Attempt to reconnect
      this.connect();
    }

    return requestId;
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): 'disconnected' | 'connecting' | 'connected' | 'error' {
    if (this.isConnecting) return 'connecting';
    if (this.isConnected()) return 'connected';
    return 'disconnected';
  }

  private sendHello(deviceId: string, accessToken: string): void {
    const helloMessage: HelloMessage = {
      type: 'hello',
      role: 'client',
      device_id: deviceId,
    };

    // Send with Authorization header in the message for simplicity
    this.sendMessage({
      ...helloMessage,
      authorization: `Bearer ${accessToken}`,
    });
  }

  private sendMessage(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private async handleMessage(data: string): Promise<void> {
    try {
      const rawMessage = JSON.parse(data);
      const message = validateIncomingMessage(rawMessage);

      console.log('Received message:', message);

      switch (message.type) {
        case 'presence':
          await this.handlePresenceMessage(message);
          break;
          
        case 'chat.response':
          await this.handleChatResponse(message);
          break;
          
        case 'error':
          await this.handleErrorMessage(message);
          break;
          
        default:
          console.warn('Unknown message type:', (message as any).type);
      }
    } catch (error) {
      console.error('Failed to handle message:', error, data);
    }
  }

  private async handlePresenceMessage(message: IncomingMessage & { type: 'presence' }): Promise<void> {
    // Update agent online status
    const agents = await SyncStorageManager.getAgents();
    const agent = agents[message.agent_id];
    
    if (agent) {
      agent.online = message.online;
      agent.last_seen = message.ts;
      await SyncStorageManager.setAgent(message.agent_id, agent);
    }

    // Broadcast status change
    this.broadcastAgentStatus(message.agent_id, message.online);
  }

  private async handleChatResponse(message: IncomingMessage & { type: 'chat.response' }): Promise<void> {
    // Create response message
    const chatMessage: ChatMessage = {
      id: `resp_${message.request_id}`,
      request_id: message.request_id,
      agent_id: message.agent_id,
      session_id: message.session_id,
      type: 'response',
      text: message.reply,
      timestamp: message.ts,
      status: 'delivered',
    };

    // Store message
    await SessionStorageManager.addMessage(message.session_id, chatMessage);
    
    // Update request status to delivered
    const messages = await SessionStorageManager.getMessages(message.session_id);
    const requestMessage = messages.find(m => m.request_id === message.request_id && m.type === 'request');
    if (requestMessage) {
      requestMessage.status = 'delivered';
      // Re-save the updated message list
      const updatedMessages = messages.map(m => 
        m.request_id === message.request_id && m.type === 'request' 
          ? requestMessage 
          : m
      );
      // Note: This is a simplification. In a real implementation, you'd want a more efficient update method.
    }

    // Broadcast new message
    this.broadcastNewMessage(chatMessage);
  }

  private async handleErrorMessage(message: IncomingMessage & { type: 'error' }): Promise<void> {
    console.error('Received error from relay:', message);
    
    if (message.request_id) {
      // Update message status to error
      // Find the message in session storage and mark it as error
      // This is a simplified implementation
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    
    this.reconnectTimer = window.setTimeout(() => {
      console.log('Attempting to reconnect for agent:', this.agentId);
      this.connect();
    }, RECONNECT_DELAY);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    // Send ping every 30 seconds
    this.heartbeatTimer = window.setInterval(() => {
      if (this.isConnected()) {
        this.sendMessage({ type: 'ping', ts: new Date().toISOString() });
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private processMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift();
      this.sendMessage(message);
    }
  }

  private broadcastStatus(status: 'disconnected' | 'connecting' | 'connected' | 'error'): void {
    const event: ConnectionStatusEvent = {
      type: 'connection_status',
      status: status,
      agent_id: this.agentId,
    };

    // Broadcast to all extension contexts
    chrome.runtime.sendMessage(event).catch(() => {
      // Ignore errors if no listeners
    });
  }

  private broadcastNewMessage(message: ChatMessage): void {
    const event: NewMessageEvent = {
      type: 'new_message',
      message: message,
    };

    chrome.runtime.sendMessage(event).catch(() => {
      // Ignore errors if no listeners
    });
  }

  private broadcastAgentStatus(agentId: string, online: boolean): void {
    const event: AgentStatusEvent = {
      type: 'agent_status',
      agent_id: agentId,
      online: online,
    };

    chrome.runtime.sendMessage(event).catch(() => {
      // Ignore errors if no listeners
    });
  }
}