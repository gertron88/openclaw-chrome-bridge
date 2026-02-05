import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { CONFIG } from '../config.js';

const secret = new TextEncoder().encode(CONFIG.JWT_SECRET);

export interface AccessTokenPayload extends JWTPayload {
  agent_id: string;
  device_id: string;
  type: 'access';
}

export interface RefreshTokenPayload extends JWTPayload {
  agent_id: string;
  device_id: string;
  type: 'refresh';
  token_id: string; // Random ID for tracking
}

/**
 * Sign an access token (short-lived, 15 minutes)
 */
export async function signAccessToken(payload: Omit<AccessTokenPayload, 'type' | 'iat' | 'exp' | 'jti'>): Promise<string> {
  return await new SignJWT({
    ...payload,
    type: 'access'
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(CONFIG.JWT_ACCESS_EXPIRES)
    .setJti(crypto.randomUUID())
    .sign(secret);
}

/**
 * Sign a refresh token (long-lived, 7 days)
 */
export async function signRefreshToken(payload: Omit<RefreshTokenPayload, 'type' | 'iat' | 'exp' | 'jti'>): Promise<string> {
  return await new SignJWT({
    ...payload,
    type: 'refresh'
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(CONFIG.JWT_REFRESH_EXPIRES)
    .setJti(crypto.randomUUID())
    .sign(secret);
}

/**
 * Verify and decode an access token
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, secret);
    
    if (payload.type !== 'access') {
      throw new Error('Invalid token type');
    }
    
    return payload as AccessTokenPayload;
  } catch (error) {
    throw new Error(`Invalid access token: ${error.message}`);
  }
}

/**
 * Verify and decode a refresh token
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, secret);
    
    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    
    return payload as RefreshTokenPayload;
  } catch (error) {
    throw new Error(`Invalid refresh token: ${error.message}`);
  }
}

/**
 * Extract token from Authorization header
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  return authHeader.substring(7); // Remove 'Bearer ' prefix
}

/**
 * Get the expiration time for access tokens in seconds
 */
export function getAccessTokenExpiresIn(): number {
  // 15 minutes in seconds
  return 15 * 60;
}