import { createHash, randomBytes } from 'crypto';
import { getDatabase } from '../db/index.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, getAccessTokenExpiresIn } from './jwt.js';

/**
 * Generate a cryptographically secure random token
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Hash a token for secure storage
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a pairing code (6-character alphanumeric)
 */
export function generatePairingCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Create access and refresh token pair
 */
export async function createTokenPair(agentId: string, deviceId: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const db = getDatabase();
  
  // Generate tokens
  const refreshTokenValue = generateSecureToken(48);
  const tokenId = crypto.randomUUID();
  
  const accessToken = await signAccessToken({
    agent_id: agentId,
    device_id: deviceId
  });
  
  const refreshToken = await signRefreshToken({
    agent_id: agentId,
    device_id: deviceId,
    token_id: tokenId
  });
  
  // Store refresh token hash in database
  const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days
  const tokenHash = hashToken(refreshToken);
  
  db.storeRefreshToken({
    token_hash: tokenHash,
    agent_id: agentId,
    device_id: deviceId,
    expires_at: expiresAt
  });
  
  return {
    accessToken,
    refreshToken,
    expiresIn: getAccessTokenExpiresIn()
  };
}

/**
 * Refresh an access token using a refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const db = getDatabase();
  
  // Verify refresh token format
  let payload;
  try {
    payload = await verifyRefreshToken(refreshToken);
  } catch (error) {
    throw new Error('Invalid refresh token format');
  }
  
  // Check if refresh token exists in database and is valid
  const tokenHash = hashToken(refreshToken);
  const storedToken = db.getRefreshToken(tokenHash);
  
  if (!storedToken) {
    throw new Error('Refresh token not found or expired');
  }
  
  if (storedToken.agent_id !== payload.agent_id || storedToken.device_id !== payload.device_id) {
    throw new Error('Token payload mismatch');
  }
  
  // Revoke old refresh token
  db.revokeRefreshToken(tokenHash);
  
  // Create new token pair
  return await createTokenPair(payload.agent_id, payload.device_id);
}

/**
 * Revoke a refresh token
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const db = getDatabase();
  const tokenHash = hashToken(refreshToken);
  db.revokeRefreshToken(tokenHash);
}

/**
 * Revoke all refresh tokens for a device
 */
export async function revokeAllTokensForDevice(deviceId: string): Promise<void> {
  const db = getDatabase();
  
  // This would require a new database method
  // For now, we'll need to add this to the database class
  console.warn('revokeAllTokensForDevice not implemented - would need database method');
}

/**
 * Generate a device ID
 */
export function generateDeviceId(): string {
  return `device_${crypto.randomUUID()}`;
}