import { type CloudflareBindings } from '@/config';
import { hashToken } from '@/auth/tokens';

export type AgentAuthResult =
  | { ok: true; tenantId: string | null; displayName: string | null }
  | { ok: false; status: 401 | 404; error: string };

function parseBearerSecret(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const secret = authHeader.slice(7).trim();
  return secret.length > 0 ? secret : null;
}

export async function authenticateAgentSecret(
  db: D1Database,
  env: CloudflareBindings,
  agentId: string,
  authHeader?: string
): Promise<AgentAuthResult> {
  const providedSecret = parseBearerSecret(authHeader);
  if (!providedSecret) {
    return { ok: false, status: 401, error: 'Missing Authorization header' };
  }

  const agent = await db
    .prepare('SELECT id, secret_hash, tenant_id, display_name FROM agents WHERE id = ?')
    .bind(agentId)
    .first();

  if (!agent) {
    return { ok: false, status: 404, error: 'Agent not found' };
  }

  const providedHash = await hashToken(providedSecret);
  if (providedHash === agent.secret_hash) {
    return {
      ok: true,
      tenantId: (agent.tenant_id as string | null) ?? null,
      displayName: (agent.display_name as string | null) ?? null,
    };
  }

  const allowLegacy = env.ALLOW_LEGACY_GLOBAL_AGENT_SECRET === 'true';
  if (allowLegacy && env.AGENT_SECRET && providedSecret === env.AGENT_SECRET) {
    return {
      ok: true,
      tenantId: (agent.tenant_id as string | null) ?? null,
      displayName: (agent.display_name as string | null) ?? null,
    };
  }

  return { ok: false, status: 401, error: 'Invalid agent secret' };
}

export async function upsertAgentWithSecret(
  db: D1Database,
  agentId: string,
  displayName: string,
  tenantId: string | null,
  secret: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const incomingHash = await hashToken(secret);

  const existing = await db
    .prepare('SELECT secret_hash FROM agents WHERE id = ?')
    .bind(agentId)
    .first();

  if (!existing) {
    await db
      .prepare(`
        INSERT INTO agents (id, display_name, secret_hash, tenant_id, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(agentId, displayName, incomingHash, tenantId, now)
      .run();
    return;
  }

  const currentHash = existing.secret_hash as string;
  if (currentHash !== incomingHash) {
    throw new Error('AGENT_SECRET_MISMATCH');
  }

  await db
    .prepare(`
      UPDATE agents
      SET display_name = ?, tenant_id = ?, updated_at = ?
      WHERE id = ?
    `)
    .bind(displayName, tenantId, now, agentId)
    .run();
}
