import { Logger } from '../utils/logger';
import { Pool, PoolClient } from 'pg';
import sqlite3 from 'sqlite3';
import { open, Database as SQLiteDB } from 'sqlite';
import { promisify } from 'util';

export interface DatabaseConfig {
  type: 'sqlite' | 'postgresql';
  sqlitePath?: string;
  postgresqlUrl?: string;
  postgresqlPoolSize?: number;
}

export interface DatabaseQueryResult {
  rows: any[];
  rowCount: number;
}

export class Database {
  private logger: Logger;
  private config: DatabaseConfig;
  private postgresPool?: Pool;
  private sqliteDb?: SQLiteDB;
  private initialized: boolean = false;

  constructor(config: DatabaseConfig) {
    this.logger = new Logger('Database');
    this.config = config;
  }

  public async initialize(): Promise<void> {
    try {
      if (this.config.type === 'postgresql') {
        await this.initializePostgreSQL();
      } else {
        await this.initializeSQLite();
      }
      
      await this.runMigrations();
      this.initialized = true;
      this.logger.info(`Database initialized successfully using ${this.config.type}`);
    } catch (error) {
      this.logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private async initializePostgreSQL(): Promise<void> {
    if (!this.config.postgresqlUrl) {
      throw new Error('PostgreSQL URL is required when using PostgreSQL database type');
    }

    this.postgresPool = new Pool({
      connectionString: this.config.postgresqlUrl,
      max: this.config.postgresqlPoolSize || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    const client = await this.postgresPool.connect();
    await client.query('SELECT NOW()');
    client.release();
  }

  private async initializeSQLite(): Promise<void> {
    if (!this.config.sqlitePath) {
      throw new Error('SQLite path is required when using SQLite database type');
    }

    this.sqliteDb = await open({
      filename: this.config.sqlitePath,
      driver: sqlite3.Database,
    });

    // Enable WAL mode for better concurrency
    await this.sqliteDb.run('PRAGMA journal_mode = WAL;');
    await this.sqliteDb.run('PRAGMA synchronous = NORMAL;');
    await this.sqliteDb.run('PRAGMA cache_size = 10000;');
    await this.sqliteDb.run('PRAGMA temp_store = memory;');
  }

  private async runMigrations(): Promise<void> {
    // Create tables if they don't exist
    if (this.config.type === 'postgresql') {
      await this.runPostgreSQLMigrations();
    } else {
      await this.runSQLiteMigrations();
    }
  }

  private async runPostgreSQLMigrations(): Promise<void> {
    const migrations = [
      `CREATE TABLE IF NOT EXISTS guild_config (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(32) UNIQUE NOT NULL,
        prefix VARCHAR(10) DEFAULT '!',
        mod_roles TEXT[] DEFAULT '{}',
        admin_roles TEXT[] DEFAULT '{}',
        mute_role_id VARCHAR(32),
        log_channel_id VARCHAR(32),
        welcome_channel_id VARCHAR(32),
        automod_enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS moderation_actions (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(32) NOT NULL,
        user_id VARCHAR(32) NOT NULL,
        moderator_id VARCHAR(32) NOT NULL,
        action_type VARCHAR(20) NOT NULL,
        reason TEXT,
        duration INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS user_data (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(32) UNIQUE NOT NULL,
        guild_id VARCHAR(32) NOT NULL,
        warnings INTEGER DEFAULT 0,
        points INTEGER DEFAULT 0,
        level INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, guild_id)
      )`,

      `CREATE TABLE IF NOT EXISTS automod_rules (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(32) NOT NULL,
        rule_type VARCHAR(50) NOT NULL,
        rule_config JSONB NOT NULL,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS command_usage (
        id SERIAL PRIMARY KEY,
        command_name VARCHAR(50) NOT NULL,
        user_id VARCHAR(32) NOT NULL,
        guild_id VARCHAR(32) NOT NULL,
        channel_id VARCHAR(32) NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const migration of migrations) {
      await this.query(migration);
    }
  }

  private async runSQLiteMigrations(): Promise<void> {
    const migrations = [
      `CREATE TABLE IF NOT EXISTS guild_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT UNIQUE NOT NULL,
        prefix TEXT DEFAULT '!',
        mod_roles TEXT DEFAULT '[]',
        admin_roles TEXT DEFAULT '[]',
        mute_role_id TEXT,
        log_channel_id TEXT,
        welcome_channel_id TEXT,
        automod_enabled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS moderation_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        moderator_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        reason TEXT,
        duration INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS user_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        warnings INTEGER DEFAULT 0,
        points INTEGER DEFAULT 0,
        level INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, guild_id)
      )`,

      `CREATE TABLE IF NOT EXISTS automod_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        rule_type TEXT NOT NULL,
        rule_config TEXT NOT NULL,
        enabled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS command_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        command_name TEXT NOT NULL,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const migration of migrations) {
      await this.query(migration);
    }
  }

  public async query(sql: string, params?: any[]): Promise<DatabaseQueryResult> {
    if (!this.initialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      if (this.config.type === 'postgresql') {
        const client = await this.postgresPool!.connect();
        try {
          const result = await client.query(sql, params);
          return {
            rows: result.rows,
            rowCount: result.rowCount || 0
          };
        } finally {
          client.release();
        }
      } else {
        const runAsync = promisify(this.sqliteDb!.run).bind(this.sqliteDb);
        const allAsync = promisify(this.sqliteDb!.all).bind(this.sqliteDb);
        
        if (sql.trim().toUpperCase().startsWith('SELECT')) {
          const rows = await allAsync(sql, params || []);
          return {
            rows,
            rowCount: rows.length
          };
        } else {
          const result = await runAsync(sql, params || []);
          return {
            rows: [],
            rowCount: result.changes || 0
          };
        }
      }
    } catch (error) {
      this.logger.error('Database query error:', { sql, params, error });
      throw error;
    }
  }

  public async getGuildConfig(guildId: string): Promise<any> {
    const result = await this.query(
      `SELECT * FROM guild_config WHERE guild_id = ?`,
      [guildId]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    // Create default config if not exists
    await this.query(
      `INSERT INTO guild_config (guild_id) VALUES (?)`,
      [guildId]
    );
    
    return {
      guild_id: guildId,
      prefix: '!',
      mod_roles: '[]', // JSON string for SQLite
      admin_roles: '[]',
      mute_role_id: null,
      log_channel_id: null,
      welcome_channel_id: null,
      automod_enabled: true
    };
  }

  public async updateGuildConfig(guildId: string, updates: Partial<any>): Promise<void> {
    const updateFields = Object.keys(updates).filter(key => key !== 'id' && key !== 'guild_id');
    if (updateFields.length === 0) return;

    const setClause = updateFields.map(field => `${field} = ?`).join(', ');
    const values = updateFields.map(field => updates[field]);
    values.push(guildId); // For WHERE clause

    await this.query(
      `UPDATE guild_config SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?`,
      values
    );
  }

  public async logModerationAction(
    guildId: string,
    userId: string,
    moderatorId: string,
    actionType: string,
    reason?: string,
    duration?: number
  ): Promise<void> {
    await this.query(
      `INSERT INTO moderation_actions (guild_id, user_id, moderator_id, action_type, reason, duration) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [guildId, userId, moderatorId, actionType, reason, duration]
    );
  }

  public async getUserData(guildId: string, userId: string): Promise<any> {
    const result = await this.query(
      `SELECT * FROM user_data WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    // Create default user data if not exists
    await this.query(
      `INSERT INTO user_data (user_id, guild_id) VALUES (?, ?)`,
      [userId, guildId]
    );
    
    return {
      user_id: userId,
      guild_id: guildId,
      warnings: 0,
      points: 0,
      level: 0
    };
  }

  public async updateUserData(
    guildId: string,
    userId: string,
    updates: Partial<any>
  ): Promise<void> {
    const updateFields = Object.keys(updates).filter(key => 
      key !== 'id' && key !== 'user_id' && key !== 'guild_id'
    );
    if (updateFields.length === 0) return;

    const setClause = updateFields.map(field => `${field} = ?`).join(', ');
    const values = updateFields.map(field => updates[field]);
    values.push(guildId, userId); // For WHERE clause

    await this.query(
      `UPDATE user_data SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
       WHERE guild_id = ? AND user_id = ?`,
      values
    );
  }

  public async close(): Promise<void> {
    if (this.config.type === 'postgresql' && this.postgresPool) {
      await this.postgresPool.end();
    } else if (this.sqliteDb) {
      await this.sqliteDb.close();
    }
    this.initialized = false;
    this.logger.info('Database connection closed');
  }
}