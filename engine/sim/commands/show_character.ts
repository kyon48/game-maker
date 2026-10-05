import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export function registerShowCharacter(registry: CommandRegistry): void {
  registry.register('show_character', {
    args: Type.Object({ target: Type.String(), visible: Type.Boolean() }, { additionalProperties: false }),
    parallelSafe: true,
    run(args, ctx) { ctx.showCharacter(args.target, args.visible); },
  });
}
