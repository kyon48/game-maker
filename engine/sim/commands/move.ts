import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export function registerMove(registry: CommandRegistry): void {
  registry.register('move', {
    args: Type.Object({ target: Type.String(), route: Type.Array(Type.String({ pattern: '^(up|down|left|right|face:(up|down|left|right)|wait:[1-9][0-9]*)$' })), wait: Type.Optional(Type.Boolean()) }, { additionalProperties: false }),
    parallelSafe: true,
    *run(args, ctx) {
      for (const token of args.route) if (token.startsWith('wait:') && !Number.isSafeInteger(Number(token.slice(5)))) throw new Error('Unsafe route wait');
      const route = ctx.move(args.target, args.route);
      if (args.wait && !route.done) yield ctx.waitUntil(() => route.done);
    },
  });
}
