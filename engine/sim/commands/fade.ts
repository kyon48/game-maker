import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export function registerFade(registry: CommandRegistry): void {
  registry.register('fade', {
    args: Type.Object({ to: Type.Union([Type.Literal('black'), Type.Literal('clear')]), frames: Type.Optional(Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })), wait: Type.Optional(Type.Boolean()) }, { additionalProperties: false }),
    parallelSafe: true,
    *run(args, ctx) { const effect = ctx.fade(args.to, args.frames ?? 30); if (args.wait !== false) yield ctx.waitUntil(() => effect.done); },
  });
}
