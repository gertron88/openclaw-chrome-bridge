# OpenClaw Chrome Bridge - Cloudflare Workers Relay

This is the Cloudflare Workers implementation of the OpenClaw Chrome Bridge relay server. It provides a scalable, serverless relay for connecting OpenClaw agents with Chrome extension clients.

## Features

- **Serverless Architecture**: Built on Cloudflare Workers for global scale and reliability
- **Durable Objects**: WebSocket state management using Cloudflare Durable Objects
- **D1 Database**: Persistent storage for agents, devices, and authentication tokens
- **JWT Authentication**: Secure token-based authentication with refresh token rotation
- **Rate Limiting**: Built-in rate limiting for pairing attempts and message sending
- **Real-time Communication**: WebSocket-based messaging between agents and clients
- **Multi-tenant Support**: Support for multiple agents and tenant isolation

## Architecture

### Components

1. **Main Worker** (`src/index.ts`): HTTP/WebSocket request router
2. **Durable Objects**:
   - `AgentConnection`: Manages agent WebSocket connections
   - `ClientConnection`: Manages client WebSocket connections  
   - `MessageRouter`: Routes messages between agents and clients
3. **Authentication**: JWT-based with refresh token rotation
4. **Database**: D1 SQLite for persistent storage

### API Endpoints

#### REST API
- `POST /api/pair/start` - Agent requests pairing code
- `POST /api/pair/complete` - Client completes pairing
- `POST /api/token/refresh` - Refresh access token
- `GET /api/agents` - List available agents

#### WebSocket
- `/ws/agent?agent_id=<id>` - Agent WebSocket connection
- `/ws/client` - Client WebSocket connection

## Setup

### Prerequisites

- Node.js 16+
- Wrangler CLI
- Cloudflare account

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Update Wrangler to latest version:
   ```bash
   npm install --save-dev wrangler@latest
   ```

3. Login to Cloudflare:
   ```bash
   npx wrangler login
   ```

### Database Setup

1. Create D1 database:
   ```bash
   npx wrangler d1 create openclaw-relay
   ```

2. Update `wrangler.toml` with your database ID

3. Run migrations:
   ```bash
   npx wrangler d1 migrations apply openclaw-relay
   ```

### Configuration

1. Set environment secrets:
   ```bash
   npx wrangler secret put JWT_SECRET
   npx wrangler secret put AGENT_SECRET
   ```

2. Update `wrangler.toml` with your:
   - Database ID
   - Environment name
   - Domain (if using custom domain)

### Deployment

1. Deploy to Cloudflare Workers:
   ```bash
   npm run deploy
   ```

2. For development:
   ```bash
   npm run dev
   ```

## Environment Variables

Set these as Cloudflare Worker secrets:

- `JWT_SECRET`: Secret key for signing JWT tokens (32+ random characters)
- `AGENT_SECRET` (optional legacy): Global fallback secret for agent authentication when `ALLOW_LEGACY_GLOBAL_AGENT_SECRET=true`.

## Database Schema

The relay uses the following tables:

- `agents`: Agent metadata and authentication
- `pairings`: Temporary pairing codes
- `devices`: Paired client devices
- `refresh_tokens`: Long-lived refresh tokens (hashed)
- `rate_limits`: Rate limiting counters

## Protocol

### WebSocket Messages

#### Chat Request (Client → Agent)
```json
{
  "type": "chat.request",
  "request_id": "unique-id",
  "agent_id": "agent-123",
  "session_id": "session-456", 
  "text": "Hello, agent!",
  "ts": 1640995200000
}
```

#### Chat Response (Agent → Client)  
```json
{
  "type": "chat.response",
  "request_id": "unique-id",
  "agent_id": "agent-123",
  "session_id": "session-456",
  "reply": "Hello, client!",
  "ts": 1640995201000
}
```

#### Presence Update
```json
{
  "type": "presence",
  "agent_id": "agent-123", 
  "online": true,
  "ts": 1640995202000
}
```

### Authentication Flow

1. Agent requests pairing code with agent secret
2. Client enters pairing code and device label
3. Relay generates refresh token and access token
4. Client uses access token for WebSocket authentication
5. Tokens are rotated on refresh

## Monitoring

### Health Check
```bash
curl https://your-worker.your-subdomain.workers.dev/health
```

### Status Dashboard
```bash
curl https://your-worker.your-subdomain.workers.dev/status
```

### Logs
View logs in Cloudflare Dashboard or via CLI:
```bash
npx wrangler tail
```

## Development

### Local Development

1. Start local development server:
   ```bash
   npm run dev
   ```

2. Run local D1 migrations:
   ```bash
   npm run db:migrate:dev
   ```

### Testing

The relay includes built-in rate limiting and validation. Test with:

- WebSocket clients (Chrome extension)
- Agent connectors
- Direct HTTP API calls

### Type Generation

Update TypeScript types after changing `wrangler.toml`:
```bash
npm run types
```

## Security Features

- **Rate Limiting**: Pairing attempts and message frequency
- **Token Rotation**: Refresh tokens are rotated on each use
- **Message Size Limits**: 32KB maximum message size
- **CORS Protection**: Restricted to Chrome extension origins
- **Agent Authentication**: Shared secret for agent connections
- **JWT Validation**: Short-lived access tokens with signature verification

## Scaling

Cloudflare Workers automatically scale globally. Key considerations:

- **Durable Objects**: Each connection uses a separate Durable Object
- **D1 Database**: Shared database with automatic scaling
- **Global Distribution**: Workers run in 300+ locations worldwide
- **Cold Start**: Minimal cold start time (~1ms)

## Troubleshooting

### Common Issues

1. **Database ID mismatch**: Update `wrangler.toml` with correct D1 database ID
2. **Missing secrets**: Set `JWT_SECRET` via `wrangler secret put`
3. **WebSocket connection fails**: Check CORS settings and token validity
4. **Pairing fails**: Verify agent secret and rate limiting

### Debugging

1. Check Wrangler logs:
   ```bash
   npx wrangler tail
   ```

2. Monitor status endpoint for connection counts

3. Verify D1 database content:
   ```bash
   npx wrangler d1 console openclaw-relay
   ```

## Contributing

1. Make changes to source code
2. Test locally with `npm run dev`
3. Deploy to staging environment
4. Run integration tests
5. Deploy to production

## License

MIT License - see LICENSE file for details.