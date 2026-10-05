import { Id } from '../../data/schema/primitives';
import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export const argsSchema = Type.Object({ common: Id }, { additionalProperties: false });
export function registerCall(registry: CommandRegistry): void {
  registry.register('call', {
    args: argsSchema,
    parallelSafe: true,
    *run(args, ctx) { yield* ctx.call(args.common); },
  });
}
