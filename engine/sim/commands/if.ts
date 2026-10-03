import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
import type { Condition, Command } from '../../data/events';
export function registerIf(registry: CommandRegistry): void {
  registry.register('if', {
    args: Type.Object({ cond: Type.Unknown(), then: Type.Array(Type.Unknown()), else: Type.Optional(Type.Array(Type.Unknown())) }, { additionalProperties: false }),
    parallelSafe: true,
    *run(args, ctx) { yield* ctx.runCommands((ctx.evaluate(args.cond as Condition) ? args.then : args.else ?? []) as Command[]); },
  });
}
