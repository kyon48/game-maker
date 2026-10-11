import { Type } from '@sinclair/typebox';
import { Id, Positive, objectOptions } from '../../data/schema/primitives';
import type { CommandRegistry } from '../event/CommandRegistry';
export const args = Type.Object({ item: Id, count: Type.Optional(Positive) }, objectOptions);
export function registerTakeItem(registry: CommandRegistry): void {
  registry.register('take_item', { args, parallelSafe: true, run(args, ctx) {
    ctx.state.setItem(args.item, Math.max(0, ctx.state.getItem(args.item) - (args.count ?? 1)));
  } });
}
