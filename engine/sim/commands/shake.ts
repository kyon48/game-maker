import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export const argsSchema = Type.Object({ power: Type.Optional(Type.Number({ minimum: 0 })), frames: Type.Optional(Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })), wait: Type.Optional(Type.Boolean()) }, { additionalProperties: false });
export function registerShake(registry: CommandRegistry): void {
  registry.register('shake', {
    args: argsSchema,
    parallelSafe: true,
    *run(args, ctx) { const effect = ctx.shake(args.power ?? 4, args.frames ?? 30); if (args.wait) yield ctx.waitUntil(() => effect.done); },
  });
}
