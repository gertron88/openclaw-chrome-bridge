import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { type CloudflareBindings } from './config';
import { cleanupExpiredTokens } from './auth/tokens';

// Import route handlers
import pairRoutes from './routes/pair';
import tokenRoutes from './routes/token';
import agentsRoutes from './routes/agents';

// Import Durable Object classes
export { AgentConnection } from './durable-objects/AgentConnection';
export { ClientConnection } from './durable-objects/ClientConnection';
export { MessageRouter } from './durable-objects/MessageRouter';

const app = new Hono<{ Bindings: CloudflareBindings }>();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: (origin) => {
    // Allow Chrome extension origins and localhost for development
    if (!origin) return true; // Allow non-browser requests
    if (origin.startsWith('chrome-extension://')) return true;
    if (origin.startsWith('http://localhost')) return true;
    if (origin.startsWith('https://localhost')) return true;
    return false;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Health check
app.get('/health', (c) => {
  return c.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API routes
app.route('/api/pair', pairRoutes);
app.route('/api/token', tokenRoutes);
app.route('/api/agents', agentsRoutes);

// WebSocket endpoints
app.get('/ws/agent', async (c) => {
  const agentId = c.req.query('agent_id');
  if (!agentId) {
    return c.text('Missing agent_id parameter', 400);
  }

  // Get AgentConnection Durable Object
  const id = c.env.AGENT_CONNECTION.idFromName(`agent-${agentId}`);
  const durableObject = c.env.AGENT_CONNECTION.get(id);
  
  // Forward the request to the Durable Object
  const url = new URL(c.req.url);
  url.pathname = '/websocket';
  
  return durableObject.fetch(new Request(url.toString(), c.req.raw));
});

app.get('/ws/client', async (c) => {
  const authHeader = c.req.header('Authorization');
  const accessToken = c.req.query('access_token');
  const hasBearerHeader = Boolean(authHeader && authHeader.startsWith('Bearer '));

  if (!hasBearerHeader && !accessToken) {
    return c.text('Missing Authorization header or access_token query parameter', 401);
  }

  // For client connections, we use a random ID since multiple clients
  // from the same device might connect simultaneously
  const connectionId = crypto.randomUUID();
  const id = c.env.CLIENT_CONNECTION.idFromString(connectionId);
  const durableObject = c.env.CLIENT_CONNECTION.get(id);

  // Forward the request to the Durable Object and normalize auth transport
  const url = new URL(c.req.url);
  url.pathname = '/websocket';

  const headers = new Headers(c.req.raw.headers);
  if (!hasBearerHeader && accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  return durableObject.fetch(new Request(url.toString(), {
    method: c.req.raw.method,
    headers,
    body: c.req.raw.body,
  }));
});

// Status endpoint for monitoring
app.get('/status', async (c) => {
  try {
    // Get status from MessageRouter
    const routerId = c.env.MESSAGE_ROUTER.idFromName('global');
    const routerStub = c.env.MESSAGE_ROUTER.get(routerId);
    const routerResponse = await routerStub.fetch('http://internal/status');
    const routerStatus = await routerResponse.json();
    
    // Get database stats
    const stats = await c.env.DB.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM agents) as agent_count,
        (SELECT COUNT(*) FROM devices) as device_count,
        (SELECT COUNT(*) FROM pairings) as active_pairings,
        (SELECT COUNT(*) FROM refresh_tokens) as active_tokens
    `).first();
    
    return c.json({
      status: 'operational',
      timestamp: new Date().toISOString(),
      database: stats,
      connections: routerStatus,
    });
  } catch (error) {
    console.error('Status check failed:', error);
    return c.json({
      status: 'error',
      error: 'Status check failed',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Cleanup endpoint (can be called by cron jobs)
app.post('/cleanup', async (c) => {
  try {
    await cleanupExpiredTokens(c.env.DB);
    return c.json({ status: 'completed', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Cleanup failed:', error);
    return c.json({ status: 'failed', error: 'Cleanup failed' }, 500);
  }
});

// Error handling
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({
    error: 'Internal server error',
    timestamp: new Date().toISOString(),
  }, 500);
});

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not found',
    path: c.req.path,
    method: c.req.method,
  }, 404);
});

export default app;

// Scheduled event handler for periodic cleanup
export async function scheduled(
  controller: ScheduledController,
  env: CloudflareBindings,
  ctx: ExecutionContext
): Promise<void> {
  switch (controller.scheduledTime) {
    default:
      // Run cleanup every hour
      ctx.waitUntil(cleanupExpiredTokens(env.DB));
      break;
  }
}