import { config } from 'dotenv';

config();

export const CONFIG = {
  // Server settings
  PORT: parseInt(process.env.PORT || '3000'),
  HOST: process.env.HOST || '0.0.0.0',
  
  // JWT settings
  JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
  JWT_ACCESS_EXPIRES: '15m',
  JWT_REFRESH_EXPIRES: '7d',
  
  // Database settings
  DB_PATH: process.env.DB_PATH || './relay.db',
  
  // TLS settings (optional)
  TLS_KEY_PATH: process.env.TLS_KEY_PATH,
  TLS_CERT_PATH: process.env.TLS_CERT_PATH,
  
  // Rate limiting
  PAIRING_RATE_LIMIT: parseInt(process.env.PAIRING_RATE_LIMIT || '5'), // attempts per hour
  
  // Message limits
  MAX_MESSAGE_SIZE: 32 * 1024, // 32KB
  
  // Offline queue settings
  OFFLINE_QUEUE_TTL_MS: 60 * 1000, // 60 seconds
  OFFLINE_QUEUE_MAX_MESSAGES: 10,
  
  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production'
};

// Validate required environment variables
if (CONFIG.IS_PRODUCTION) {
  if (CONFIG.JWT_SECRET === 'your-super-secret-jwt-key-change-this-in-production') {
    console.error('ERROR: JWT_SECRET must be set in production');
    process.exit(1);
  }
}