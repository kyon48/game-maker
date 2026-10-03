import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export function registerWait(registry: CommandRegistry): void {
  registry.register('wait', {
    args: Type.Object({ frames: Type.Integer({ minimum: 1 }) }, { additionalProperties: false }),
    parallelSafe: true,
    *run(args, ctx) { yield ctx.waitFrames(args.frames); },
  });
}
