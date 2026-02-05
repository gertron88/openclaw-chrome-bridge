import { ChatRequestMessage } from '@openclaw/protocol/src/messages';

/**
 * Placeholder mock handler that echoes or generates mock responses
 * This serves as an example and testing placeholder until real OpenClaw integration is implemented
 */

const MOCK_RESPONSES = [
  "I'm a mock OpenClaw agent. I received your message: \"{text}\"",
  "This is a placeholder response from the mock handler. You said: \"{text}\"",
  "Hello! I'm currently running in mock mode. Your message was: \"{text}\"",
  "Mock response generated for session {session_id}. Input: \"{text}\"",
  "I'm processing your request in mock mode... Your text: \"{text}\"",
];

const SPECIAL_COMMANDS = {
  '/help': 'Available commands: /help, /status, /echo <text>, /time, /error',
  '/status': 'Mock OpenClaw agent is running. Status: OK',
  '/time': () => `Current time: ${new Date().toISOString()}`,
  '/error': 'This is a simulated error response for testing purposes.',
};

/**
 * Mock implementation of callOpenClaw function
 * In a real implementation, this would integrate with the actual OpenClaw system
 * 
 * @param text - The user's input text
 * @param sessionId - The session ID for context
 * @returns Promise that resolves to the agent's response
 */
export async function callOpenClaw(text: string, sessionId: string): Promise<string> {
  // Simulate some processing delay
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 500));

  const trimmedText = text.trim();
  
  // Handle special commands
  if (trimmedText.startsWith('/echo ')) {
    return `Echo: ${trimmedText.substring(6)}`;
  }

  for (const [command, response] of Object.entries(SPECIAL_COMMANDS)) {
    if (trimmedText === command) {
      return typeof response === 'function' ? response() : response;
    }
  }

  // Generate a mock response
  const responseTemplate = MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)];
  return responseTemplate
    .replace(/\{text\}/g, text)
    .replace(/\{session_id\}/g, sessionId);
}

/**
 * Create a chat request handler that uses the mock OpenClaw function
 */
export function createMockHandler() {
  return async (request: ChatRequestMessage): Promise<string> => {
    console.log(`Mock handler received chat request:`, {
      requestId: request.request_id,
      sessionId: request.session_id,
      text: request.text,
      agentId: request.agent_id,
    });

    try {
      const response = await callOpenClaw(request.text, request.session_id);
      console.log(`Mock handler sending response: ${response}`);
      return response;
    } catch (error) {
      console.error('Mock handler error:', error);
      return 'Sorry, I encountered an error while processing your request in mock mode.';
    }
  };
}

/**
 * Advanced mock handler that demonstrates more sophisticated behavior
 * Maintains simple session state and provides contextual responses
 */
export function createAdvancedMockHandler() {
  // Simple in-memory session storage (would be replaced with real state management)
  const sessionState = new Map<string, { messageCount: number; lastMessage?: string }>();

  return async (request: ChatRequestMessage): Promise<string> => {
    const { session_id, text, request_id } = request;
    
    // Update session state
    const state = sessionState.get(session_id) || { messageCount: 0 };
    state.messageCount++;
    state.lastMessage = text;
    sessionState.set(session_id, state);

    console.log(`Advanced mock handler [${session_id}] message #${state.messageCount}: ${text}`);

    // Context-aware responses
    if (state.messageCount === 1) {
      return `Hello! I'm your OpenClaw agent (mock mode). This is our first interaction in session ${session_id}. How can I help you?`;
    }

    if (text.toLowerCase().includes('remember') || text.toLowerCase().includes('recall')) {
      return `I remember our conversation in session ${session_id}. This is message #${state.messageCount}. Your previous message was: "${state.lastMessage}"`;
    }

    if (text.toLowerCase().includes('goodbye') || text.toLowerCase().includes('bye')) {
      const totalMessages = state.messageCount;
      sessionState.delete(session_id); // Clear session
      return `Goodbye! We exchanged ${totalMessages} messages in session ${session_id}. Session cleared.`;
    }

    // Default response with context
    return await callOpenClaw(text, session_id) + ` (Session ${session_id}, message #${state.messageCount})`;
  };
}