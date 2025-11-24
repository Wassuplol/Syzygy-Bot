import Joi from 'joi';
import { Logger } from '../utils/logger';
import { DatabaseConfig } from '../database/database';

export interface BotConfig {
  discordToken: string;
  database: DatabaseConfig;
  redisUrl?: string;
  maxShards?: number;
  shardConcurrency?: 'auto' | number;
  performance: {
    maxMemoryUsage: number; // in MB
    cpuThreshold: number; // percentage
    maxResponseTime: number; // in ms
  };
  privacy: {
    dataRetentionDays: number;
    autoPurgeEnabled: boolean;
    collectUsageStats: boolean;
  };
  security: {
    maxCommandExecutionsPerMinute: number;
    rateLimitWindowMs: number;
    antiNukeEnabled: boolean;
    antiNukeThreshold: number;
  };
  features: {
    autoModeration: boolean;
    levelingSystem: boolean;
    reactionRoles: boolean;
    ticketSystem: boolean;
    logging: boolean;
  };
}

export class ConfigManager {
  private logger: Logger;
  private config: BotConfig;

  constructor() {
    this.logger = new Logger('ConfigManager');
    this.config = this.loadConfig();
    this.validateConfig();
    this.logger.info('Configuration loaded and validated successfully');
  }

  private loadConfig(): BotConfig {
    // Validate environment variables
    const envSchema = Joi.object({
      DISCORD_TOKEN: Joi.string().required(),
      DATABASE_TYPE: Joi.string().valid('sqlite', 'postgresql').required(),
      SQLITE_PATH: Joi.string().when('DATABASE_TYPE', { is: 'sqlite', then: Joi.required(), otherwise: Joi.optional() }),
      POSTGRESQL_URL: Joi.string().when('DATABASE_TYPE', { is: 'postgresql', then: Joi.required(), otherwise: Joi.optional() }),
      REDIS_URL: Joi.string().optional(),
      MAX_SHARDS: Joi.number().integer().min(1).max(16).optional(),
      SHARD_CONCURRENCY: Joi.alternatives().try(Joi.string().valid('auto'), Joi.number().integer().min(1)).optional(),
      MAX_MEMORY_USAGE: Joi.number().integer().min(100).max(2048).default(512),
      CPU_THRESHOLD: Joi.number().integer().min(10).max(100).default(70),
      MAX_RESPONSE_TIME: Joi.number().integer().min(100).max(5000).default(1000),
      DATA_RETENTION_DAYS: Joi.number().integer().min(1).max(365).default(90),
      AUTO_PURGE_ENABLED: Joi.boolean().default(true),
      COLLECT_USAGE_STATS: Joi.boolean().default(false),
      MAX_COMMAND_EXECUTIONS_PER_MINUTE: Joi.number().integer().min(1).max(1000).default(100),
      RATE_LIMIT_WINDOW_MS: Joi.number().integer().min(1000).max(60000).default(60000),
      ANTI_NUKE_ENABLED: Joi.boolean().default(true),
      ANTI_NUKE_THRESHOLD: Joi.number().integer().min(5).max(100).default(10),
    });

    const { error, value: env } = envSchema.validate(process.env, { allowUnknown: true });
    if (error) {
      this.logger.error('Environment variable validation error:', error.message);
      throw new Error(`Invalid environment configuration: ${error.message}`);
    }

    // Construct database config
    const database: DatabaseConfig = {
      type: env.DATABASE_TYPE as 'sqlite' | 'postgresql',
    };

    if (database.type === 'sqlite') {
      database.sqlitePath = env.SQLITE_PATH;
    } else {
      database.postgresqlUrl = env.POSTGRESQL_URL;
      database.postgresqlPoolSize = parseInt(process.env.POSTGRESQL_POOL_SIZE || '20', 10);
    }

    return {
      discordToken: env.DISCORD_TOKEN,
      database,
      redisUrl: env.REDIS_URL,
      maxShards: env.MAX_SHARDS,
      shardConcurrency: env.SHARD_CONCURRENCY,
      performance: {
        maxMemoryUsage: env.MAX_MEMORY_USAGE,
        cpuThreshold: env.CPU_THRESHOLD,
        maxResponseTime: env.MAX_RESPONSE_TIME,
      },
      privacy: {
        dataRetentionDays: env.DATA_RETENTION_DAYS,
        autoPurgeEnabled: env.AUTO_PURGE_ENABLED,
        collectUsageStats: env.COLLECT_USAGE_STATS,
      },
      security: {
        maxCommandExecutionsPerMinute: env.MAX_COMMAND_EXECUTIONS_PER_MINUTE,
        rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
        antiNukeEnabled: env.ANTI_NUKE_ENABLED,
        antiNukeThreshold: env.ANTI_NUKE_THRESHOLD,
      },
      features: {
        autoModeration: true,
        levelingSystem: true,
        reactionRoles: true,
        ticketSystem: true,
        logging: true,
      }
    };
  }

  private validateConfig(): void {
    const configSchema = Joi.object({
      discordToken: Joi.string().required(),
      database: Joi.object({
        type: Joi.string().valid('sqlite', 'postgresql').required(),
        sqlitePath: Joi.when('type', { is: 'sqlite', then: Joi.string().required(), otherwise: Joi.optional() }),
        postgresqlUrl: Joi.when('type', { is: 'postgresql', then: Joi.string().required(), otherwise: Joi.optional() }),
        postgresqlPoolSize: Joi.number().integer().min(1).max(100).optional(),
      }).required(),
      redisUrl: Joi.string().optional(),
      maxShards: Joi.number().integer().min(1).max(16).optional(),
      shardConcurrency: Joi.alternatives().try(Joi.string().valid('auto'), Joi.number().integer().min(1)).optional(),
      performance: Joi.object({
        maxMemoryUsage: Joi.number().integer().min(100).max(2048).required(),
        cpuThreshold: Joi.number().integer().min(10).max(100).required(),
        maxResponseTime: Joi.number().integer().min(100).max(5000).required(),
      }).required(),
      privacy: Joi.object({
        dataRetentionDays: Joi.number().integer().min(1).max(365).required(),
        autoPurgeEnabled: Joi.boolean().required(),
        collectUsageStats: Joi.boolean().required(),
      }).required(),
      security: Joi.object({
        maxCommandExecutionsPerMinute: Joi.number().integer().min(1).max(1000).required(),
        rateLimitWindowMs: Joi.number().integer().min(1000).max(60000).required(),
        antiNukeEnabled: Joi.boolean().required(),
        antiNukeThreshold: Joi.number().integer().min(5).max(100).required(),
      }).required(),
      features: Joi.object({
        autoModeration: Joi.boolean().required(),
        levelingSystem: Joi.boolean().required(),
        reactionRoles: Joi.boolean().required(),
        ticketSystem: Joi.boolean().required(),
        logging: Joi.boolean().required(),
      }).required(),
    });

    const { error } = configSchema.validate(this.config, { 
      allowUnknown: false,
      stripUnknown: true 
    });

    if (error) {
      this.logger.error('Configuration validation error:', error.message);
      throw new Error(`Invalid configuration: ${error.message}`);
    }
  }

  public getDatabaseConfig(): DatabaseConfig {
    return { ...this.config.database };
  }

  public getRedisUrl(): string | undefined {
    return this.config.redisUrl;
  }

  public getMaxShards(): number | undefined {
    return this.config.maxShards;
  }

  public getShardConcurrency(): 'auto' | number | undefined {
    return this.config.shardConcurrency;
  }

  public getPerformanceConfig(): BotConfig['performance'] {
    return this.config.performance;
  }

  public getPrivacyConfig(): BotConfig['privacy'] {
    return this.config.privacy;
  }

  public getSecurityConfig(): BotConfig['security'] {
    return this.config.security;
  }

  public getFeaturesConfig(): BotConfig['features'] {
    return this.config.features;
  }

  public isFeatureEnabled(feature: keyof BotConfig['features']): boolean {
    return this.config.features[feature];
  }

  public getDiscordToken(): string {
    return this.config.discordToken;
  }

  public updateConfig(updates: Partial<BotConfig>): void {
    // Deep merge updates with existing config
    this.config = { ...this.config, ...updates };
    this.validateConfig();
    this.logger.info('Configuration updated successfully');
  }

  public validateGuildConfig(guildConfig: any): boolean {
    const guildConfigSchema = Joi.object({
      prefix: Joi.string().min(1).max(10).default('!'),
      modRoles: Joi.array().items(Joi.string()).default([]),
      adminRoles: Joi.array().items(Joi.string()).default([]),
      muteRoleId: Joi.string().optional(),
      logChannelId: Joi.string().optional(),
      welcomeChannelId: Joi.string().optional(),
      automodEnabled: Joi.boolean().default(true),
    });

    const { error } = guildConfigSchema.validate(guildConfig);
    return !error;
  }
}