import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export function registerSetFlag(registry: CommandRegistry): void {
  registry.register('set_flag', {
    args: Type.Object({ flag: Type.String(), value: Type.Boolean() }, { additionalProperties: false }),
    parallelSafe: true,
    run(args, ctx) { ctx.state.setFlag(args.flag, args.value); },
  });
}
