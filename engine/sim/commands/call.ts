import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export function registerCall(registry: CommandRegistry): void {
  registry.register('call', {
    args: Type.Object({ common: Type.String() }, { additionalProperties: false }),
    parallelSafe: true,
    *run(args, ctx) { yield* ctx.call(args.common); },
  });
}
