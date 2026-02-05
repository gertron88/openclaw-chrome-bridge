import { Hono } from 'hono';
import { type CloudflareBindings } from '@/config';
import { verifyJWT } from '@/auth/jwt';

const app = new Hono<{ Bindings: CloudflareBindings }>();

/**
 * JWT middleware for client authentication
 */
const jwtAuth = async (c: any, next: any) => {
  const { JWT_SECRET } = c.env;
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing Authorization header' }, 401);
  }
  
  const token = authHeader.slice(7);
  const payload = await verifyJWT(token, JWT_SECRET);
  
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
  
  c.set('jwt_payload', payload);
  await next();
};

/**
 * GET /api/agents
 * Get list of available agents for the authenticated device
 */
app.get('/', jwtAuth, async (c) => {
  const { DB } = c.env;
  const jwtPayload = c.get('jwt_payload');
  
  try {
    // Get the device to determine tenant context
    const device = await DB.prepare(`
      SELECT tenant_id FROM devices WHERE id = ?
    `).bind(jwtPayload.sub).first();
    
    if (!device) {
      return c.json({ error: 'Device not found' }, 404);
    }
    
    const tenantId = device.tenant_id as string | null;
    const now = Math.floor(Date.now() / 1000);
    
    // Get agents in the same tenant (or null tenant if device has null tenant)
    let query = `
      SELECT 
        a.id,
        a.display_name,
        a.tenant_id,
        a.last_seen_at,
        CASE 
          WHEN a.last_seen_at IS NULL THEN false
          WHEN a.last_seen_at > ? THEN true
          ELSE false
        END as online
      FROM agents a
    `;
    
    const params: any[] = [now - 300]; // Consider online if seen within 5 minutes
    
    if (tenantId) {
      query += ' WHERE a.tenant_id = ?';
      params.push(tenantId);
    } else {
      query += ' WHERE a.tenant_id IS NULL';
    }
    
    query += ' ORDER BY a.display_name';
    
    const agents = await DB.prepare(query).bind(...params).all();
    
    const result = agents.results.map(agent => ({
      id: agent.id,
      display_name: agent.display_name,
      tenant_id: agent.tenant_id,
      online: Boolean(agent.online),
      last_seen_at: agent.last_seen_at,
    }));
    
    return c.json({
      agents: result,
      device_id: jwtPayload.sub,
      tenant_id: tenantId,
    });
    
  } catch (error) {
    console.error('Agents list error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;