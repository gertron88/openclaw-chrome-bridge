import { type CloudflareBindings } from '@/config';

/**
 * WebSocket protocol message types
 */
export interface WSMessage {
  type: string;
  [key: string]: any;
}

export interface HelloMessage extends WSMessage {
  type: 'hello';
  role: 'agent' | 'client';
  agent_id?: string;
  device_id?: string;
  tenant_id?: string;
  ts: number;
}

export interface ChatRequestMessage extends WSMessage {
  type: 'chat.request';
  request_id: string;
  agent_id: string;
  session_id: string;
  text: string;
  ts: number;
}

export interface ChatResponseMessage extends WSMessage {
  type: 'chat.response';
  request_id: string;
  agent_id: string;
  session_id: string;
  reply: string;
  ts: number;
}

export interface PresenceMessage extends WSMessage {
  type: 'presence';
  agent_id: string;
  online: boolean;
  ts: number;
}

export interface ErrorMessage extends WSMessage {
  type: 'error';
  request_id?: string;
  code: string;
  message: string;
  ts: number;
}

export interface PingMessage extends WSMessage {
  type: 'ping';
  ts: number;
}

export interface PongMessage extends WSMessage {
  type: 'pong';
  ts: number;
}

/**
 * Message validation utilities
 */
export class MessageValidator {
  static validateChatRequest(message: any): message is ChatRequestMessage {
    return (
      message.type === 'chat.request' &&
      typeof message.request_id === 'string' &&
      typeof message.agent_id === 'string' &&
      typeof message.session_id === 'string' &&
      typeof message.text === 'string' &&
      message.text.length > 0 &&
      message.text.length <= 32 * 1024 // 32KB limit
    );
  }

  static validateChatResponse(message: any): message is ChatResponseMessage {
    return (
      message.type === 'chat.response' &&
      typeof message.request_id === 'string' &&
      typeof message.agent_id === 'string' &&
      typeof message.session_id === 'string' &&
      typeof message.reply === 'string' &&
      message.reply.length > 0
    );
  }

  static validatePresence(message: any): message is PresenceMessage {
    return (
      message.type === 'presence' &&
      typeof message.agent_id === 'string' &&
      typeof message.online === 'boolean'
    );
  }

  static isValidMessage(message: any): message is WSMessage {
    return (
      typeof message === 'object' &&
      message !== null &&
      typeof message.type === 'string'
    );
  }
}

/**
 * WebSocket connection utilities
 */
export class WSConnection {
  private ws: WebSocket;
  private lastPing: number = 0;
  private pingInterval?: number;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.startPingInterval();
  }

  send(message: WSMessage): void {
    if (this.ws.readyState === WebSocket.READY_STATE_OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  sendError(code: string, message: string, requestId?: string): void {
    this.send({
      type: 'error',
      request_id: requestId,
      code,
      message,
      ts: Date.now(),
    } as ErrorMessage);
  }

  sendPing(): void {
    const now = Date.now();
    this.lastPing = now;
    this.send({
      type: 'ping',
      ts: now,
    } as PingMessage);
  }

  close(code?: number, reason?: string): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.ws.close(code, reason);
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      // Close if no pong received within 60 seconds of last ping
      if (this.lastPing > 0 && (now - this.lastPing) > 60000) {
        this.close(1000, 'Ping timeout');
        return;
      }
      
      this.sendPing();
    }, 30000); // Ping every 30 seconds
  }
}

/**
 * Generate unique request ID
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Rate limiting for WebSocket messages
 */
export class WSRateLimit {
  private messageCount: number = 0;
  private windowStart: number = Date.now();
  private readonly maxMessages: number;
  private readonly windowMs: number;

  constructor(maxMessages: number = 60, windowMs: number = 60000) {
    this.maxMessages = maxMessages;
    this.windowMs = windowMs;
  }

  isAllowed(): boolean {
    const now = Date.now();
    
    // Reset window if expired
    if (now - this.windowStart >= this.windowMs) {
      this.messageCount = 0;
      this.windowStart = now;
    }
    
    if (this.messageCount >= this.maxMessages) {
      return false;
    }
    
    this.messageCount++;
    return true;
  }

  getStatus(): { count: number; remaining: number; resetTime: number } {
    const now = Date.now();
    const remaining = Math.max(0, this.maxMessages - this.messageCount);
    const resetTime = this.windowStart + this.windowMs;
    
    return {
      count: this.messageCount,
      remaining,
      resetTime,
    };
  }
}

/**
 * Session state management for WebSocket connections
 */
export interface SessionState {
  id: string;
  role: 'agent' | 'client';
  agentId?: string;
  deviceId?: string;
  tenantId?: string;
  connectedAt: number;
  lastActivity: number;
  messageCount: number;
}

export class SessionManager {
  private sessions = new Map<string, SessionState>();

  createSession(ws: WebSocket, role: 'agent' | 'client', metadata: any): string {
    const sessionId = this.generateSessionId();
    const session: SessionState = {
      id: sessionId,
      role,
      agentId: metadata.agentId,
      deviceId: metadata.deviceId,
      tenantId: metadata.tenantId,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      messageCount: 0,
    };
    
    this.sessions.set(sessionId, session);
    return sessionId;
  }

  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  updateActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      session.messageCount++;
      this.sessions.set(sessionId, session);
    }
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  cleanup(maxIdleMs: number = 300000): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > maxIdleMs) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
}