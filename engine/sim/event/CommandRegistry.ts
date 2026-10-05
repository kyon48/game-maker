import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { Command } from '../../data/events';
import type { CommandContext, CommandGen, CommandHandler } from './types';
export interface CommandDefinition<S extends TSchema> {
  args: S; parallelSafe?: boolean; run: CommandHandler<Static<S>>;
}
interface RegisteredCommand { args: TSchema; parallelSafe: boolean; run: (args: unknown, context: CommandContext) => CommandGen | void }
export class CommandRegistry {
  private readonly commands = new Map<string, RegisteredCommand>();
  register<S extends TSchema>(name: string, definition: CommandDefinition<S>): void {
    if (this.commands.has(name)) throw new Error(`Duplicate command: ${name}`);
    this.commands.set(name, { args: definition.args, parallelSafe: definition.parallelSafe ?? false,
      run: (args, context) => definition.run(args as Static<S>, context) });
  }
  execute(command: Command, context: CommandContext): CommandGen | void {
    const definition = this.commands.get(command.cmd);
    if (!definition) throw new Error(`Unknown command: ${command.cmd}`);
    if (context.parallel && !definition.parallelSafe) throw new Error(`Command forbidden in parallel: ${command.cmd}`);
    const args: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(command)) if (key !== 'cmd') args[key] = value;
    if (!Value.Check(definition.args, args)) throw new Error(`Invalid arguments: ${command.cmd}`);
    return definition.run(args, context);
  }
}
