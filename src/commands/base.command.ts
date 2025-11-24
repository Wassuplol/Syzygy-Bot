import { 
  CommandInteraction, 
  PermissionResolvable,
  ApplicationCommandData
} from 'discord.js';
import { SyzygyBot } from '../index';

export abstract class BaseCommand {
  public abstract data: ApplicationCommandData;
  public abstract permissions?: PermissionResolvable;
  
  public abstract execute(
    interaction: CommandInteraction, 
    bot: SyzygyBot
  ): Promise<void>;
}