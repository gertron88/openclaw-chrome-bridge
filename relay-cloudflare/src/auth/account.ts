import { type D1Database } from '@cloudflare/workers-types';

export interface AccountRow {
  id: string;
  email: string;
  stripe_customer_id: string | null;
  stripe_subscription_id?: string | null;
  plan: string;
  subscription_status: string;
}

const freeAgentLimit = 1;

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getAccountFromBearer(db: D1Database, authHeader?: string): Promise<AccountRow | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  if (!token) {
    return null;
  }

  const tokenHash = await sha256Hex(token);
  const now = Math.floor(Date.now() / 1000);

  const row = await db.prepare(`
    SELECT a.id, a.email, a.stripe_customer_id, a.stripe_subscription_id, a.plan, a.subscription_status
    FROM account_sessions s
    JOIN accounts a ON a.id = s.account_id
    WHERE s.token_hash = ? AND s.expires_at > ?
    LIMIT 1
  `).bind(tokenHash, now).first<AccountRow>();

  return row ?? null;
}

export async function canAccountAddAgent(db: D1Database, account: AccountRow): Promise<boolean> {
  const paid = account.plan === 'pro' && ['active', 'trialing', 'past_due'].includes(account.subscription_status);
  if (paid) {
    return true;
  }

  const row = await db.prepare(`
    SELECT COUNT(*) as count
    FROM account_agents
    WHERE account_id = ?
  `).bind(account.id).first<{ count: number }>();

  const inUse = Number(row?.count || 0);
  return inUse < freeAgentLimit;
}

export async function getAgentUsage(db: D1Database, accountId: string): Promise<number> {
  const row = await db.prepare(`
    SELECT COUNT(*) as count
    FROM account_agents
    WHERE account_id = ?
  `).bind(accountId).first<{ count: number }>();

  return Number(row?.count || 0);
}

export const SESSION_TOKEN_TTL_SECONDS = 8 * 60 * 60;
export const FREE_AGENT_LIMIT = freeAgentLimit;
