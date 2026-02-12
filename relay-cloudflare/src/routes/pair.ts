import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { CONFIG, generatePairingCode, type CloudflareBindings } from '@/config';
import { generateRefreshToken, generateDeviceId, createAccessToken, storeRefreshToken, hashToken } from '@/auth/tokens';
import { getAccountFromBearer, canAccountAddAgent } from '@/auth/account';

const app = new Hono<{ Bindings: CloudflareBindings }>();

// Validation schemas
const startPairingSchema = z.object({
  agent_id: z.string().min(1),
  display_name: z.string().min(1).max(100),
  tenant_id: z.string().optional(),
});

const completePairingSchema = z.object({
  code: z.string().length(CONFIG.PAIRING.CODE_LENGTH),
  device_label: z.string().min(1).max(100),
});

/**
 * Rate limiting helper
 */
async function checkRateLimit(
  db: D1Database,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds;
  
  const result = await db.prepare(`
    SELECT count, window_start
    FROM rate_limits
    WHERE key = ? AND window_start > ?
  `).bind(key, windowStart).first();
  
  if (!result) {
    // First request in this window
    await db.prepare(`
      INSERT OR REPLACE INTO rate_limits (key, count, window_start)
      VALUES (?, 1, ?)
    `).bind(key, now).run();
    return true;
  }
  
  const count = result.count as number;
  if (count >= limit) {
    return false;
  }
  
  // Increment counter
  await db.prepare(`
    UPDATE rate_limits SET count = count + 1, updated_at = ?
    WHERE key = ?
  `).bind(now, key).run();
  
  return true;
}

/**
 * POST /api/pair/start
 * Agent requests a pairing code
 */
app.post('/start', zValidator('json', startPairingSchema), async (c) => {
  const { DB, AGENT_SECRET } = c.env;
  const { agent_id, display_name, tenant_id } = c.req.valid('json');
  
  // Verify agent authorization
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing Authorization header' }, 401);
  }
  
  const providedSecret = authHeader.slice(7);
  if (providedSecret !== AGENT_SECRET) {
    return c.json({ error: 'Invalid agent secret' }, 401);
  }
  
  // Rate limit by agent_id
  const clientIP = c.req.header('CF-Connecting-IP') || 'unknown';
  const rateLimitKey = `${clientIP}:pairing`;
  
  const allowed = await checkRateLimit(
    DB,
    rateLimitKey,
    CONFIG.RATE_LIMIT.PAIRING_ATTEMPTS,
    CONFIG.RATE_LIMIT.PAIRING_WINDOW
  );
  
  if (!allowed) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }
  
  try {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + CONFIG.PAIRING.CODE_TTL;
    const code = generatePairingCode();
    
    // Store or update agent
    const secretHash = await hashToken(AGENT_SECRET);
    await DB.prepare(`
      INSERT OR REPLACE INTO agents (id, display_name, secret_hash, tenant_id, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(agent_id, display_name, secretHash, tenant_id || null, now).run();
    
    // Store pairing code (cleanup any existing codes for this agent)
    await DB.batch([
      DB.prepare('DELETE FROM pairings WHERE agent_id = ?').bind(agent_id),
      DB.prepare(`
        INSERT INTO pairings (code, agent_id, expires_at)
        VALUES (?, ?, ?)
      `).bind(code, agent_id, expiresAt)
    ]);
    
    return c.json({
      code,
      expires_at: expiresAt,
      agent_id,
    });
    
  } catch (error) {
    console.error('Pairing start error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /api/pair/complete
 * Client completes pairing with code
 */
app.post('/complete', zValidator('json', completePairingSchema), async (c) => {
  const { DB, JWT_SECRET } = c.env;
  const { code, device_label } = c.req.valid('json');
  
  // Rate limit by IP
  const clientIP = c.req.header('CF-Connecting-IP') || 'unknown';
  const rateLimitKey = `${clientIP}:pairing`;
  
  const allowed = await checkRateLimit(
    DB,
    rateLimitKey,
    CONFIG.RATE_LIMIT.PAIRING_ATTEMPTS,
    CONFIG.RATE_LIMIT.PAIRING_WINDOW
  );
  
  if (!allowed) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }
  
  try {
    const now = Math.floor(Date.now() / 1000);
    
    // Find valid pairing
    const pairing = await DB.prepare(`
      SELECT p.agent_id, p.attempts, a.display_name, a.tenant_id
      FROM pairings p
      JOIN agents a ON p.agent_id = a.id
      WHERE p.code = ? AND p.expires_at > ?
    `).bind(code, now).first();
    
    if (!pairing) {
      return c.json({ error: 'Invalid or expired pairing code' }, 400);
    }
    
    const attempts = pairing.attempts as number;
    if (attempts >= CONFIG.PAIRING.MAX_ATTEMPTS) {
      return c.json({ error: 'Too many pairing attempts' }, 400);
    }
    
    // Increment attempt counter
    await DB.prepare(`
      UPDATE pairings SET attempts = attempts + 1 WHERE code = ?
    `).bind(code).run();
    
    const agentId = pairing.agent_id as string;
    const agentDisplayName = pairing.display_name as string;
    const tenantId = pairing.tenant_id as string | null;

    // Enforce freemium limits (if user is signed into billing)
    const account = await getAccountFromBearer(DB, c.req.header('Authorization'));
    if (account) {
      const canAddAgent = await canAccountAddAgent(DB, account);
      if (!canAddAgent) {
        const alreadyLinked = await DB.prepare(`
          SELECT 1 FROM account_agents WHERE account_id = ? AND agent_id = ? LIMIT 1
        `).bind(account.id, agentId).first();

        if (!alreadyLinked) {
          return c.json({ error: 'Free plan limit reached. Upgrade to pair more than one agent.' }, 402);
        }
      }
    }
    
    // Generate device and tokens
    const deviceId = generateDeviceId();
    const refreshToken = generateRefreshToken();
    const accessToken = await createAccessToken(deviceId, agentId, tenantId, JWT_SECRET);
    
    // Store device and refresh token
    await DB.batch([
      DB.prepare(`
        INSERT INTO devices (id, label, agent_id, tenant_id, last_seen_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(deviceId, device_label, agentId, tenantId, now),
      
      // Delete used pairing code
      DB.prepare('DELETE FROM pairings WHERE code = ?').bind(code)
    ]);

    if (account) {
      await DB.prepare(`
        INSERT OR IGNORE INTO account_agents (account_id, agent_id, linked_at)
        VALUES (?, ?, ?)
      `).bind(account.id, agentId, now).run();
    }
    
    // Store refresh token
    await storeRefreshToken(DB, refreshToken, deviceId, agentId);
    
    return c.json({
      refresh_token: refreshToken,
      access_token: accessToken,
      agent_id: agentId,
      agent_display_name: agentDisplayName,
      device_id: deviceId,
      expires_in: CONFIG.JWT.ACCESS_TOKEN_TTL,
    });
    
  } catch (error) {
    console.error('Pairing complete error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;