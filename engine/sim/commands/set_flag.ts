import { Id } from '../../data/schema/primitives';
import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export const argsSchema = Type.Object({ flag: Id, value: Type.Boolean() }, { additionalProperties: false });
export function registerSetFlag(registry: CommandRegistry): void {
  registry.register('set_flag', {
    args: argsSchema,
    parallelSafe: true,
    run(args, ctx) { ctx.state.setFlag(args.flag, args.value); },
  });
}
