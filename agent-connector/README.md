# OpenClaw Agent Connector

WebSocket-based connector that enables OpenClaw/Clawdbot agents to communicate with Chrome extension users through the OpenClaw Chrome Bridge relay.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your relay URL and agent credentials
   ```

4. **Start with mock handler:**
   ```bash
   npm start
   ```

5. **Generate pairing code:**
   ```bash
   npx openclaw-connector pair
   ```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RELAY_URL` | Yes | WebSocket URL of the relay server (ws:// or wss://) |
| `AGENT_ID` | Yes | Unique identifier for this agent |
| `AGENT_SECRET` | Yes | Agent-specific secret for relay authentication |
| `AGENT_DISPLAY_NAME` | No | Display name shown to users (default: "OpenClaw Agent") |

## CLI Commands

- `openclaw-connector start` - Start with basic mock handler
- `openclaw-connector start-advanced` - Start with advanced mock handler  
- `openclaw-connector pair` - Request pairing code for Chrome extension
- `openclaw-connector help` - Show help information

## Architecture

```
Chrome Extension ←→ Relay Server ←→ Agent Connector ←→ OpenClaw
```

The Agent Connector:
- Establishes outbound WebSocket connection to relay
- Handles pairing code generation for user onboarding
- Routes chat messages between relay and OpenClaw
- Provides auto-reconnection with exponential backoff
- Includes mock handlers for testing without OpenClaw

## Integration

Replace the mock handlers in `src/handlers/mock.ts` with real OpenClaw integration:

```typescript
import { AgentConnector } from '@openclaw/agent-connector';

const connector = new AgentConnector(config);

connector.onChatRequest(async (request) => {
  // TODO: Replace with real OpenClaw call
  const response = await yourOpenClawIntegration(request.text, request.session_id);
  return response;
});
```

## Protocol

Uses shared `@openclaw/protocol` package for message validation and WebSocket communication. See `SKILL.md` for detailed documentation.

## License

MIT