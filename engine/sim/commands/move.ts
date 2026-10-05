import { Id } from '../../data/schema/primitives';
import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export const argsSchema = Type.Object({ target: Id, route: Type.Array(Type.String({ pattern: '^(up|down|left|right|face:(up|down|left|right)|wait:[1-9][0-9]*)$' })), wait: Type.Optional(Type.Boolean()) }, { additionalProperties: false });
export function registerMove(registry: CommandRegistry): void {
  registry.register('move', {
    args: argsSchema,
    parallelSafe: true,
    *run(args, ctx) {
      const route = ctx.move(args.target, args.route);
      if (args.wait && !route.done) yield ctx.waitUntil(() => route.done);
    },
  });
}
