import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
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
  private db!: Database;
  private dbPath: string;
  private sqlJs!: SqlJsStatic;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    console.log(`Initializing database at: ${dbPath}`);
  }

  async initialize(): Promise<void> {
    // Initialize sql.js
    this.sqlJs = await initSqlJs();
    
    // Load existing database or create new one
    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath);
      this.db = new this.sqlJs.Database(buffer);
    } else {
      this.db = new this.sqlJs.Database();
    }
    
    // Enable foreign keys
    this.db.exec('PRAGMA foreign_keys = ON;');
    
    this.initializeTables();
  }

  private initializeTables(): void {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // Execute schema
    this.db.exec(schema);
    
    console.log('Database tables initialized');
    this.saveToFile();
  }

  private saveToFile(): void {
    const data = this.db.export();
    writeFileSync(this.dbPath, data);
  }

  // Agent operations
  createAgent(agent: Omit<Agent, 'created_at' | 'updated_at'>): Agent {
    const now = Math.floor(Date.now() / 1000);
    
    this.db.run(`
      INSERT INTO agents (id, display_name, agent_secret, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `, [agent.id, agent.display_name, agent.agent_secret, now, now]);
    
    this.saveToFile();
    
    return {
      ...agent,
      created_at: now,
      updated_at: now
    };
  }

  getAgentBySecret(agentSecret: string): Agent | null {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE agent_secret = ?');
    const result = stmt.get([agentSecret]);
    stmt.free();
    return result ? this.rowToAgent(result) : null;
  }

  getAgentById(agentId: string): Agent | null {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE id = ?');
    const result = stmt.get([agentId]);
    stmt.free();
    return result ? this.rowToAgent(result) : null;
  }

  updateAgentLastSeen(agentId: string): void {
    const now = Math.floor(Date.now() / 1000);
    this.db.run('UPDATE agents SET last_seen_at = ?, updated_at = ? WHERE id = ?', 
      [now, now, agentId]);
    this.saveToFile();
  }

  private rowToAgent(row: unknown[]): Agent {
    return {
      id: row[0] as string,
      display_name: row[1] as string,
      agent_secret: row[2] as string,
      created_at: row[3] as number,
      updated_at: row[4] as number,
      last_seen_at: (row[5] as number | null) || undefined
    };
  }

  // Device operations
  createDevice(device: Omit<Device, 'created_at' | 'updated_at'>): Device {
    const now = Math.floor(Date.now() / 1000);
    
    this.db.run(`
      INSERT INTO devices (id, device_label, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `, [device.id, device.device_label, now, now]);
    
    this.saveToFile();
    
    return {
      ...device,
      created_at: now,
      updated_at: now
    };
  }

  getDeviceById(deviceId: string): Device | null {
    const stmt = this.db.prepare('SELECT * FROM devices WHERE id = ?');
    const result = stmt.get([deviceId]);
    stmt.free();
    return result ? this.rowToDevice(result) : null;
  }

  private rowToDevice(row: unknown[]): Device {
    return {
      id: row[0] as string,
      device_label: row[1] as string,
      created_at: row[2] as number,
      updated_at: row[3] as number,
      last_seen_at: (row[4] as number | null) || undefined
    };
  }

  // Pairing operations
  createPairing(pairing: Omit<Pairing, 'id' | 'created_at'>): Pairing {
    const now = Math.floor(Date.now() / 1000);
    
    this.db.run(`
      INSERT INTO pairings (agent_id, device_id, pairing_code, expires_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [pairing.agent_id, pairing.device_id, pairing.pairing_code || null, 
        pairing.expires_at || null, pairing.status, now]);
    
    this.saveToFile();
    
    // Get the inserted ID (sql.js doesn't have lastInsertRowid, so we'll query for it)
    const stmt = this.db.prepare('SELECT last_insert_rowid()');
    const result = stmt.get();
    const id = result ? result[0] : 0;
    stmt.free();
    
    return {
      id: id as number,
      created_at: now,
      ...pairing
    };
  }

  getPairingByCode(pairingCode: string): Pairing | null {
    const stmt = this.db.prepare('SELECT * FROM pairings WHERE pairing_code = ?');
    const result = stmt.get([pairingCode]);
    stmt.free();
    return result ? this.rowToPairing(result) : null;
  }

  completePairing(pairingId: number, deviceId: string): void {
    const now = Math.floor(Date.now() / 1000);
    this.db.run(`
      UPDATE pairings 
      SET status = 'completed', device_id = ?, completed_at = ?
      WHERE id = ?
    `, [deviceId, now, pairingId]);
    this.saveToFile();
  }

  getAgentsForDevice(deviceId: string): Agent[] {
    const stmt = this.db.prepare(`
      SELECT a.* FROM agents a
      JOIN pairings p ON a.id = p.agent_id
      WHERE p.device_id = ? AND p.status = 'completed'
    `);
    const results: unknown[][] = [];
    stmt.bind([deviceId]);
    while (stmt.step()) {
      results.push(stmt.get());
    }
    stmt.free();
    return results.map(row => this.rowToAgent(row));
  }

  private rowToPairing(row: unknown[]): Pairing {
    return {
      id: row[0] as number,
      agent_id: row[1] as string,
      device_id: row[2] as string,
      pairing_code: (row[3] as string | null) || undefined,
      expires_at: (row[4] as number | null) || undefined,
      status: row[5] as 'pending' | 'completed' | 'expired',
      created_at: row[6] as number,
      completed_at: (row[7] as number | null) || undefined
    };
  }

  // Refresh token operations
  storeRefreshToken(tokenData: Omit<RefreshToken, 'id' | 'created_at'>): RefreshToken {
    const now = Math.floor(Date.now() / 1000);
    
    this.db.run(`
      INSERT INTO refresh_tokens (token_hash, agent_id, device_id, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [tokenData.token_hash, tokenData.agent_id, tokenData.device_id, tokenData.expires_at, now]);
    
    this.saveToFile();
    
    const stmt = this.db.prepare('SELECT last_insert_rowid()');
    const result = stmt.get();
    const id = result ? result[0] : 0;
    stmt.free();
    
    return {
      id: id as number,
      created_at: now,
      ...tokenData
    };
  }

  getRefreshToken(tokenHash: string): RefreshToken | null {
    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare(`
      SELECT * FROM refresh_tokens 
      WHERE token_hash = ? AND expires_at > ? AND revoked_at IS NULL
    `);
    const result = stmt.get([tokenHash, now]);
    stmt.free();
    return result ? this.rowToRefreshToken(result) : null;
  }

  revokeRefreshToken(tokenHash: string): void {
    const now = Math.floor(Date.now() / 1000);
    this.db.run('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?', [now, tokenHash]);
    this.saveToFile();
  }

  private rowToRefreshToken(row: unknown[]): RefreshToken {
    return {
      id: row[0] as number,
      token_hash: row[1] as string,
      agent_id: row[2] as string,
      device_id: row[3] as string,
      expires_at: row[4] as number,
      created_at: row[5] as number,
      revoked_at: (row[6] as number | null) || undefined
    };
  }

  // Rate limiting operations
  checkRateLimit(ipAddress: string, maxAttempts: number, windowMs: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - Math.floor(windowMs / 1000);
    
    const stmt = this.db.prepare('SELECT * FROM rate_limits WHERE ip_address = ?');
    const result = stmt.get([ipAddress]);
    stmt.free();
    const existing = result ? this.rowToRateLimit(result) : null;
    
    if (!existing) {
      // First attempt from this IP
      this.db.run(`
        INSERT INTO rate_limits (ip_address, attempts, window_start, updated_at)
        VALUES (?, 1, ?, ?)
      `, [ipAddress, now, now]);
      this.saveToFile();
      return true;
    }
    
    if (existing.window_start < windowStart) {
      // Window expired, reset
      this.db.run(`
        UPDATE rate_limits 
        SET attempts = 1, window_start = ?, updated_at = ?
        WHERE ip_address = ?
      `, [now, now, ipAddress]);
      this.saveToFile();
      return true;
    }
    
    if (existing.attempts >= maxAttempts) {
      return false; // Rate limited
    }
    
    // Increment attempts
    this.db.run(`
      UPDATE rate_limits 
      SET attempts = attempts + 1, updated_at = ?
      WHERE ip_address = ?
    `, [now, ipAddress]);
    this.saveToFile();
    return true;
  }

  private rowToRateLimit(row: unknown[]): RateLimit {
    return {
      ip_address: row[0] as string,
      attempts: row[1] as number,
      window_start: row[2] as number,
      updated_at: row[3] as number
    };
  }

  // Cleanup operations
  cleanupExpiredData(): void {
    const now = Math.floor(Date.now() / 1000);
    
    // Clean expired pairings
    this.db.run(`
      DELETE FROM pairings 
      WHERE status = 'pending' AND expires_at < ?
    `, [now]);
    
    // Clean expired refresh tokens
    this.db.run(`
      DELETE FROM refresh_tokens 
      WHERE expires_at < ? OR revoked_at IS NOT NULL
    `, [now]);
    
    // Clean old rate limit records
    this.db.run(`
      DELETE FROM rate_limits 
      WHERE window_start < ?
    `, [now - 3600]); // 1 hour ago
    
    this.saveToFile();
  }

  close(): void {
    this.saveToFile();
    this.db.close();
  }
}

// Singleton instance
let dbInstance: DatabaseManager;
let initPromise: Promise<DatabaseManager> | null = null;

export async function getDatabase(): Promise<DatabaseManager> {
  if (!dbInstance) {
    if (!initPromise) {
      initPromise = initializeDatabase();
    }
    dbInstance = await initPromise;
    
    // Setup cleanup interval
    setInterval(() => {
      dbInstance.cleanupExpiredData();
    }, 60000); // Clean up every minute
  }
  return dbInstance;
}

async function initializeDatabase(): Promise<DatabaseManager> {
  const manager = new DatabaseManager(CONFIG.DB_PATH);
  await manager.initialize();
  return manager;
}

// Synchronous version for compatibility (will throw if not initialized)
export function getDatabaseSync(): DatabaseManager {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call getDatabase() first.');
  }
  return dbInstance;
}