# OpenClaw Agent Connector Skill

Connect Clawdbot/OpenClaw agents to the Chrome Bridge relay for seamless browser-based chat interactions.

## What It Does

The Agent Connector establishes a WebSocket connection to the OpenClaw Chrome Bridge relay server, enabling:

- **Pairing with Chrome Extension**: Generate pairing codes for users to connect their Chrome browser
- **Real-time Chat**: Receive chat messages from Chrome extension users and send responses back
- **Multi-session Support**: Handle multiple concurrent chat sessions with different users
- **Auto-reconnection**: Automatically reconnect to the relay with exponential backoff on connection drops
- **Mock Mode**: Built-in testing handlers that simulate agent responses

## Fastest Setup (Low Friction)

Use this path for production-like setup with the fewest steps:

```bash
cd agent-connector
npm install
npm run build

export RELAY_URL=wss://openclaw-chrome-relay.gertron88.workers.dev
export AGENT_ID=main-agent
export AGENT_SECRET='replace-with-this-agent-secret'
export AGENT_DISPLAY_NAME='Main Agent'

# Terminal 1: keep connector online
npx openclaw-connector start

# Terminal 2: generate pairing code for browser
npx openclaw-connector pair
```

Then in the Chrome extension sidebar:
1. Open **Pair Agent**
2. Select Hosted relay (or Custom if self-hosted)
3. Paste pairing code
4. Click **Start Chatting**

> Production note: `AGENT_SECRET` is **agent-specific**. Do not reuse one secret across all agents.

## Installation

```bash
cd agent-connector
npm install
npm run build
```

## Configuration

Create a `.env` file or set environment variables:

```bash
# Required
RELAY_URL=wss://your-relay-server.com    # WebSocket URL of the relay
AGENT_ID=your-unique-agent-id            # Unique identifier for your agent
AGENT_SECRET=your-agent-secret-key       # Authentication secret
AGENT_DISPLAY_NAME="My OpenClaw Agent"   # Display name shown to users

# Optional (auto-reconnection settings)
RECONNECT_DELAY_MS=1000                  # Initial reconnect delay (default: 1000ms)
MAX_RECONNECT_DELAY_MS=30000            # Maximum reconnect delay (default: 30s)
RECONNECT_BACKOFF_MULTIPLIER=1.5        # Backoff multiplier (default: 1.5)
```

## Usage

### Command Line Interface

```bash
# Start with basic mock handler
openclaw-connector start

# Start with advanced mock handler (session awareness)
openclaw-connector start-advanced

# Generate pairing code for Chrome extension
openclaw-connector pair

# Show help
openclaw-connector help
```

### Programmatic Usage

```typescript
import { AgentConnector, loadConfig } from '@openclaw/agent-connector';

// Load configuration from environment
const config = loadConfig();
const connector = new AgentConnector(config);

// Register chat handler
connector.onChatRequest(async (request) => {
  console.log(`Received: ${request.text}`);
  
  // TODO: Replace with real OpenClaw integration
  return `You said: ${request.text}`;
});

// Set up event listeners
connector.on('connected', () => console.log('Connected'));
connector.on('disconnected', () => console.log('Disconnected'));
connector.on('error', (err) => console.error('Error:', err));

// Connect to relay
await connector.connect();

// Request pairing code for users
const { code, expiresAt } = await connector.requestPairingCode();
console.log(`Pairing code: ${code} (expires: ${expiresAt})`);
```

## Integration with OpenClaw

The connector includes mock handlers for testing. To integrate with real OpenClaw:

1. **Replace Mock Handler**: Replace `callOpenClaw()` in `src/handlers/mock.ts` with real OpenClaw calls
2. **Session Management**: Implement proper session/context management for multi-turn conversations  
3. **Error Handling**: Add OpenClaw-specific error handling and recovery
4. **Capabilities**: Expose OpenClaw capabilities (file access, web browsing, etc.) through chat interface

```typescript
// Example integration structure
async function callOpenClaw(text: string, sessionId: string): Promise<string> {
  // TODO: Implement real OpenClaw integration
  const response = await openclawApi.processMessage(text, {
    sessionId,
    capabilities: ['web_search', 'file_read', 'code_execution'],
  });
  
  return response.message;
}
```

## Pairing Flow

1. **Agent authenticates + generates code**: Use `requestPairingCode()` (or `openclaw-connector pair`) to get a time-limited pairing code
2. **User enters code**: User opens Chrome extension and enters the pairing code
3. **Relay validates**: Relay server validates the code and establishes the connection
4. **Chat enabled**: User can now send messages to the agent through Chrome extension

## Message Flow

1. **User types** in Chrome extension
2. **Extension sends** `chat.request` to relay via WebSocket  
3. **Relay routes** message to connected agent
4. **Agent processes** with registered handler
5. **Agent sends** `chat.response` back through relay
6. **Extension displays** response to user

## Protocol Details

Uses the shared `@openclaw/protocol` package for message validation and types:

- `hello` - Connection establishment with role and agent info
- `chat.request` - User message to agent (includes request_id, session_id, text)
- `chat.response` - Agent response to user (includes request_id, session_id, reply)
- `presence` - Agent online/offline status updates
- `error` - Error messages with codes and descriptions

## Error Handling

- **Connection failures**: Auto-reconnect with exponential backoff
- **Message validation**: Invalid messages are logged and ignored
- **Handler errors**: Caught and converted to user-friendly error messages
- **Rate limiting**: Respects relay server rate limits

## Security

- **Authentication**: Agent secret required for connection (per-agent secret recommended)
- **Message validation**: All messages validated against Zod schemas  
- **Size limits**: Messages limited to 32KB as per protocol
- **Authorization**: Each WebSocket connection requires proper credentials

## Testing

The included mock handlers provide different testing scenarios:

- **Basic Mock**: Simple echo and template responses
- **Advanced Mock**: Session-aware responses with message counting
- **Special Commands**: `/help`, `/status`, `/time`, `/echo`, `/error` for testing

## Troubleshooting

**Connection Issues:**
- Check `RELAY_URL` is correct WebSocket URL (ws:// or wss://)
- Verify `AGENT_SECRET` matches this agent's registered secret in relay
- Ensure relay server is running and accessible
- Ensure this agent is started before generating pairing code

**Pairing Issues:**
- Pairing codes expire after 10 minutes
- Each code can only be used once
- Check agent is connected before requesting codes

**Low-friction Recovery Checklist:**
1. Restart connector: `npx openclaw-connector start`
2. Generate a fresh code: `npx openclaw-connector pair`
3. Re-pair in extension sidebar
4. If auth fails, verify this exact agent's `AGENT_ID` + `AGENT_SECRET`

**Message Issues:**
- Messages over 32KB are rejected
- Invalid JSON or schema violations are ignored
- Handler exceptions are caught and converted to error responses

## Files

- `src/connector.ts` - Main AgentConnector class
- `src/config.ts` - Configuration loading and validation  
- `src/handlers/mock.ts` - Mock handlers for testing
- `src/cli.ts` - Command-line interface
- `src/index.ts` - Main exports

Built on the shared `@openclaw/protocol` package for consistent message handling across the Chrome Bridge system.
