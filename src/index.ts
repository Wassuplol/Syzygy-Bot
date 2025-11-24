import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import { config } from 'dotenv';
import { Logger } from './utils/logger';
import { Database } from './database/database';
import { CommandHandler } from './handlers/command.handler';
import { EventHandler } from './handlers/event.handler';
import { AutoModeration } from './moderation/automod';
import { ConfigManager } from './config/config.manager';
import { PerformanceMonitor } from './monitoring/performance';

// Load environment variables
config();

export class SyzygyBot {
  public client: Client;
  public logger: Logger;
  public database: Database;
  public configManager: ConfigManager;
  public commandHandler: CommandHandler;
  public eventHandler: EventHandler;
  public autoModeration: AutoModeration;
  public performanceMonitor: PerformanceMonitor;
  
  constructor() {
    // Initialize core components
    this.logger = new Logger();
    this.configManager = new ConfigManager();
    this.database = new Database(this.configManager.getDatabaseConfig());
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
    
    this.commandHandler = new CommandHandler(this);
    this.eventHandler = new EventHandler(this);
    this.autoModeration = new AutoModeration(this);
    this.performanceMonitor = new PerformanceMonitor();
    
    this.setupEventListeners();
  }
  
  private setupEventListeners(): void {
    this.client.once(Events.ClientReady, async () => {
      this.logger.info(`Syzygy Bot ready! Logged in as ${this.client.user?.tag}`);
      await this.initialize();
    });
    
    this.client.on(Events.Error, (error) => {
      this.logger.error('Discord API Error:', error);
    });
    
    this.client.on(Events.Warn, (warn) => {
      this.logger.warn('Discord API Warning:', warn);
    });
  }
  
  private async initialize(): Promise<void> {
    try {
      // Initialize database
      await this.database.initialize();
      
      // Initialize command handler
      await this.commandHandler.loadCommands();
      
      // Initialize event handler
      await this.eventHandler.loadEvents();
      
      // Initialize auto-moderation
      await this.autoModeration.initialize();
      
      // Start performance monitoring
      this.performanceMonitor.startMonitoring();
      
      this.logger.info('Syzygy Bot initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Syzygy Bot:', error);
      process.exit(1);
    }
  }
  
  public async start(): Promise<void> {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      this.logger.error('DISCORD_TOKEN environment variable is required');
      process.exit(1);
    }
    
    try {
      await this.client.login(token);
      this.logger.info('Syzygy Bot started successfully');
    } catch (error) {
      this.logger.error('Failed to login to Discord:', error);
      process.exit(1);
    }
  }
  
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down Syzygy Bot...');
    
    // Stop performance monitoring
    this.performanceMonitor.stopMonitoring();
    
    // Close database connection
    await this.database.close();
    
    // Destroy Discord client
    this.client.destroy();
    
    this.logger.info('Syzygy Bot shut down successfully');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  const bot = new SyzygyBot();
  await bot.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  const bot = new SyzygyBot();
  await bot.shutdown();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the bot
const bot = new SyzygyBot();
bot.start().catch(console.error);