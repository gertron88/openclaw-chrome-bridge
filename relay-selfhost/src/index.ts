import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { readFileSync, existsSync } from 'fs';
import { CONFIG } from './config.js';
import { getDatabase } from './db/index.js';
import { setupWebSocketRouter } from './ws/router.js';
import { pairRoutes } from './routes/pair.js';
import { tokenRoutes } from './routes/token.js';
import { agentRoutes } from './routes/agents.js';
import { corsMiddleware, securityHeaders } from './middleware/ratelimit.js';

async function createServer() {
  // Determine if we should use HTTPS
  const useHttps = CONFIG.IS_PRODUCTION && CONFIG.TLS_CERT_PATH && CONFIG.TLS_KEY_PATH;
  
  let httpsOptions;
  if (useHttps) {
    if (!existsSync(CONFIG.TLS_CERT_PATH!) || !existsSync(CONFIG.TLS_KEY_PATH!)) {
      console.error('TLS certificate or key file not found');
      process.exit(1);
    }
    
    httpsOptions = {
      cert: readFileSync(CONFIG.TLS_CERT_PATH!),
      key: readFileSync(CONFIG.TLS_KEY_PATH!)
    };
  }

  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      level: CONFIG.NODE_ENV === 'development' ? 'debug' : 'info',
      transport: CONFIG.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: {
          colorize: true
        }
      } : undefined
    },
    https: httpsOptions
  });

  // Register WebSocket support
  await fastify.register(websocket);

  // Global middleware
  fastify.addHook('onRequest', corsMiddleware);
  fastify.addHook('onRequest', securityHeaders);

  // Health check endpoint
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      environment: CONFIG.NODE_ENV
    };
  });

  // API routes
  await fastify.register(pairRoutes, { prefix: '/api' });
  await fastify.register(tokenRoutes, { prefix: '/api' });
  await fastify.register(agentRoutes, { prefix: '/api' });

  // WebSocket routes
  await setupWebSocketRouter(fastify);

  // 404 handler
  fastify.setNotFoundHandler(async (request, reply) => {
    reply.status(404).send({
      error: 'Not Found',
      message: 'The requested endpoint does not exist',
      path: request.url
    });
  });

  // Error handler
  fastify.setErrorHandler(async (error, request, reply) => {
    fastify.log.error('Request error:', error);
    
    // Don't expose internal errors in production
    if (CONFIG.IS_PRODUCTION && error.statusCode !== 400 && error.statusCode !== 401 && error.statusCode !== 403 && error.statusCode !== 404) {
      reply.status(500).send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      });
    } else {
      reply.status(error.statusCode || 500).send({
        error: error.name || 'Error',
        message: error.message
      });
    }
  });

  return fastify;
}

async function gracefulShutdown(fastify: Fastify.FastifyInstance, signal: string) {
  console.log(`Received ${signal}, starting graceful shutdown...`);
  
  try {
    // Close WebSocket connections
    console.log('Closing WebSocket connections...');
    
    // Close database
    console.log('Closing database...');
    getDatabase().close();
    
    // Close Fastify server
    await fastify.close();
    console.log('Server closed successfully');
    
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

async function start() {
  try {
    console.log('🚀 Starting OpenClaw Relay Server...');
    console.log(`Environment: ${CONFIG.NODE_ENV}`);
    console.log(`Database: ${CONFIG.DB_PATH}`);
    
    // Initialize database
    const db = getDatabase();
    console.log('✅ Database initialized');
    
    // Create and start server
    const fastify = await createServer();
    
    // Setup graceful shutdown
    process.on('SIGINT', () => gracefulShutdown(fastify, 'SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown(fastify, 'SIGTERM'));
    
    // Start listening
    const address = await fastify.listen({
      port: CONFIG.PORT,
      host: CONFIG.HOST
    });
    
    console.log(`✅ Server listening at ${address}`);
    console.log(`📡 WebSocket endpoints:`);
    console.log(`   - Agent: ${address}/ws/agent?agent_id=<ID>`);
    console.log(`   - Client: ${address}/ws/client`);
    console.log(`🛠️  API endpoints:`);
    console.log(`   - POST ${address}/api/pair/start`);
    console.log(`   - POST ${address}/api/pair/complete`);
    console.log(`   - POST ${address}/api/token/refresh`);
    console.log(`   - GET  ${address}/api/agents`);
    console.log(`   - GET  ${address}/health`);
    
    if (CONFIG.NODE_ENV === 'development') {
      console.log(`⚠️  Development mode - CORS enabled for all origins`);
    }
    
    if (!CONFIG.IS_PRODUCTION && CONFIG.JWT_SECRET === 'your-super-secret-jwt-key-change-this-in-production') {
      console.log(`⚠️  WARNING: Using default JWT secret. Please set JWT_SECRET environment variable for production!`);
    }

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
start();