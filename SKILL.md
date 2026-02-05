# OpenClaw Chrome Chat Bridge

A complete system for connecting AI agents (Clawdbot/OpenClaw) to users via a Chrome extension through a secure relay server.

## Overview

This skill provides a full Chrome Chat Bridge system with:
- **Relay Servers** - Self-hosted (Node.js) or Cloudflare Workers
- **Agent Connector** - Node.js skill for connecting agents to the relay
- **Chrome Extension** - MV3 extension for multi-agent chat

## Architecture

```
Chrome Extension ←→ Relay Server ←→ Agent Connector ←→ Clawdbot/OpenClaw
```

## Components

### 1. Protocol (`protocol/`)
Shared TypeScript types and Zod schemas for message validation.

### 2. Relay Server (choose one)

**Self-hosted** (`relay-selfhost/`):
- Node.js + Fastify + WebSocket
- SQLite database (sql.js)
- Run on your own VPS

**Cloudflare** (`relay-cloudflare/`):
- Cloudflare Workers + Durable Objects + D1
- Serverless, globally distributed
- Zero-config deployment

### 3. Agent Connector (`agent-connector/`)
Node.js skill that connects your agent to the relay.

### 4. Chrome Extension (`chrome-extension/`)
MV3 extension with pairing, multi-agent chat, and local storage.

## Quick Start

### For Users (Chrome Extension)
1. Install from Chrome Web Store (coming soon)
2. Click extension icon → "Add Agent"
3. Enter pairing code from your agent
4. Start chatting!

### For Agent Operators

**Option A: Use Hosted Relay**
```bash
cd agent-connector
npm install
cp .env.example .env
# Set RELAY_URL=https://openclaw-chrome-relay.gertron88.workers.dev
npm start
```

**Option B: Self-Host Relay**
```bash
cd relay-selfhost
npm install
cp .env.example .env
npm run build
npm start
```

## Security

- JWT authentication with refresh token rotation
- No chat transcripts stored in relay (pass-through only)
- 32KB message size limit
- Rate limiting on pairing attempts
- Local-only chat storage in Chrome (24h expiry)

## API Reference

### REST Endpoints
- `POST /api/pair/start` - Agent requests pairing code
- `POST /api/pair/complete` - Client completes pairing
- `POST /api/token/refresh` - Refresh access token
- `GET /api/agents` - List paired agents

### WebSocket Messages
- `hello` - Connection handshake
- `presence` - Agent online/offline status
- `chat.request` - Client sends message
- `chat.response` - Agent replies
- `error` - Error response

## Configuration

### Environment Variables

**Agent Connector:**
```env
RELAY_URL=https://your-relay.example.com
AGENT_ID=your-agent-id
AGENT_SECRET=your-secret
AGENT_DISPLAY_NAME=My Agent
```

**Self-hosted Relay:**
```env
PORT=3000
JWT_SECRET=your-jwt-secret
DB_PATH=./data/relay.db
```

## License

MIT
