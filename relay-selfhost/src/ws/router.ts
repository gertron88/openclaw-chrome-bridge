import { FastifyInstance } from 'fastify';
import { 
  setupAgentWebSocket, 
  sendToAgent as agentSendToAgent, 
  isAgentOnline as agentIsOnline,
  setRouterFunctions as setAgentRouterFunctions 
} from './agent.js';
import { 
  setupClientWebSocket, 
  broadcastToAgentClients, 
  sendToClientSession,
  setRouterFunctions as setClientRouterFunctions 
} from './client.js';
import { CONFIG } from '../config.js';

interface QueuedMessage {
  message: any;
  timestamp: number;
  attempts: number;
}

// In-memory message queue for offline agents
const offlineQueues = new Map<string, QueuedMessage[]>();

export async function setupWebSocketRouter(fastify: FastifyInstance) {
  // Setup WebSocket endpoints
  await setupAgentWebSocket(fastify);
  await setupClientWebSocket(fastify);

  // Wire up router functions
  setAgentRouterFunctions(broadcastToClients, handleAgentMessage);
  setClientRouterFunctions(sendToAgent, broadcastToClients);

  // Setup queue cleanup
  setupQueueCleanup();
}

/**
 * Send a message to an agent
 * If agent is offline, queue the message temporarily
 */
export function sendToAgent(agentId: string, message: any): boolean {
  // Try to send directly to agent if online
  if (agentSendToAgent(agentId, message)) {
    return true;
  }

  // Agent is offline, queue the message
  return queueMessageForAgent(agentId, message);
}

/**
 * Broadcast a message to all clients that have a specific agent paired
 */
export function broadcastToClients(agentId: string, message: any): void {
  broadcastToAgentClients(agentId, message);
}

/**
 * Handle a message from an agent (usually a response to a client request)
 */
export function handleAgentMessage(agentId: string, message: any): void {
  switch (message.type) {
    case 'chat.response':
      // Forward response to the appropriate client session
      // We need to track which client session made the original request
      broadcastToClients(agentId, message);
      break;

    case 'presence':
      // Broadcast presence updates to all clients
      broadcastToClients(agentId, message);
      break;

    default:
      console.warn(`Unknown message type from agent ${agentId}:`, message.type);
  }
}

/**
 * Check if an agent is currently online
 */
export function isAgentOnline(agentId: string): boolean {
  return agentIsOnline(agentId);
}

/**
 * Queue a message for an offline agent
 */
function queueMessageForAgent(agentId: string, message: any): boolean {
  if (!offlineQueues.has(agentId)) {
    offlineQueues.set(agentId, []);
  }

  const queue = offlineQueues.get(agentId)!;
  
  // Check queue size limit
  if (queue.length >= CONFIG.OFFLINE_QUEUE_MAX_MESSAGES) {
    console.warn(`Offline queue full for agent ${agentId}, dropping oldest message`);
    queue.shift(); // Remove oldest message
  }

  // Add message to queue
  queue.push({
    message,
    timestamp: Date.now(),
    attempts: 0
  });

  console.log(`Queued message for offline agent ${agentId}, queue size: ${queue.length}`);
  return true;
}

/**
 * Process queued messages when an agent comes online
 */
export function processQueuedMessages(agentId: string): void {
  const queue = offlineQueues.get(agentId);
  if (!queue || queue.length === 0) {
    return;
  }

  console.log(`Processing ${queue.length} queued messages for agent ${agentId}`);

  // Try to send each queued message
  const remainingMessages: QueuedMessage[] = [];
  
  for (const queuedMessage of queue) {
    if (agentSendToAgent(agentId, queuedMessage.message)) {
      console.log(`Successfully sent queued message to agent ${agentId}`);
    } else {
      // Agent went offline again, keep message in queue
      queuedMessage.attempts += 1;
      if (queuedMessage.attempts < 3) { // Max 3 attempts
        remainingMessages.push(queuedMessage);
      }
    }
  }

  // Update queue with remaining messages
  if (remainingMessages.length > 0) {
    offlineQueues.set(agentId, remainingMessages);
  } else {
    offlineQueues.delete(agentId);
  }
}

/**
 * Setup cleanup for expired queued messages
 */
function setupQueueCleanup(): void {
  setInterval(() => {
    cleanupExpiredMessages();
  }, 30000); // Every 30 seconds
}

/**
 * Clean up expired messages from offline queues
 */
function cleanupExpiredMessages(): void {
  const now = Date.now();
  const expiredThreshold = CONFIG.OFFLINE_QUEUE_TTL_MS;

  for (const [agentId, queue] of offlineQueues.entries()) {
    const validMessages = queue.filter(
      queuedMessage => (now - queuedMessage.timestamp) < expiredThreshold
    );

    if (validMessages.length === 0) {
      // No valid messages left, remove queue
      offlineQueues.delete(agentId);
      console.log(`Removed expired queue for agent ${agentId}`);
    } else if (validMessages.length !== queue.length) {
      // Some messages expired, update queue
      offlineQueues.set(agentId, validMessages);
      console.log(`Cleaned up ${queue.length - validMessages.length} expired messages for agent ${agentId}`);
    }
  }
}

/**
 * Get queue statistics for monitoring
 */
export function getQueueStats(): Record<string, any> {
  const stats: Record<string, any> = {};
  
  for (const [agentId, queue] of offlineQueues.entries()) {
    stats[agentId] = {
      queueLength: queue.length,
      oldestMessage: queue.length > 0 ? queue[0].timestamp : null,
      newestMessage: queue.length > 0 ? queue[queue.length - 1].timestamp : null
    };
  }

  return {
    totalQueues: offlineQueues.size,
    totalMessages: Array.from(offlineQueues.values()).reduce((sum, queue) => sum + queue.length, 0),
    agentQueues: stats
  };
}

/**
 * Clear all queued messages (for testing or maintenance)
 */
export function clearAllQueues(): void {
  const totalMessages = Array.from(offlineQueues.values()).reduce((sum, queue) => sum + queue.length, 0);
  offlineQueues.clear();
  console.log(`Cleared all message queues, removed ${totalMessages} messages`);
}

/**
 * Clear queued messages for a specific agent
 */
export function clearQueueForAgent(agentId: string): number {
  const queue = offlineQueues.get(agentId);
  if (queue) {
    const messageCount = queue.length;
    offlineQueues.delete(agentId);
    console.log(`Cleared queue for agent ${agentId}, removed ${messageCount} messages`);
    return messageCount;
  }
  return 0;
}