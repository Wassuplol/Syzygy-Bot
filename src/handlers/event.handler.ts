import { Client, Events, GatewayIntentBits } from 'discord.js';
import { Logger } from '../utils/logger';
import { SyzygyBot } from '../index';

export class EventHandler {
  private logger: Logger;
  private bot: SyzygyBot;

  constructor(bot: SyzygyBot) {
    this.logger = new Logger('EventHandler');
    this.bot = bot;
  }

  public async loadEvents(): Promise<void> {
    this.logger.info('Loading events...');
    
    // Message create event (for message-based commands and automod)
    this.bot.client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) return; // Ignore bot messages
      
      // Handle message-based commands
      await this.handleMessageCommand(message);
      
      // Process auto-moderation
      await this.bot.autoModeration.processMessage(message);
    });
    
    // Interaction create event (for slash commands)
    this.bot.client.on(Events.InteractionCreate, async (interaction) => {
      if (interaction.isChatInputCommand()) {
        await this.bot.commandHandler.handleCommand(interaction);
      } else if (interaction.isMessageContextMenuCommand()) {
        // Handle context menu commands
        this.logger.info('Context menu command received', {
          commandName: interaction.commandName,
          userId: interaction.user.id,
          guildId: interaction.guildId
        });
      } else if (interaction.isButton()) {
        // Handle button interactions
        await this.handleButtonInteraction(interaction);
      } else if (interaction.isSelectMenu()) {
        // Handle select menu interactions
        await this.handleSelectMenuInteraction(interaction);
      }
    });
    
    // Guild member events
    this.bot.client.on(Events.GuildMemberAdd, async (member) => {
      await this.handleGuildMemberAdd(member);
    });
    
    this.bot.client.on(Events.GuildMemberRemove, async (member) => {
      await this.handleGuildMemberRemove(member);
    });
    
    // Voice state events
    this.bot.client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
      await this.handleVoiceStateUpdate(oldState, newState);
    });
    
    // Rate limit events
    this.bot.client.on('rateLimit', (rateLimitData) => {
      this.logger.warn('Rate limit triggered', {
        timeout: rateLimitData.timeout,
        limit: rateLimitData.limit,
        method: rateLimitData.method,
        path: rateLimitData.path,
        route: rateLimitData.route
      });
    });
    
    // Error events
    this.bot.client.on('error', (error) => {
      this.logger.error('Client error', error);
    });
    
    this.logger.info('Events loaded successfully');
  }
  
  private async handleMessageCommand(message: any): Promise<void> {
    // Get guild config to determine prefix
    const guildConfig = await this.bot.database.getGuildConfig(message.guild.id);
    const prefix = guildConfig.prefix || '!';
    
    if (!message.content.startsWith(prefix)) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();
    
    if (!commandName) return;
    
    // For now, just log the message command
    this.logger.info(`Message command received: ${commandName}`, {
      userId: message.author.id,
      guildId: message.guild.id,
      channelId: message.channel.id
    });
  }
  
  private async handleButtonInteraction(interaction: any): Promise<void> {
    this.logger.info('Button interaction received', {
      customId: interaction.customId,
      userId: interaction.user.id,
      guildId: interaction.guildId
    });
    
    try {
      await interaction.deferUpdate();
      // Handle different button types based on customId
      if (interaction.customId.startsWith('ticket_')) {
        await this.handleTicketButton(interaction);
      } else if (interaction.customId.startsWith('reaction_role_')) {
        await this.handleReactionRoleButton(interaction);
      }
    } catch (error) {
      this.logger.error('Error handling button interaction:', error);
    }
  }
  
  private async handleSelectMenuInteraction(interaction: any): Promise<void> {
    this.logger.info('Select menu interaction received', {
      customId: interaction.customId,
      userId: interaction.user.id,
      guildId: interaction.guildId
    });
    
    try {
      await interaction.deferUpdate();
      // Handle different select menu types
      if (interaction.customId === 'reaction_role_select') {
        await this.handleReactionRoleSelect(interaction);
      }
    } catch (error) {
      this.logger.error('Error handling select menu interaction:', error);
    }
  }
  
  private async handleGuildMemberAdd(member: any): Promise<void> {
    this.logger.info('Guild member joined', {
      userId: member.id,
      guildId: member.guild.id,
      username: member.user.tag
    });
    
    // Check if welcome messages are enabled
    const guildConfig = await this.bot.database.getGuildConfig(member.guild.id);
    if (guildConfig.welcome_channel_id) {
      try {
        const channel = member.guild.channels.cache.get(guildConfig.welcome_channel_id);
        if (channel) {
          await channel.send(`Welcome to the server, ${member}!`);
        }
      } catch (error) {
        this.logger.error('Error sending welcome message:', error);
      }
    }
  }
  
  private async handleGuildMemberRemove(member: any): Promise<void> {
    this.logger.info('Guild member left', {
      userId: member.id,
      guildId: member.guild.id,
      username: member.user.tag
    });
  }
  
  private async handleVoiceStateUpdate(oldState: any, newState: any): Promise<void> {
    // Log voice state changes
    if (oldState.channelId !== newState.channelId) {
      if (!oldState.channelId) {
        // User joined a voice channel
        this.logger.info('User joined voice channel', {
          userId: newState.id,
          guildId: newState.guild.id,
          channelId: newState.channelId
        });
      } else if (!newState.channelId) {
        // User left a voice channel
        this.logger.info('User left voice channel', {
          userId: oldState.id,
          guildId: oldState.guild.id,
          channelId: oldState.channelId
        });
      } else {
        // User moved between voice channels
        this.logger.info('User moved voice channels', {
          userId: newState.id,
          guildId: newState.guild.id,
          oldChannelId: oldState.channelId,
          newChannelId: newState.channelId
        });
      }
    }
  }
  
  private async handleTicketButton(interaction: any): Promise<void> {
    // Handle ticket system buttons
    const [action, ticketId] = interaction.customId.split('_').slice(1);
    
    if (action === 'create') {
      // Create a new ticket
      await this.createTicket(interaction);
    } else if (action === 'close') {
      // Close ticket
      await this.closeTicket(interaction, ticketId);
    } else if (action === 'claim') {
      // Claim ticket
      await this.claimTicket(interaction, ticketId);
    }
  }
  
  private async createTicket(interaction: any): Promise<void> {
    try {
      // Create a private channel for the ticket
      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: 0, // Text channel
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone,
            deny: ['ViewChannel'],
          },
          {
            id: interaction.user.id,
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
          },
          // Add staff role permissions here
        ],
      });
      
      await interaction.update({
        content: `Your ticket has been created: ${ticketChannel}`,
        components: []
      });
      
      await ticketChannel.send({
        content: `Hello ${interaction.user}, staff will be with you shortly.`,
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                label: 'Close Ticket',
                style: 4,
                customId: `ticket_close_${ticketChannel.id}`
              }
            ]
          }
        ]
      });
    } catch (error) {
      this.logger.error('Error creating ticket:', error);
      await interaction.followUp({
        content: 'There was an error creating your ticket.',
        ephemeral: true
      });
    }
  }
  
  private async closeTicket(interaction: any, ticketId: string): Promise<void> {
    try {
      const ticketChannel = interaction.guild.channels.cache.get(ticketId);
      if (ticketChannel) {
        await ticketChannel.delete();
        await interaction.update({
          content: 'Ticket closed.',
          components: []
        });
      }
    } catch (error) {
      this.logger.error('Error closing ticket:', error);
    }
  }
  
  private async claimTicket(interaction: any, ticketId: string): Promise<void> {
    // Placeholder for ticket claiming logic
    await interaction.reply({
      content: `Ticket claimed by ${interaction.user}`,
      ephemeral: true
    });
  }
  
  private async handleReactionRoleButton(interaction: any): Promise<void> {
    // Handle reaction role buttons
    const [_, roleId] = interaction.customId.split('_').slice(2);
    
    try {
      const member = interaction.member;
      const role = interaction.guild.roles.cache.get(roleId);
      
      if (!role) {
        await interaction.reply({
          content: 'Role not found.',
          ephemeral: true
        });
        return;
      }
      
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(role);
        await interaction.reply({
          content: `Removed role: ${role.name}`,
          ephemeral: true
        });
      } else {
        await member.roles.add(role);
        await interaction.reply({
          content: `Added role: ${role.name}`,
          ephemeral: true
        });
      }
    } catch (error) {
      this.logger.error('Error handling reaction role button:', error);
      await interaction.reply({
        content: 'There was an error updating your roles.',
        ephemeral: true
      });
    }
  }
  
  private async handleReactionRoleSelect(interaction: any): Promise<void> {
    // Handle reaction role select menus
    const selectedRoles = interaction.values;
    const member = interaction.member;
    
    try {
      for (const roleId of selectedRoles) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (role) {
          await member.roles.add(role);
        }
      }
      
      await interaction.update({
        content: `Added roles: ${selectedRoles.length}`,
        components: []
      });
    } catch (error) {
      this.logger.error('Error handling reaction role select:', error);
      await interaction.followUp({
        content: 'There was an error updating your roles.',
        ephemeral: true
      });
    }
  }
}