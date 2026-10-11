import { Type } from '@sinclair/typebox';
import { Id, objectOptions } from '../../data/schema/primitives';
import type { CommandRegistry } from '../event/CommandRegistry';
export const args = Type.Object({ name: Type.String(), args: Type.Optional(Type.Record(Type.String(), Type.Unknown())), resultVar: Type.Optional(Id) }, objectOptions);
export function registerScene(registry: CommandRegistry): void {
  registry.register('scene', { args, parallelSafe: false, run: function* (args, ctx) {
    const scene = ctx.openScene(args.name, args.args);
    yield ctx.waitUntil(() => scene.done);
    if (args.resultVar) ctx.state.setVar(args.resultVar, scene.value!);
  } });
}
