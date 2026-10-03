import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export function registerSetSelfFlag(registry: CommandRegistry): void {
  registry.register('set_self_flag', {
    args: Type.Object({ name: Type.String(), value: Type.Boolean() }, { additionalProperties: false }),
    parallelSafe: true,
    run(args, ctx) {
      if (!ctx.thisEvent) throw new Error('Self flag requires an event');
      ctx.state.setSelf(ctx.thisEvent.mapId, ctx.thisEvent.id, args.name, args.value);
    },
  });
}
