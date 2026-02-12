import { Hono } from 'hono';
import { z } from 'zod';
import { type CloudflareBindings } from '@/config';
import { AccountRow, getAccountFromBearer, getAgentUsage, sha256Hex, SESSION_TOKEN_TTL_SECONDS, FREE_AGENT_LIMIT } from '@/auth/account';

const app = new Hono<{ Bindings: CloudflareBindings }>();

const authRequestSchema = z.object({
  email: z.string().email(),
  chrome_profile_id: z.string().min(1).optional(),
});

const syncAgentsSchema = z.object({
  agent_ids: z.array(z.string().min(1)).max(100),
});


const googleAuthSchema = z.object({
  google_access_token: z.string().min(1),
});


function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length != b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}


const nowUnix = (): number => Math.floor(Date.now() / 1000);

function requireBillingEnv(c: any): { stripeSecretKey: string; stripePriceId: string; successUrl: string; cancelUrl: string; portalReturnUrl: string } {
  const stripeSecretKey = c.env.STRIPE_SECRET_KEY;
  const stripePriceId = c.env.STRIPE_PRICE_ID;
  const successUrl = c.env.BILLING_SUCCESS_URL;
  const cancelUrl = c.env.BILLING_CANCEL_URL;
  const portalReturnUrl = c.env.BILLING_PORTAL_RETURN_URL;

  if (!stripeSecretKey || !stripePriceId || !successUrl || !cancelUrl || !portalReturnUrl) {
    throw new Error('Stripe billing is not configured');
  }

  return { stripeSecretKey, stripePriceId, successUrl, cancelUrl, portalReturnUrl };
}

async function createStripeCustomer(stripeSecretKey: string, email: string): Promise<string> {
  const body = new URLSearchParams();
  body.set('email', email);

  const response = await fetch('https://api.stripe.com/v1/customers', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to create Stripe customer: ${response.status} ${errText}`);
  }

  const json = await response.json<{ id: string }>();
  return json.id;
}

async function buildAccountResponse(DB: D1Database, accountId: string): Promise<Record<string, unknown>> {
  const account = await DB.prepare(`
    SELECT id, email, stripe_customer_id, plan, subscription_status
    FROM accounts
    WHERE id = ?
  `).bind(accountId).first<AccountRow>();

  if (!account) {
    throw new Error('Account not found');
  }

  const agentsInUse = await getAgentUsage(DB, account.id);
  const paid = account.plan === 'pro' && ['active', 'trialing', 'past_due'].includes(account.subscription_status);
  const agentLimit = paid ? null : FREE_AGENT_LIMIT;

  return {
    id: account.id,
    email: account.email,
    plan: account.plan,
    subscription_status: account.subscription_status,
    stripe_customer_id: account.stripe_customer_id,
    agents_in_use: agentsInUse,
    agent_limit: agentLimit,
    can_add_agent: paid || agentsInUse < FREE_AGENT_LIMIT,
  };
}



app.post('/auth/google', async (c) => {
  try {
    const payload = googleAuthSchema.parse(await c.req.json());
    const { DB } = c.env;

    const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(payload.google_access_token)}`);
    if (!tokenInfoRes.ok) {
      return c.json({ error: 'Invalid Google token' }, 401);
    }

    const tokenInfo = await tokenInfoRes.json() as { email?: string; sub?: string; exp?: string };
    if (!tokenInfo.email || !tokenInfo.sub) {
      return c.json({ error: 'Google token did not include required identity claims' }, 401);
    }

    const email = tokenInfo.email.trim().toLowerCase();
    let account = await DB.prepare(`
      SELECT id, email, stripe_customer_id, plan, subscription_status
      FROM accounts
      WHERE email = ?
      LIMIT 1
    `).bind(email).first<AccountRow>();

    if (!account) {
      const accountId = crypto.randomUUID();
      await DB.prepare(`
        INSERT INTO accounts (id, email, provider, provider_user_id, plan, subscription_status, created_at, updated_at)
        VALUES (?, ?, 'google', ?, 'free', 'inactive', ?, ?)
      `).bind(accountId, email, tokenInfo.sub, nowUnix(), nowUnix()).run();

      account = {
        id: accountId,
        email,
        stripe_customer_id: null,
        plan: 'free',
        subscription_status: 'inactive',
      };
    }

    const sessionToken = crypto.randomUUID();
    const sessionTokenHash = await sha256Hex(sessionToken);
    const expiresAt = nowUnix() + SESSION_TOKEN_TTL_SECONDS;

    await DB.prepare(`
      INSERT INTO account_sessions (token_hash, account_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(token_hash) DO UPDATE SET
        account_id = excluded.account_id,
        expires_at = excluded.expires_at
    `).bind(sessionTokenHash, account.id, expiresAt, nowUnix()).run();

    return c.json({
      session_token: sessionToken,
      account: await buildAccountResponse(DB, account.id),
      expires_at: expiresAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid payload', details: error.issues }, 400);
    }

    console.error('Google auth failed:', error);
    return c.json({ error: 'Authentication failed' }, 500);
  }
});

app.post('/auth/chrome-profile', async (c) => {
  try {
    const payload = authRequestSchema.parse(await c.req.json());
    const { DB } = c.env;
    const email = payload.email.trim().toLowerCase();
    const profileId = payload.chrome_profile_id?.trim() || null;

    let account = await DB.prepare(`
      SELECT id, email, stripe_customer_id, plan, subscription_status
      FROM accounts
      WHERE email = ?
      LIMIT 1
    `).bind(email).first<AccountRow>();

    if (!account) {
      const accountId = crypto.randomUUID();
      await DB.prepare(`
        INSERT INTO accounts (id, email, provider, provider_user_id, plan, subscription_status, created_at, updated_at)
        VALUES (?, ?, 'chrome_profile', ?, 'free', 'inactive', ?, ?)
      `).bind(accountId, email, profileId, nowUnix(), nowUnix()).run();

      account = {
        id: accountId,
        email,
        stripe_customer_id: null,
        plan: 'free',
        subscription_status: 'inactive',
      };
    }

    const sessionToken = crypto.randomUUID();
    const sessionTokenHash = await sha256Hex(sessionToken);
    const expiresAt = nowUnix() + SESSION_TOKEN_TTL_SECONDS;

    await DB.prepare(`
      INSERT INTO account_sessions (token_hash, account_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(token_hash) DO UPDATE SET
        account_id = excluded.account_id,
        expires_at = excluded.expires_at
    `).bind(sessionTokenHash, account.id, expiresAt, nowUnix()).run();

    return c.json({
      session_token: sessionToken,
      account: await buildAccountResponse(DB, account.id),
      expires_at: expiresAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid payload', details: error.issues }, 400);
    }

    console.error('Chrome profile auth failed:', error);
    return c.json({ error: 'Authentication failed' }, 500);
  }
});

app.get('/me', async (c) => {
  const account = await getAccountFromBearer(c.env.DB, c.req.header('Authorization'));
  if (!account) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  return c.json({ account: await buildAccountResponse(c.env.DB, account.id) });
});

app.post('/sync-agents', async (c) => {
  try {
    const account = await getAccountFromBearer(c.env.DB, c.req.header('Authorization'));
    if (!account) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const payload = syncAgentsSchema.parse(await c.req.json());
    const uniqueIds = Array.from(new Set(payload.agent_ids));

    await c.env.DB.prepare('DELETE FROM account_agents WHERE account_id = ?').bind(account.id).run();

    for (const agentId of uniqueIds) {
      await c.env.DB.prepare(`
        INSERT INTO account_agents (account_id, agent_id, linked_at)
        VALUES (?, ?, ?)
      `).bind(account.id, agentId, nowUnix()).run();
    }

    return c.json({ account: await buildAccountResponse(c.env.DB, account.id) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid payload', details: error.issues }, 400);
    }

    console.error('Failed to sync agents:', error);
    return c.json({ error: 'Failed to sync agents' }, 500);
  }
});

app.post('/checkout', async (c) => {
  try {
    const account = await getAccountFromBearer(c.env.DB, c.req.header('Authorization'));
    if (!account) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { stripeSecretKey, stripePriceId, successUrl, cancelUrl } = requireBillingEnv(c);

    let customerId = account.stripe_customer_id;
    if (!customerId) {
      customerId = await createStripeCustomer(stripeSecretKey, account.email);
      await c.env.DB.prepare(`
        UPDATE accounts SET stripe_customer_id = ?, updated_at = ? WHERE id = ?
      `).bind(customerId, nowUnix(), account.id).run();
    }

    const body = new URLSearchParams();
    body.set('mode', 'subscription');
    body.set('customer', customerId);
    body.set('line_items[0][price]', stripePriceId);
    body.set('line_items[0][quantity]', '1');
    body.set('success_url', successUrl);
    body.set('cancel_url', cancelUrl);
    body.set('metadata[account_id]', account.id);

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to create checkout session: ${response.status} ${errText}`);
    }

    const session = await response.json<{ url: string }>();
    return c.json({ url: session.url });
  } catch (error) {
    console.error('Failed to create checkout session:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Failed to create checkout session' }, 500);
  }
});

app.post('/portal', async (c) => {
  try {
    const account = await getAccountFromBearer(c.env.DB, c.req.header('Authorization'));
    if (!account) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { stripeSecretKey, portalReturnUrl } = requireBillingEnv(c);

    if (!account.stripe_customer_id) {
      return c.json({ error: 'No Stripe customer found. Start checkout first.' }, 400);
    }

    const body = new URLSearchParams();
    body.set('customer', account.stripe_customer_id);
    body.set('return_url', portalReturnUrl);

    const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to create billing portal session: ${response.status} ${errText}`);
    }

    const session = await response.json<{ url: string }>();
    return c.json({ url: session.url });
  } catch (error) {
    console.error('Failed to create portal session:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Failed to create portal session' }, 500);
  }
});


app.post('/webhook/stripe', async (c) => {
  const webhookSecret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return c.json({ error: 'Stripe webhook secret not configured' }, 500);
  }

  const sigHeader = c.req.header('Stripe-Signature');
  if (!sigHeader) {
    return c.json({ error: 'Missing Stripe-Signature header' }, 400);
  }

  const timestamp = sigHeader.split(',').find((part) => part.startsWith('t='))?.slice(2);
  const signature = sigHeader.split(',').find((part) => part.startsWith('v1='))?.slice(3);

  if (!timestamp || !signature) {
    return c.json({ error: 'Invalid Stripe signature header' }, 400);
  }

  const body = await c.req.text();
  const signedPayload = `${timestamp}.${body}`;
  const expectedSignature = await hmacSha256Hex(webhookSecret, signedPayload);

  if (!timingSafeEqualHex(signature, expectedSignature)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  try {
    const event = JSON.parse(body) as {
      type: string;
      data?: { object?: Record<string, unknown> };
    };

    const object = event.data?.object || {};

    if (event.type === 'checkout.session.completed') {
      const accountId = typeof object.metadata === 'object' && object.metadata !== null
        ? (object.metadata as Record<string, unknown>).account_id
        : null;
      const customerId = typeof object.customer === 'string' ? object.customer : null;
      const subscriptionId = typeof object.subscription === 'string' ? object.subscription : null;

      if (typeof accountId === 'string') {
        await c.env.DB.prepare(`
          UPDATE accounts
          SET stripe_customer_id = COALESCE(?, stripe_customer_id),
              stripe_subscription_id = COALESCE(?, stripe_subscription_id),
              plan = 'pro',
              subscription_status = 'active',
              updated_at = ?
          WHERE id = ?
        `).bind(customerId, subscriptionId, nowUnix(), accountId).run();
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const customerId = typeof object.customer === 'string' ? object.customer : null;
      const subscriptionId = typeof object.id === 'string' ? object.id : null;
      const status = typeof object.status === 'string' ? object.status : 'inactive';
      const isPaid = ['active', 'trialing', 'past_due'].includes(status);

      if (customerId) {
        await c.env.DB.prepare(`
          UPDATE accounts
          SET stripe_subscription_id = COALESCE(?, stripe_subscription_id),
              plan = ?,
              subscription_status = ?,
              updated_at = ?
          WHERE stripe_customer_id = ?
        `).bind(subscriptionId, isPaid ? 'pro' : 'free', status, nowUnix(), customerId).run();
      }
    }

    return c.json({ received: true });
  } catch (error) {
    console.error('Failed to process Stripe webhook:', error);
    return c.json({ error: 'Webhook processing failed' }, 500);
  }
});

export default app;
