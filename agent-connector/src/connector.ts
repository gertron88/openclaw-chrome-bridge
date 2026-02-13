import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  HelloMessage,
  ChatRequestMessage,
  ChatResponseMessage,
  WebSocketMessage,
  WebSocketMessageSchema,
  isChatRequestMessage,
  isErrorMessage,
} from '@openclaw/protocol/src/messages';
import { WS_MESSAGE_TYPES, ROLES } from '@openclaw/protocol/src/constants';
import { ConnectorConfig, validateConfig } from './config';

export interface AgentConnectorEvents {
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
  chatRequest: (request: ChatRequestMessage) => void;
}

export type ChatRequestHandler = (request: ChatRequestMessage) => Promise<string>;

/**
 * AgentConnector - WebSocket client for connecting agents to OpenClaw Chrome Bridge relay
 */
export class AgentConnector extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: ConnectorConfig;
  private chatHandler: ChatRequestHandler | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private isConnecting = false;
  private isDisconnecting = false;

  constructor(config: ConnectorConfig) {
    super();
    validateConfig(config);
    this.config = config;
  }

  /**
   * Connect to the relay server
   */
  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    if (this.isConnecting) {
      return; // Connection attempt in progress
    }

    this.isConnecting = true;
    this.isDisconnecting = false;

    try {
      // Build WebSocket URL with agent endpoint
      const wsUrl = new URL(this.config.relayUrl);
      wsUrl.pathname = '/ws/agent';
      wsUrl.searchParams.set('agent_id', this.config.agentId);

      console.log(`Connecting to relay: ${wsUrl.toString()}`);

      this.ws = new WebSocket(wsUrl.toString(), {
        headers: {
          'Authorization': `Bearer ${this.config.agentSecret}`,
        },
      });

      this.ws.on('open', this.handleOpen.bind(this));
      this.ws.on('message', this.handleMessage.bind(this));
      this.ws.on('close', this.handleClose.bind(this));
      this.ws.on('error', this.handleError.bind(this));

      // Wait for connection to establish
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000); // 10 second timeout

        this.once('connected', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

    } catch (error) {
      this.isConnecting = false;
      throw error;
    }
  }

  /**
   * Disconnect from the relay server
   */
  async disconnect(): Promise<void> {
    this.isDisconnecting = true;
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.emit('disconnected');
  }

  /**
   * Request a pairing code from the relay
   */
  async requestPairingCode(): Promise<{ code: string; expiresAt: Date }> {
    // Build HTTP URL for pairing endpoint
    const httpUrl = this.config.relayUrl.replace('ws://', 'http://').replace('wss://', 'https://');
    
    try {
      const response = await fetch(`${httpUrl}/api/pair/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.agentSecret}`,
        },
        body: JSON.stringify({
          agent_id: this.config.agentId,
          display_name: this.config.agentDisplayName,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Pairing request failed: ${response.status} ${errorText}`);
      }

      const data = await response.json() as { code: string; expires_at: string };
      return {
        code: data.code,
        expiresAt: new Date(data.expires_at),
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to request pairing code: ${error.message}`);
      }
      throw new Error('Failed to request pairing code: Unknown error');
    }
  }

  /**
   * Register handler for incoming chat requests
   */
  onChatRequest(handler: ChatRequestHandler): void {
    this.chatHandler = handler;
  }

  /**
   * Send a chat response back to the client
   */
  async sendResponse(requestId: string, sessionId: string, reply: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to relay');
    }

    const response: ChatResponseMessage = {
      type: WS_MESSAGE_TYPES.CHAT_RESPONSE,
      request_id: requestId,
      agent_id: this.config.agentId,
      session_id: sessionId,
      reply: reply,
      ts: Date.now(),
    };

    this.ws.send(JSON.stringify(response));
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private handleOpen(): void {
    console.log('WebSocket connected');
    this.isConnecting = false;
    this.reconnectAttempts = 0;

    // Send hello message
    const hello: HelloMessage = {
      type: WS_MESSAGE_TYPES.HELLO,
      role: ROLES.AGENT,
      agent_id: this.config.agentId,
      ts: Date.now(),
    };

    this.ws?.send(JSON.stringify(hello));
    this.emit('connected');
  }

  private handleMessage(data: WebSocket.RawData): void {
    try {
      const message = JSON.parse(data.toString()) as WebSocketMessage;
      const validationResult = WebSocketMessageSchema.safeParse(message);

      if (!validationResult.success) {
        console.error('Invalid message received:', validationResult.error);
        return;
      }

      const validMessage = validationResult.data;

      if (isChatRequestMessage(validMessage)) {
        this.handleChatRequest(validMessage);
      } else if (isErrorMessage(validMessage)) {
        console.error('Received error message:', validMessage.message);
        this.emit('error', new Error(validMessage.message));
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  private async handleChatRequest(request: ChatRequestMessage): Promise<void> {
    this.emit('chatRequest', request);

    if (this.chatHandler) {
      try {
        const reply = await this.chatHandler(request);
        await this.sendResponse(request.request_id, request.session_id, reply);
      } catch (error) {
        console.error('Chat handler error:', error);
        const errorReply = 'Sorry, I encountered an error processing your request.';
        try {
          await this.sendResponse(request.request_id, request.session_id, errorReply);
        } catch (sendError) {
          console.error('Failed to send error response:', sendError);
        }
      }
    } else {
      // No handler registered, send default response
      const defaultReply = 'I received your message, but no handler is registered to process it.';
      try {
        await this.sendResponse(request.request_id, request.session_id, defaultReply);
      } catch (sendError) {
        console.error('Failed to send default response:', sendError);
      }
    }
  }

  private handleClose(code: number, reason: Buffer): void {
    console.log(`WebSocket closed: ${code} ${reason.toString()}`);
    this.ws = null;
    this.emit('disconnected');

    // Attempt to reconnect unless explicitly disconnecting
    if (!this.isDisconnecting) {
      this.scheduleReconnect();
    }
  }

  private handleError(error: Error): void {
    console.error('WebSocket error:', error);
    this.emit('error', error);
    this.isConnecting = false;
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    const delay = Math.min(
      this.config.reconnectDelayMs! * Math.pow(this.config.reconnectBackoffMultiplier!, this.reconnectAttempts),
      this.config.maxReconnectDelayMs!
    );

    console.log(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch((error) => {
        console.error('Reconnect failed:', error);
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}