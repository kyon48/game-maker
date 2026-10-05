import { CommandRef, ConditionRef } from '../../data/schema/events';
import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export const argsSchema = Type.Object({ cond: ConditionRef, then: Type.Array(CommandRef), else: Type.Optional(Type.Array(CommandRef)) }, { additionalProperties: false });
export function registerIf(registry: CommandRegistry): void {
  registry.register('if', {
    args: argsSchema,
    parallelSafe: true,
    *run(args, ctx) { yield* ctx.runCommands(ctx.evaluate(args.cond) ? args.then : args.else ?? []); },
  });
}
