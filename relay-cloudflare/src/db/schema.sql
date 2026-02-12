-- OpenClaw Chrome Relay Database Schema
-- Compatible with SQLite/D1

-- Agents table - stores agent metadata
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    secret_hash TEXT NOT NULL, -- bcrypt hash of agent secret
    tenant_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    last_seen_at INTEGER
);

CREATE INDEX idx_agents_tenant_id ON agents(tenant_id);
CREATE INDEX idx_agents_last_seen ON agents(last_seen_at);

-- Pairings table - stores active pairing codes
CREATE TABLE IF NOT EXISTS pairings (
    code TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX idx_pairings_agent_id ON pairings(agent_id);
CREATE INDEX idx_pairings_expires_at ON pairings(expires_at);

-- Devices table - stores paired client devices
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    tenant_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    last_seen_at INTEGER,
    
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX idx_devices_agent_id ON devices(agent_id);
CREATE INDEX idx_devices_tenant_id ON devices(tenant_id);
CREATE INDEX idx_devices_last_seen ON devices(last_seen_at);

-- Refresh tokens table - stores hashed refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_hash TEXT PRIMARY KEY, -- SHA-256 hash of refresh token
    device_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX idx_refresh_tokens_device_id ON refresh_tokens(device_id);
CREATE INDEX idx_refresh_tokens_agent_id ON refresh_tokens(agent_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Rate limiting table - for pairing and message rate limits
CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY, -- IP:action or device_id:action
    count INTEGER NOT NULL DEFAULT 1,
    window_start INTEGER NOT NULL DEFAULT (unixepoch()),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_rate_limits_window_start ON rate_limits(window_start);
-- Accounts table - stores user identity and billing status
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    provider_user_id TEXT,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan TEXT NOT NULL DEFAULT 'free',
    subscription_status TEXT NOT NULL DEFAULT 'inactive',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_accounts_stripe_customer_id ON accounts(stripe_customer_id);

-- Account sessions for extension login state
CREATE TABLE IF NOT EXISTS account_sessions (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_sessions_account_id ON account_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_account_sessions_expires_at ON account_sessions(expires_at);

-- Mapping of account to known paired agent IDs (for freemium enforcement)
CREATE TABLE IF NOT EXISTS account_agents (
    account_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    linked_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (account_id, agent_id),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_agents_account_id ON account_agents(account_id);
