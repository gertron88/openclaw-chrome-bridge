import { signJWT, JWTPayload } from './jwt';
import { CONFIG } from '@/config';

/**
 * Generate a cryptographically secure random token
 */
export function generateRefreshToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate device ID
 */
export function generateDeviceId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a token using SHA-256
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create access token for a device
 */
export async function createAccessToken(
  deviceId: string,
  agentId: string,
  tenantId: string | null,
  secret: string
): Promise<string> {
  const payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss'> = {
    sub: deviceId,
    agent_id: agentId,
    ...(tenantId && { tenant_id: tenantId }),
  };
  
  return await signJWT(payload, secret);
}

/**
 * Store refresh token in database
 */
export async function storeRefreshToken(
  db: D1Database,
  refreshToken: string,
  deviceId: string,
  agentId: string
): Promise<void> {
  const tokenHash = await hashToken(refreshToken);
  const expiresAt = Math.floor(Date.now() / 1000) + CONFIG.JWT.REFRESH_TOKEN_TTL;
  
  await db.prepare(`
    INSERT OR REPLACE INTO refresh_tokens (token_hash, device_id, agent_id, expires_at)
    VALUES (?, ?, ?, ?)
  `).bind(tokenHash, deviceId, agentId, expiresAt).run();
}

/**
 * Verify and consume refresh token (rotation)
 */
export async function refreshAccessToken(
  db: D1Database,
  refreshToken: string,
  secret: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null> {
  const tokenHash = await hashToken(refreshToken);
  const now = Math.floor(Date.now() / 1000);
  
  // Find and verify the refresh token
  const result = await db.prepare(`
    SELECT rt.device_id, rt.agent_id, d.tenant_id
    FROM refresh_tokens rt
    JOIN devices d ON rt.device_id = d.id
    WHERE rt.token_hash = ? AND rt.expires_at > ?
  `).bind(tokenHash, now).first();
  
  if (!result) {
    return null;
  }
  
  const deviceId = result.device_id as string;
  const agentId = result.agent_id as string;
  const tenantId = result.tenant_id as string | null;
  
  // Generate new tokens
  const newRefreshToken = generateRefreshToken();
  const accessToken = await createAccessToken(deviceId, agentId, tenantId, secret);
  
  // Delete old refresh token and store new one (rotation)
  await db.batch([
    db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').bind(tokenHash),
    db.prepare(`
      INSERT INTO refresh_tokens (token_hash, device_id, agent_id, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(
      await hashToken(newRefreshToken),
      deviceId,
      agentId,
      now + CONFIG.JWT.REFRESH_TOKEN_TTL
    )
  ]);
  
  // Update device last_seen
  await db.prepare(`
    UPDATE devices SET last_seen_at = ? WHERE id = ?
  `).bind(now, deviceId).run();
  
  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: CONFIG.JWT.ACCESS_TOKEN_TTL,
  };
}

/**
 * Clean up expired tokens
 */
export async function cleanupExpiredTokens(db: D1Database): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  
  // Clean up expired refresh tokens
  await db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?').bind(now).run();
  
  // Clean up expired pairings
  await db.prepare('DELETE FROM pairings WHERE expires_at < ?').bind(now).run();
  
  // Clean up old rate limit entries (older than 1 hour)
  await db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - 3600).run();
}