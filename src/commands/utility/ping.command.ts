import { 
  CommandInteraction, 
  ApplicationCommandOptionType,
  PermissionFlagsBits
} from 'discord.js';
import { BaseCommand } from '../../commands/base.command';
import { SyzygyBot } from '../../index';

export default class PingCommand extends BaseCommand {
  public data = {
    name: 'ping',
    description: 'Check the bot\'s latency and response time',
    options: []
  };

  public permissions = PermissionFlagsBits.SendMessages;

  public async execute(interaction: CommandInteraction, bot: SyzygyBot): Promise<void> {
    const startTime = Date.now();
    
    await interaction.reply({ 
      content: 'Pinging...', 
      ephemeral: true 
    });
    
    const endTime = Date.now();
    const apiLatency = Math.round(bot.client.ws.ping);
    const responseTime = endTime - startTime;
    
    await interaction.editReply({
      content: `Pong! 🏓\nAPI Latency: ${apiLatency}ms\nResponse Time: ${responseTime}ms`
    });
    
    bot.logger.info('Ping command executed', {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      apiLatency,
      responseTime
    });
  }
}