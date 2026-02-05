# OpenClaw / Clawdbot Chrome Chat Bridge - Full Specification

## Overview
Build a production-ready HYBRID monorepo for "OpenClaw / Clawdbot Chrome Chat Bridge" with 3 components:

## Components

### (1) Relay Server (HYBRID)
- Self-hosted mode: Node/TypeScript HTTPS+WSS relay that runs locally or on a VPS/VM.
- Cloud mode: Cloudflare Workers + Durable Objects + D1 implementing the SAME protocol as self-hosted.
- BOTH modes are "pass-through only" (no transcript storage in the relay). Relay only routes messages and stores auth/pairing/device metadata.

### (2) Agent Connector Skill (Node/TypeScript)
- Runs alongside Clawdbot/OpenClaw.
- Connects OUTBOUND via WSS to a relay (self-hosted relay URL OR hosted Cloudflare relay URL).
- Provides "pair chrome" command that generates a pairing code (through the relay) and returns it to the human.
- For now uses a placeholder callOpenClaw(text, session_id) that echoes or mock-responds; implement a clean interface to wire to real OpenClaw later.

### (3) Chrome Extension (Manifest V3)
- Pairing screen (enter pairing code + choose relay mode).
- Multi-agent UI: show agent list/tabs; user can chat with multiple agents.
- "Sessions" (Option A): per-agent conversation threads; scrollback per session is stored locally only in chrome.storage.session and expires after 24 hours OR when the browser closes.
- Chrome Sync: store refresh token(s), device_id(s), and relay endpoint in chrome.storage.sync so the extension works across Chrome profiles/devices (when Chrome Sync enabled).
- No transcript stored in cloud relay.

## Core Business Model / UX
- Self-hosted relay is free/self-managed (good for early adopters).
- Cloudflare hosted relay is a paid tier (multi-agent orchestration, zero-config reliability).
- Extension should support BOTH by allowing:
  - Hosted Relay: select "Hosted" and sign in / paste hosted pairing code
  - Custom Relay: paste relay URL + pairing code
- Use one unified "Relay Protocol" so both backends are interchangeable.

## Absolute Requirements

### One Unified Protocol
- Message formats shared across self-hosted and cloud relay.

### Pairing Flow
- Agent requests pairing code via relay (agent-authenticated)
- Human enters pairing code in extension
- Relay exchanges pairing code for refresh_token + access_token (rotation supported)

### Auth
- access token = short-lived (15 min) JWT
- refresh token = long-lived, rotated on refresh
- refresh tokens stored hashed in DB (D1 for Cloudflare, SQLite/Postgres for self-hosted)

### Realtime Transport
- Browser client uses WSS to relay for realtime messages and presence
- Agent connector uses outbound WSS to relay
- Relay routes chat.request and chat.response

### Offline Handling
- Relay indicates agent online/offline
- Optional in-memory queue for <= 60s, <= 10 messages per agent/session (ephemeral), then fail gracefully

### Security
- Rate limit pairing attempts
- Cap message size to 32KB
- Require Authorization for client websocket and chat send
- Do not commit secrets

### Multi-agent
- User can pair multiple agents
- Extension shows them in tabs / list
- Each message includes agent_id + session_id + request_id

## Monorepo Structure
```
openclaw-chrome-bridge/
  protocol/                 # shared TS types + message schema validation (zod)
  relay-selfhost/           # Node/TS relay implementation
  relay-cloudflare/         # Cloudflare Workers/DO/D1 implementation
  agent-connector/          # Node/TS connector "skill"
  chrome-extension/         # MV3 extension
  docs/
  .gitignore
  README.md
```

## Protocol (shared across relays)

### REST Endpoints
- `POST /api/pair/start` (agent-auth) => `{code, expires_at, agent_id}`
- `POST /api/pair/complete` (public) => `{code, device_label}` => `{refresh_token, access_token, agent_id, agent_display_name}`
- `POST /api/token/refresh` (public) => `{refresh_token}` => `{access_token, refresh_token(new), expires_in}`
- `GET /api/agents` (auth) => list agents paired/available for this user/device

### WebSocket Endpoints
- `/ws/agent?agent_id=...` (agent connector) uses Agent Secret to auth (header or first message)
- `/ws/client` (chrome extension) uses access token (JWT) to auth

### WS Message Types (JSON with Zod schemas)
```typescript
{type:"hello", role:"agent"|"client", agent_id?, device_id?, tenant_id?, ...}
{type:"presence", agent_id, online:boolean, ts}
{type:"chat.request", request_id, agent_id, session_id, text, ts}
{type:"chat.response", request_id, agent_id, session_id, reply, ts}
{type:"error", request_id?, code, message}
```
Require request_id correlation.

## Self-Host Relay Implementation (Node/TS)
- Use Fastify (preferred) or Express + ws library
- HTTPS support:
  - For dev: allow HTTP
  - For prod: support TLS cert paths via env (or recommend Caddy/Traefik for TLS termination)
- DB: SQLite via better-sqlite3 (default) or Postgres via pg

## Cloudflare Relay Implementation
- Cloudflare Workers for HTTP/REST
- Durable Objects for WebSocket state management
- D1 for persistent storage (tokens, pairings, device metadata)

## Chrome Extension (MV3)
- Service worker for background WSS connection
- Popup UI for agent list and quick actions
- Side panel or new tab for full chat UI
- chrome.storage.session for local scrollback (24h expiry)
- chrome.storage.sync for refresh tokens and device IDs
