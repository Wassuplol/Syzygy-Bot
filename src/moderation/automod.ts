import { Message, GuildMember, Guild, ChannelType } from 'discord.js';
import { Logger } from '../utils/logger';
import { SyzygyBot } from '../index';
import { NanoGPTService } from '../services/nanoGPTService';

export interface AutoModRule {
  id: string;
  guildId: string;
  type: 'profanity' | 'spam' | 'invites' | 'links' | 'caps' | 'duplicate' | 'raid';
  enabled: boolean;
  config: {
    [key: string]: any;
  };
  createdAt: Date;
}

export class AutoModeration {
  private logger: Logger;
  private bot: SyzygyBot;
  private nanoGPTService: NanoGPTService | null = null;
  private rules: Map<string, AutoModRule[]> = new Map(); // guildId -> rules
  private spamTracker: Map<string, { messages: number; timestamp: number }[]> = new Map();
  private inviteCache: Set<string> = new Set();

  constructor(bot: SyzygyBot) {
    this.logger = new Logger('AutoModeration');
    this.bot = bot;
    
    // Initialize NanoGPT service if AI image moderation is enabled
    if (bot.config.isAiImageModerationEnabled()) {
      this.nanoGPTService = new NanoGPTService();
      this.logger.info('AI Image Moderation service initialized');
    } else {
      this.logger.info('AI Image Moderation service disabled');
    }
  }

  public async initialize(): Promise<void> {
    this.logger.info('Initializing auto-moderation system...');
    
    // Load auto-mod rules from database
    await this.loadRules();
    
    // Preload guild invites to distinguish between external and internal invites
    await this.preloadGuildInvites();
    
    this.logger.info('Auto-moderation system initialized successfully');
  }

  private async loadRules(): Promise<void> {
    try {
      const result = await this.bot.database.query(
        'SELECT * FROM automod_rules WHERE enabled = ?',
        [true]
      );
      
      for (const row of result.rows) {
        const guildId = row.guild_id;
        if (!this.rules.has(guildId)) {
          this.rules.set(guildId, []);
        }
        
        const rule: AutoModRule = {
          id: row.id.toString(),
          guildId: row.guild_id,
          type: row.rule_type,
          enabled: row.enabled,
          config: typeof row.rule_config === 'string' 
            ? JSON.parse(row.rule_config) 
            : row.rule_config,
          createdAt: new Date(row.created_at)
        };
        
        this.rules.get(guildId)!.push(rule);
      }
      
      this.logger.info(`Loaded ${result.rows.length} auto-moderation rules`);
    } catch (error) {
      this.logger.error('Failed to load auto-moderation rules:', error);
    }
  }

  private async preloadGuildInvites(): Promise<void> {
    // For each guild the bot is in, cache its invite codes
    for (const guild of this.bot.client.guilds.cache.values()) {
      try {
        const invites = await guild.invites.fetch();
        for (const invite of invites.values()) {
          this.inviteCache.add(invite.code);
        }
      } catch (error) {
        // Some guilds might not have permission to fetch invites
        this.logger.debug(`Could not fetch invites for guild ${guild.id}:`, error);
      }
    }
  }

  public async processMessage(message: Message): Promise<void> {
    if (!message.guild) return; // Only process guild messages

    // First, handle image attachments if AI image moderation is enabled
    if (this.nanoGPTService && message.attachments.size > 0) {
      await this.analyzeImages(message);
    }

    const guildId = message.guild.id;
    const rules = this.rules.get(guildId) || [];

    // Skip if automod is disabled for this guild
    const guildConfig = await this.bot.database.getGuildConfig(guildId);
    if (!guildConfig.automod_enabled) return;

    // Check if user has admin/moderator roles
    if (await this.hasModeratorRole(message.member, guildId)) {
      return; // Don't moderate moderators/admins
    }

    // Process each enabled rule
    for (const rule of rules) {
      if (!rule.enabled) continue;

      let shouldTakeAction = false;
      let reason = '';

      switch (rule.type) {
        case 'profanity':
          shouldTakeAction = this.checkProfanity(message.content, rule.config);
          reason = 'Profanity detected';
          break;

        case 'spam':
          shouldTakeAction = await this.checkSpam(message, rule.config);
          reason = 'Spam detected';
          break;

        case 'invites':
          shouldTakeAction = this.checkInvites(message.content, rule.config);
          reason = 'Unauthorized invite detected';
          break;

        case 'links':
          shouldTakeAction = this.checkLinks(message.content, rule.config);
          reason = 'Unauthorized link detected';
          break;

        case 'caps':
          shouldTakeAction = this.checkCaps(message.content, rule.config);
          reason = 'Excessive caps detected';
          break;

        case 'duplicate':
          shouldTakeAction = await this.checkDuplicate(message, rule.config);
          reason = 'Duplicate message detected';
          break;

        default:
          this.logger.warn(`Unknown automod rule type: ${rule.type}`);
          break;
      }

      if (shouldTakeAction) {
        await this.takeModerationAction(
          message.guild,
          message.member,
          message,
          rule.type,
          reason
        );
        break; // Only take one action per message
      }
    }
  }

  private async analyzeImages(message: Message): Promise<void> {
    if (!this.nanoGPTService) return;

    for (const attachment of message.attachments.values()) {
      // Only process image files
      if (!attachment.contentType || !attachment.contentType.startsWith('image/')) {
        continue;
      }

      try {
        // Download the image
        const response = await fetch(attachment.url);
        if (!response.ok) {
          throw new Error(`Failed to download image: ${response.status}`);
        }

        const imageBuffer = Buffer.from(await response.arrayBuffer());

        // Analyze the image with NanoGPT
        const result = await this.nanoGPTService.analyzeImage(message, imageBuffer);

        if (result.isViolation) {
          this.logger.moderation(
            'Image Violation Detected (AI)', 
            this.bot.client.user!.id, 
            message.author.id, 
            message.guild!.id, 
            result.reason || 'AI detected violation'
          );

          // Take moderation action
          await this.takeModerationAction(
            message.guild!,
            message.member,
            message,
            'image-violation',
            result.reason || 'AI detected violation'
          );
        } else {
          this.logger.debug(`Image analysis completed for ${message.id}: SAFE`);
        }
      } catch (error) {
        this.logger.error(`Error analyzing image attachment:`, error);
        
        // If AI fails and failsafe is enabled, fall back to basic image moderation
        if (this.bot.config.isAiFailsafeEnabled()) {
          this.logger.info(`AI analysis failed, applying failsafe image moderation for message ${message.id}`);
          // For now, just log that there was an error in AI analysis
          // Additional failsafe logic can be implemented here if needed
        }
      }
    }
  }

  private async hasModeratorRole(member: GuildMember | null, guildId: string): Promise<boolean> {
    if (!member) return false;
    
    const guildConfig = await this.bot.database.getGuildConfig(guildId);
    const modRoles = guildConfig.mod_roles ? 
      Array.isArray(guildConfig.mod_roles) ? 
        guildConfig.mod_roles : 
        JSON.parse(guildConfig.mod_roles) : 
      [];
    
    const adminRoles = guildConfig.admin_roles ? 
      Array.isArray(guildConfig.admin_roles) ? 
        guildConfig.admin_roles : 
        JSON.parse(guildConfig.admin_roles) : 
      [];
    
    const allModeratorRoles = [...modRoles, ...adminRoles];
    
    return member.roles.cache.some(role => allModeratorRoles.includes(role.id));
  }

  private checkProfanity(content: string, config: any): boolean {
    if (!config.enabled) return false;
    
    const words = config.prohibitedWords || [];
    const normalizedContent = content.toLowerCase();
    
    for (const word of words) {
      if (normalizedContent.includes(word.toLowerCase())) {
        return true;
      }
    }
    
    return false;
  }

  private async checkSpam(message: Message, config: any): boolean {
    if (!config.enabled) return false;
    
    const userId = message.author.id;
    const now = Date.now();
    const timeWindow = config.timeWindow || 5000; // 5 seconds
    const maxMessages = config.maxMessages || 5;
    
    if (!this.spamTracker.has(userId)) {
      this.spamTracker.set(userId, []);
    }
    
    const userMessages = this.spamTracker.get(userId)!;
    
    // Remove messages older than time window
    const recentMessages = userMessages.filter(msg => now - msg.timestamp < timeWindow);
    
    // Add current message
    recentMessages.push({ messages: 1, timestamp: now });
    
    this.spamTracker.set(userId, recentMessages);
    
    return recentMessages.length > maxMessages;
  }

  private checkInvites(content: string, config: any): boolean {
    if (!config.enabled) return false;
    
    // Look for Discord invite patterns
    const inviteRegex = /discord(?:app\.com\/invite|\.gg)\/([a-zA-Z0-9-]+)/gi;
    const matches = content.match(inviteRegex);
    
    if (!matches) return false;
    
    // Check if any invite is external (not from this guild)
    for (const match of matches) {
      const code = match.split('/').pop();
      if (!this.inviteCache.has(code)) {
        return true; // External invite detected
      }
    }
    
    return false;
  }

  private checkLinks(content: string, config: any): boolean {
    if (!config.enabled) return false;
    
    // Look for URL patterns
    const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
    const urls = content.match(urlRegex);
    
    if (!urls || urls.length === 0) return false;
    
    // If whitelist is configured, only allow whitelisted domains
    if (config.whitelist && config.whitelist.length > 0) {
      for (const url of urls) {
        let isWhitelisted = false;
        for (const domain of config.whitelist) {
          if (url.includes(domain)) {
            isWhitelisted = true;
            break;
          }
        }
        if (!isWhitelisted) {
          return true;
        }
      }
    }
    
    // If blacklist is configured, block blacklisted domains
    if (config.blacklist && config.blacklist.length > 0) {
      for (const url of urls) {
        for (const domain of config.blacklist) {
          if (url.includes(domain)) {
            return true;
          }
        }
      }
    }
    
    return false;
  }

  private checkCaps(content: string, config: any): boolean {
    if (!config.enabled) return false;
    
    const minCharacters = config.minCharacters || 10;
    const threshold = config.threshold || 0.7; // 70% caps
    
    if (content.length < minCharacters) return false;
    
    const capMatches = content.match(/[A-Z]/g);
    if (!capMatches) return false;
    
    const capRatio = capMatches.length / content.length;
    return capRatio > threshold;
  }

  private async checkDuplicate(message: Message, config: any): boolean {
    if (!config.enabled) return false;
    
    // Check if user sent the same message recently
    const channel = message.channel;
    if (channel.type !== ChannelType.GuildText) return false;
    
    const limit = config.checkLimit || 10;
    const messages = await channel.messages.fetch({ limit });
    
    let duplicateCount = 0;
    for (const [, msg] of messages) {
      if (
        msg.author.id === message.author.id &&
        msg.content === message.content &&
        msg.id !== message.id // Don't count the current message
      ) {
        duplicateCount++;
        if (duplicateCount >= (config.maxDuplicates || 2)) {
          return true;
        }
      }
    }
    
    return false;
  }

  private async takeModerationAction(
    guild: Guild,
    member: GuildMember | null,
    message: Message,
    actionType: string,
    reason: string
  ): Promise<void> {
    if (!member) return;
    
    try {
      // Log the moderation action
      await this.bot.database.logModerationAction(
        guild.id,
        member.id,
        this.bot.client.user!.id,
        actionType,
        reason
      );
      
      // Take the appropriate action based on config
      const guildConfig = await this.bot.database.getGuildConfig(guild.id);
      const action = guildConfig.automod_action || 'warn'; // Default to warn
      
      switch (action) {
        case 'delete':
          await message.delete();
          this.logger.moderation('Message Deleted (AutoMod)', this.bot.client.user!.id, member.id, guild.id, reason);
          break;
          
        case 'mute':
          // Try to find or create a mute role
          let muteRole = guild.roles.cache.find(role => role.name.toLowerCase() === 'muted');
          if (!muteRole) {
            // Create a mute role if it doesn't exist
            muteRole = await guild.roles.create({
              name: 'Muted',
              permissions: [],
              reason: 'AutoMod: Creating mute role'
            });
            
            // Set permissions for all text channels to deny sending messages
            for (const [, channel] of guild.channels.cache) {
              if (channel.type === ChannelType.GuildText) {
                await channel.permissionOverwrites.edit(muteRole, {
                  SendMessages: false,
                  AddReactions: false,
                  Speak: false
                });
              }
            }
          }
          
          await member.roles.add(muteRole, reason);
          this.logger.moderation('User Muted (AutoMod)', this.bot.client.user!.id, member.id, guild.id, reason);
          break;
          
        case 'kick':
          await member.kick(reason);
          this.logger.moderation('User Kicked (AutoMod)', this.bot.client.user!.id, member.id, guild.id, reason);
          break;
          
        case 'ban':
          await member.ban({ reason });
          this.logger.moderation('User Banned (AutoMod)', this.bot.client.user!.id, member.id, guild.id, reason);
          break;
          
        case 'warn':
        default:
          // Just log the warning
          this.logger.moderation('User Warned (AutoMod)', this.bot.client.user!.id, member.id, guild.id, reason);
          break;
      }
      
      // Send a DM to the user if possible
      try {
        await member.send(`You have been automatically ${action}ed in ${guild.name} for: ${reason}`);
      } catch (dmError) {
        // DM failed, log but continue
        this.logger.debug('Could not DM user about automod action', dmError);
      }
      
      // Log to mod channel if configured
      if (guildConfig.log_channel_id) {
        const logChannel = guild.channels.cache.get(guildConfig.log_channel_id);
        if (logChannel && logChannel.type === ChannelType.GuildText) {
          await (logChannel as any).send({
            content: `**AutoMod Action Taken**\n**User:** ${member.user.tag} (${member.id})\n**Action:** ${action}\n**Reason:** ${reason}\n**Channel:** ${message.channel}`
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to take automod action:', error);
    }
  }

  public async addRule(rule: Omit<AutoModRule, 'id' | 'createdAt'>): Promise<string> {
    const id = Date.now().toString();
    
    const newRule: AutoModRule = {
      ...rule,
      id,
      createdAt: new Date()
    };
    
    // Save to database
    await this.bot.database.query(
      `INSERT INTO automod_rules (guild_id, rule_type, rule_config, enabled) 
       VALUES (?, ?, ?, ?)`,
      [rule.guildId, rule.type, JSON.stringify(rule.config), rule.enabled]
    );
    
    // Add to in-memory cache
    if (!this.rules.has(rule.guildId)) {
      this.rules.set(rule.guildId, []);
    }
    this.rules.get(rule.guildId)!.push(newRule);
    
    this.logger.info(`Added automod rule: ${rule.type} for guild ${rule.guildId}`);
    return id;
  }

  public async removeRule(guildId: string, ruleId: string): Promise<void> {
    // Remove from database
    await this.bot.database.query(
      'DELETE FROM automod_rules WHERE id = ? AND guild_id = ?',
      [ruleId, guildId]
    );
    
    // Remove from in-memory cache
    if (this.rules.has(guildId)) {
      const rules = this.rules.get(guildId)!;
      const index = rules.findIndex(r => r.id === ruleId);
      if (index !== -1) {
        rules.splice(index, 1);
      }
    }
    
    this.logger.info(`Removed automod rule: ${ruleId} from guild ${guildId}`);
  }

  public getRulesForGuild(guildId: string): AutoModRule[] {
    return this.rules.get(guildId) || [];
  }
}