import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { type CloudflareBindings } from '@/config';
import { refreshAccessToken } from '@/auth/tokens';

const app = new Hono<{ Bindings: CloudflareBindings }>();

// Validation schema
const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
});

/**
 * POST /api/token/refresh
 * Refresh access token using refresh token
 */
app.post('/refresh', zValidator('json', refreshTokenSchema), async (c) => {
  const { DB, JWT_SECRET } = c.env;
  const { refresh_token } = c.req.valid('json');
  
  try {
    const result = await refreshAccessToken(DB, refresh_token, JWT_SECRET);
    
    if (!result) {
      return c.json({ error: 'Invalid or expired refresh token' }, 401);
    }
    
    return c.json({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      expires_in: result.expiresIn,
      token_type: 'Bearer',
    });
    
  } catch (error) {
    console.error('Token refresh error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;