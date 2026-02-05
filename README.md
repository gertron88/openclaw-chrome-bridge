# OpenClaw Chrome Chat Bridge

A production-ready bridge system enabling Chrome extension users to chat with AI agents (Clawdbot/OpenClaw) through a relay server.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Chrome         │     │  Relay Server   │     │  Agent          │     │  Clawdbot/      │
│  Extension      │◄───►│  (Self-host or  │◄───►│  Connector      │◄───►│  OpenClaw       │
│                 │ WSS │  Cloudflare)    │ WSS │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Components

| Directory | Description |
|-----------|-------------|
| `protocol/` | Shared TypeScript types and Zod schemas |
| `relay-selfhost/` | Node.js relay server (Fastify + WebSocket + SQLite) |
| `relay-cloudflare/` | Cloudflare Workers relay (Durable Objects + D1) |
| `agent-connector/` | Clawdbot skill for connecting agents to relay |
| `chrome-extension/` | Chrome MV3 extension with multi-agent chat UI |

## Quick Start

### 1. Install Dependencies

```bash
# Install all workspaces
npm install

# Or install individually
cd protocol && npm install && npm run build
cd ../relay-selfhost && npm install
cd ../agent-connector && npm install && npm run build
cd ../chrome-extension && npm install && npm run build
```

### 2. Choose Your Relay

#### Option A: Self-Hosted Relay (Free)

```bash
cd relay-selfhost

# Configure environment
cp .env.example .env
# Edit .env with your settings (JWT_SECRET, etc.)

# Initialize database
npm run db:init

# Start server
npm run start
```

#### Option B: Cloudflare Relay (Hosted)

```bash
cd relay-cloudflare

# Login to Cloudflare
npx wrangler login

# Create D1 database
npx wrangler d1 create openclaw-relay
# Update wrangler.toml with database_id

# Run migrations
npx wrangler d1 execute openclaw-relay --file=src/db/schema.sql

# Set secrets
npx wrangler secret put JWT_SECRET
npx wrangler secret put AGENT_SECRET

# Deploy
npm run deploy
```

### 3. Start Agent Connector

```bash
cd agent-connector

# Configure
cp .env.example .env
# Set RELAY_URL, AGENT_ID, AGENT_SECRET

# Start with mock handler (for testing)
npm run start
```

### 4. Install Chrome Extension

```bash
cd chrome-extension
npm run build
```

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `chrome-extension/dist` folder

### 5. Pair Extension with Agent

1. In agent connector, run: `npm run pair`
2. Copy the 6-digit pairing code
3. In Chrome extension, click "Add Agent"
4. Enter the pairing code
5. Start chatting!

## Protocol

All components use a unified protocol defined in `protocol/`:

### REST Endpoints
- `POST /api/pair/start` - Agent requests pairing code
- `POST /api/pair/complete` - Client completes pairing
- `POST /api/token/refresh` - Refresh access token
- `GET /api/agents` - List paired agents

### WebSocket Messages
- `hello` - Connection handshake
- `presence` - Agent online/offline status
- `chat.request` - Client sends message to agent
- `chat.response` - Agent replies to client
- `error` - Error response

## Security

- **JWT Authentication** - 15-minute access tokens, rotating refresh tokens
- **Rate Limiting** - Pairing attempts and message frequency
- **Message Size Limit** - 32KB max per message
- **No Transcript Storage** - Relay is pass-through only
- **Hashed Tokens** - Refresh tokens stored hashed in database

## Development

```bash
# Protocol - build types
cd protocol && npm run build

# Relay - development mode
cd relay-selfhost && npm run dev

# Chrome extension - watch mode
cd chrome-extension && npm run dev

# Agent connector - with mock handler
cd agent-connector && npm run start
```

## Business Model

- **Self-hosted relay**: Free, self-managed
- **Cloudflare hosted relay**: Paid tier with zero-config reliability

## License

MIT
