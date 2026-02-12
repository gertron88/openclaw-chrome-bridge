-- Migration: Add account login and billing tables
-- Date: 2026-02-12

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

CREATE TABLE IF NOT EXISTS account_sessions (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_sessions_account_id ON account_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_account_sessions_expires_at ON account_sessions(expires_at);

CREATE TABLE IF NOT EXISTS account_agents (
    account_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    linked_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (account_id, agent_id),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_agents_account_id ON account_agents(account_id);
