import { Client, Collection, CommandInteraction, ApplicationCommandDataResolvable } from 'discord.js';
import { Logger } from '../utils/logger';
import { SyzygyBot } from '../index';
import { BaseCommand } from '../commands/base.command';

export class CommandHandler {
  private logger: Logger;
  private bot: SyzygyBot;
  public commands: Collection<string, BaseCommand>;

  constructor(bot: SyzygyBot) {
    this.logger = new Logger('CommandHandler');
    this.bot = bot;
    this.commands = new Collection();
  }

  public async loadCommands(): Promise<void> {
    this.logger.info('Loading commands...');
    
    // Import all command modules dynamically
    const commandModules = [
      './commands/moderation/ban.command',
      './commands/moderation/kick.command',
      './commands/moderation/mute.command',
      './commands/moderation/warn.command',
      './commands/moderation/unmute.command',
      './commands/moderation/purge.command',
      './commands/utility/help.command',
      './commands/utility/info.command',
      './commands/utility/ping.command',
      './commands/moderation/config.command',
      './commands/moderation/automod.command',
      './commands/utility/level.command',
      './commands/utility/profile.command',
      './commands/utility/ticket.command',
      './commands/utility/reaction-roles.command'
    ];

    for (const modulePath of commandModules) {
      try {
        const module = await import(modulePath);
        const CommandClass = module.default;
        if (CommandClass && typeof CommandClass === 'function') {
          const commandInstance: BaseCommand = new CommandClass();
          this.commands.set(commandInstance.data.name, commandInstance);
          this.logger.debug(`Loaded command: ${commandInstance.data.name}`);
        }
      } catch (error) {
        this.logger.error(`Failed to load command from ${modulePath}:`, error);
      }
    }

    this.logger.info(`Loaded ${this.commands.size} commands`);
  }

  public async registerCommands(client: Client): Promise<void> {
    if (!client.application) {
      this.logger.error('Client application not available');
      return;
    }

    const commandsData: ApplicationCommandDataResolvable[] = [];
    for (const command of this.commands.values()) {
      commandsData.push(command.data);
    }

    try {
      await client.application.commands.set(commandsData);
      this.logger.info(`Registered ${commandsData.length} slash commands`);
    } catch (error) {
      this.logger.error('Failed to register slash commands:', error);
    }
  }

  public async handleCommand(interaction: CommandInteraction): Promise<void> {
    if (!interaction.isChatInputCommand()) return;

    const command = this.commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({ 
        content: 'Command not found!', 
        ephemeral: true 
      });
      return;
    }

    try {
      // Log command usage
      await this.bot.database.query(
        `INSERT INTO command_usage (command_name, user_id, guild_id, channel_id) 
         VALUES (?, ?, ?, ?)`,
        [command.data.name, interaction.user.id, interaction.guildId, interaction.channelId]
      );

      // Check permissions
      if (command.permissions && interaction.member) {
        const member = interaction.member;
        if ('permissions' in member && !member.permissions.has(command.permissions)) {
          await interaction.reply({
            content: 'You do not have permission to use this command.',
            ephemeral: true
          });
          return;
        }
      }

      // Execute command
      await command.execute(interaction, this.bot);
      this.logger.info(`Command executed: ${command.data.name}`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId
      });
    } catch (error) {
      this.logger.error(`Error executing command ${command.data.name}:`, error);
      
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: 'There was an error while executing this command!',
            ephemeral: true
          });
        } else {
          await interaction.reply({
            content: 'There was an error while executing this command!',
            ephemeral: true
          });
        }
      } catch (replyError) {
        this.logger.error('Failed to send error message to user:', replyError);
      }
    }
  }
}