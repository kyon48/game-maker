import { Type } from '@sinclair/typebox';
import { Id, Positive, objectOptions } from '../../data/schema/primitives';
import type { CommandRegistry } from '../event/CommandRegistry';
export const args = Type.Object({ item: Id, count: Type.Optional(Positive), notify: Type.Optional(Type.Boolean()) }, objectOptions);
export function registerGiveItem(registry: CommandRegistry): void {
  registry.register('give_item', { args, parallelSafe: false, run: function* (args, ctx) {
    const count = args.count ?? 1;
    ctx.state.setItem(args.item, ctx.state.getItem(args.item) + count);
    if (args.notify !== false) yield* ctx.showText({ text: ctx.itemNotice(args.item, count) }, 'command');
  } });
}
