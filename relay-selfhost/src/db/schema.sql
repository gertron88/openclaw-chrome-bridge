-- Agents table: stores agent metadata and secrets
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  agent_secret TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  last_seen_at INTEGER
);

-- Devices table: stores client device information
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  device_label TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  last_seen_at INTEGER
);

-- Pairings table: connects agents to devices
CREATE TABLE IF NOT EXISTS pairings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  pairing_code TEXT UNIQUE,
  expires_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'expired'
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  completed_at INTEGER,
  FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE,
  UNIQUE (agent_id, device_id)
);

-- Refresh tokens table: stores hashed refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  agent_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  revoked_at INTEGER,
  FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
);

-- Rate limiting table: tracks pairing attempts by IP
CREATE TABLE IF NOT EXISTS rate_limits (
  ip_address TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 1,
  window_start INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_agents_secret ON agents (agent_secret);
CREATE INDEX IF NOT EXISTS idx_pairings_code ON pairings (pairing_code);
CREATE INDEX IF NOT EXISTS idx_pairings_agent_device ON pairings (agent_id, device_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_agent_device ON refresh_tokens (agent_id, device_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);

-- Clean up expired data periodically
-- This would be handled by application logic, but here are the queries:
-- DELETE FROM pairings WHERE status = 'pending' AND expires_at < strftime('%s', 'now');
-- DELETE FROM refresh_tokens WHERE expires_at < strftime('%s', 'now') OR revoked_at IS NOT NULL;
-- DELETE FROM rate_limits WHERE window_start < strftime('%s', 'now', '-1 hour');