import winston from 'winston';
import moment from 'moment';
import { config } from 'dotenv';

config();

interface LogOptions {
  service?: string;
  userId?: string;
  guildId?: string;
  channelId?: string;
}

export class Logger {
  private logger: winston.Logger;
  private readonly service: string;

  constructor(service: string = 'SyzygyBot') {
    this.service = service;
    
    // Determine log level from environment or default to 'info'
    const logLevel = process.env.LOG_LEVEL || 'info';
    
    this.logger = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
      ),
      defaultMeta: { service: this.service },
      transports: [
        new winston.transports.File({ 
          filename: `logs/error-${moment().format('YYYY-MM-DD')}.log`, 
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        new winston.transports.File({ 
          filename: `logs/combined-${moment().format('YYYY-MM-DD')}.log`,
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
          silent: process.env.NODE_ENV === 'test'
        })
      ]
    });
  }

  public info(message: string, options?: LogOptions): void {
    this.logger.info(message, { ...options, timestamp: moment().toISOString() });
  }

  public warn(message: string, options?: LogOptions): void {
    this.logger.warn(message, { ...options, timestamp: moment().toISOString() });
  }

  public error(message: string, options?: LogOptions): void {
    this.logger.error(message, { ...options, timestamp: moment().toISOString() });
  }

  public debug(message: string, options?: LogOptions): void {
    this.logger.debug(message, { ...options, timestamp: moment().toISOString() });
  }

  public audit(
    action: string, 
    userId: string, 
    guildId: string, 
    details?: Record<string, any>
  ): void {
    this.logger.info(`AUDIT: ${action}`, {
      userId,
      guildId,
      action,
      details,
      timestamp: moment().toISOString(),
      type: 'audit'
    });
  }

  public moderation(
    action: string,
    moderatorId: string,
    targetId: string,
    guildId: string,
    reason?: string,
    duration?: number
  ): void {
    this.logger.info(`MODERATION: ${action}`, {
      action,
      moderatorId,
      targetId,
      guildId,
      reason,
      duration,
      timestamp: moment().toISOString(),
      type: 'moderation'
    });
  }

  public performance(
    operation: string,
    duration: number,
    details?: Record<string, any>
  ): void {
    this.logger.info(`PERFORMANCE: ${operation}`, {
      operation,
      duration,
      details,
      timestamp: moment().toISOString(),
      type: 'performance'
    });
  }
}