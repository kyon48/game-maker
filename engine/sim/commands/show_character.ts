import { Id } from '../../data/schema/primitives';
import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export const argsSchema = Type.Object({ target: Id, visible: Type.Boolean() }, { additionalProperties: false });
export function registerShowCharacter(registry: CommandRegistry): void {
  registry.register('show_character', {
    args: argsSchema,
    parallelSafe: true,
    run(args, ctx) { ctx.showCharacter(args.target, args.visible); },
  });
}
