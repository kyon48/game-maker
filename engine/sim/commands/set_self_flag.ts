import { Id } from '../../data/schema/primitives';
import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export const argsSchema = Type.Object({ name: Id, value: Type.Boolean() }, { additionalProperties: false });
export function registerSetSelfFlag(registry: CommandRegistry): void {
  registry.register('set_self_flag', {
    args: argsSchema,
    parallelSafe: true,
    run(args, ctx) {
      if (!ctx.thisEvent) throw new Error('Self flag requires an event');
      ctx.state.setSelf(ctx.thisEvent.mapId, ctx.thisEvent.id, args.name, args.value);
    },
  });
}
