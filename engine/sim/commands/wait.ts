import { Positive } from '../../data/schema/primitives';
import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export const argsSchema = Type.Object({ frames: Positive }, { additionalProperties: false });
export function registerWait(registry: CommandRegistry): void {
  registry.register('wait', {
    args: argsSchema,
    parallelSafe: true,
    *run(args, ctx) { yield ctx.waitFrames(args.frames); },
  });
}
