import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CONFIG } from '../config.js';

export interface Agent {
  id: string;
  display_name: string;
  agent_secret: string;
  created_at: number;
  updated_at: number;
  last_seen_at?: number;
}

export interface Device {
  id: string;
  device_label: string;
  created_at: number;
  updated_at: number;
  last_seen_at?: number;
}

export interface Pairing {
  id: number;
  agent_id: string;
  device_id: string;
  pairing_code?: string;
  expires_at?: number;
  status: 'pending' | 'completed' | 'expired';
  created_at: number;
  completed_at?: number;
}

export interface RefreshToken {
  id: number;
  token_hash: string;
  agent_id: string;
  device_id: string;
  expires_at: number;
  created_at: number;
  revoked_at?: number;
}

export interface RateLimit {
  ip_address: string;
  attempts: number;
  window_start: number;
  updated_at: number;
}

class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    console.log(`Initializing database at: ${dbPath}`);
    
    this.db = new Database(dbPath, {
      verbose: CONFIG.NODE_ENV === 'development' ? console.log : undefined
    });
    
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    
    this.initializeTables();
  }

  private initializeTables(): void {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // Execute schema (split by semicolons and filter empty statements)
    const statements = schema.split(';').filter(stmt => stmt.trim().length > 0);
    
    for (const statement of statements) {
      this.db.exec(statement.trim());
    }
    
    console.log('Database tables initialized');
  }

  // Agent operations
  createAgent(agent: Omit<Agent, 'created_at' | 'updated_at'>): Agent {
    const stmt = this.db.prepare(`
      INSERT INTO agents (id, display_name, agent_secret)
      VALUES (?, ?, ?)
    `);
    
    const now = Math.floor(Date.now() / 1000);
    stmt.run(agent.id, agent.display_name, agent.agent_secret);
    
    return {
      ...agent,
      created_at: now,
      updated_at: now
    };
  }

  getAgentBySecret(agentSecret: string): Agent | null {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE agent_secret = ?');
    return stmt.get(agentSecret) as Agent | null;
  }

  getAgentById(agentId: string): Agent | null {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE id = ?');
    return stmt.get(agentId) as Agent | null;
  }

  updateAgentLastSeen(agentId: string): void {
    const stmt = this.db.prepare('UPDATE agents SET last_seen_at = ? WHERE id = ?');
    stmt.run(Math.floor(Date.now() / 1000), agentId);
  }

  // Device operations
  createDevice(device: Omit<Device, 'created_at' | 'updated_at'>): Device {
    const stmt = this.db.prepare(`
      INSERT INTO devices (id, device_label)
      VALUES (?, ?)
    `);
    
    const now = Math.floor(Date.now() / 1000);
    stmt.run(device.id, device.device_label);
    
    return {
      ...device,
      created_at: now,
      updated_at: now
    };
  }

  getDeviceById(deviceId: string): Device | null {
    const stmt = this.db.prepare('SELECT * FROM devices WHERE id = ?');
    return stmt.get(deviceId) as Device | null;
  }

  // Pairing operations
  createPairing(pairing: Omit<Pairing, 'id' | 'created_at'>): Pairing {
    const stmt = this.db.prepare(`
      INSERT INTO pairings (agent_id, device_id, pairing_code, expires_at, status)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      pairing.agent_id,
      pairing.device_id,
      pairing.pairing_code,
      pairing.expires_at,
      pairing.status
    );
    
    return {
      id: result.lastInsertRowid as number,
      created_at: Math.floor(Date.now() / 1000),
      ...pairing
    };
  }

  getPairingByCode(pairingCode: string): Pairing | null {
    const stmt = this.db.prepare('SELECT * FROM pairings WHERE pairing_code = ?');
    return stmt.get(pairingCode) as Pairing | null;
  }

  completePairing(pairingId: number, deviceId: string): void {
    const stmt = this.db.prepare(`
      UPDATE pairings 
      SET status = 'completed', device_id = ?, completed_at = ?
      WHERE id = ?
    `);
    stmt.run(deviceId, Math.floor(Date.now() / 1000), pairingId);
  }

  getAgentsForDevice(deviceId: string): Agent[] {
    const stmt = this.db.prepare(`
      SELECT a.* FROM agents a
      JOIN pairings p ON a.id = p.agent_id
      WHERE p.device_id = ? AND p.status = 'completed'
    `);
    return stmt.all(deviceId) as Agent[];
  }

  // Refresh token operations
  storeRefreshToken(tokenData: Omit<RefreshToken, 'id' | 'created_at'>): RefreshToken {
    const stmt = this.db.prepare(`
      INSERT INTO refresh_tokens (token_hash, agent_id, device_id, expires_at)
      VALUES (?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      tokenData.token_hash,
      tokenData.agent_id,
      tokenData.device_id,
      tokenData.expires_at
    );
    
    return {
      id: result.lastInsertRowid as number,
      created_at: Math.floor(Date.now() / 1000),
      ...tokenData
    };
  }

  getRefreshToken(tokenHash: string): RefreshToken | null {
    const stmt = this.db.prepare(`
      SELECT * FROM refresh_tokens 
      WHERE token_hash = ? AND expires_at > ? AND revoked_at IS NULL
    `);
    return stmt.get(tokenHash, Math.floor(Date.now() / 1000)) as RefreshToken | null;
  }

  revokeRefreshToken(tokenHash: string): void {
    const stmt = this.db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?');
    stmt.run(Math.floor(Date.now() / 1000), tokenHash);
  }

  // Rate limiting operations
  checkRateLimit(ipAddress: string, maxAttempts: number, windowMs: number): boolean {
    const windowStart = Math.floor(Date.now() / 1000) - Math.floor(windowMs / 1000);
    
    const stmt = this.db.prepare('SELECT * FROM rate_limits WHERE ip_address = ?');
    const existing = stmt.get(ipAddress) as RateLimit | null;
    
    if (!existing) {
      // First attempt from this IP
      const insertStmt = this.db.prepare(`
        INSERT INTO rate_limits (ip_address, attempts, window_start)
        VALUES (?, 1, ?)
      `);
      insertStmt.run(ipAddress, Math.floor(Date.now() / 1000));
      return true;
    }
    
    if (existing.window_start < windowStart) {
      // Window expired, reset
      const updateStmt = this.db.prepare(`
        UPDATE rate_limits 
        SET attempts = 1, window_start = ?, updated_at = ?
        WHERE ip_address = ?
      `);
      updateStmt.run(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000), ipAddress);
      return true;
    }
    
    if (existing.attempts >= maxAttempts) {
      return false; // Rate limited
    }
    
    // Increment attempts
    const updateStmt = this.db.prepare(`
      UPDATE rate_limits 
      SET attempts = attempts + 1, updated_at = ?
      WHERE ip_address = ?
    `);
    updateStmt.run(Math.floor(Date.now() / 1000), ipAddress);
    return true;
  }

  // Cleanup operations
  cleanupExpiredData(): void {
    const now = Math.floor(Date.now() / 1000);
    
    // Clean expired pairings
    this.db.prepare(`
      DELETE FROM pairings 
      WHERE status = 'pending' AND expires_at < ?
    `).run(now);
    
    // Clean expired refresh tokens
    this.db.prepare(`
      DELETE FROM refresh_tokens 
      WHERE expires_at < ? OR revoked_at IS NOT NULL
    `).run(now);
    
    // Clean old rate limit records
    this.db.prepare(`
      DELETE FROM rate_limits 
      WHERE window_start < ?
    `).run(now - 3600); // 1 hour ago
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance
let dbInstance: DatabaseManager;

export function getDatabase(): DatabaseManager {
  if (!dbInstance) {
    dbInstance = new DatabaseManager(CONFIG.DB_PATH);
    
    // Setup cleanup interval
    setInterval(() => {
      dbInstance.cleanupExpiredData();
    }, 60000); // Clean up every minute
  }
  return dbInstance;
}