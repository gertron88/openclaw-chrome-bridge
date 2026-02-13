# Production Multi-Tenant Relay Architecture (Commercial Model)

## Target architecture

### 1) Identity planes
- **Agent plane (machine identity):** each agent has its own `AGENT_ID` + `AGENT_SECRET`.
- **User/device plane (human identity):** browser extension pairs via one-time code and receives device-scoped access/refresh tokens.
- **Billing/account plane (commercial identity):** account/subscription determines entitlement limits (free = 1 relayed agent, paid >1).

### 2) Trust boundaries
- Agent secrets are never shared globally across all tenants in production.
- Pairing code issuance (`/api/pair/start`) and agent WS (`/ws/agent`) both require agent-scoped secret verification.
- Extension endpoints continue to use device access tokens (JWT) and refresh tokens.

### 3) Tenant isolation model
- Tenant/account scoping is enforced by `tenant_id` + account linkage in database.
- Agent control plane operations are performed per `agent_id` and optionally constrained by `tenant_id`.

### 4) Compatibility/migration
- Optional legacy fallback (`ALLOW_LEGACY_GLOBAL_AGENT_SECRET=true`) can accept the old shared `AGENT_SECRET` during rollout.
- Default production posture is per-agent secret only.

## Delta from current/pre-change model

### Previously
- Relay accepted one global `AGENT_SECRET` for all agents.
- `/api/pair/start` and `/ws/agent` compared bearer directly against env secret.
- Pair-start upsert used shared secret hash.

### Now
- Relay verifies provided bearer against stored `agents.secret_hash` per `agent_id`.
- Pair-start creates or updates agent records using agent-scoped secret hash.
- Existing agents cannot be silently overwritten with a different secret.
- Agent connector payload now matches relay schema (`display_name`).
- Build/deploy scripts reflect fixed worker type generation command.

## Operational rollout
1. Assign unique `AGENT_SECRET` per agent deployment.
2. Keep `ALLOW_LEGACY_GLOBAL_AGENT_SECRET=false` in production (recommended).
3. If migrating legacy agents, temporarily enable legacy fallback and rotate agents to unique secrets.
4. Disable legacy fallback once all agents are migrated.
