import { Type } from '@sinclair/typebox';
import { Id, objectOptions } from '../../data/schema/primitives';
import type { CommandRegistry } from '../event/CommandRegistry';
export const args = Type.Object({ troop: Id, resultVar: Id }, objectOptions);
export function registerBattle(registry: CommandRegistry): void {
  registry.register('battle', { args, parallelSafe: false, run: function* (args, ctx) {
    const scene = ctx.openScene('battle', { troop: args.troop });
    yield ctx.waitUntil(() => scene.done);
    ctx.state.setVar(args.resultVar, scene.value!);
    if (scene.value === 1 && !ctx.canLose(args.troop)) {
      const ending = ctx.openScene('ending', { title: ctx.gameOverLabel(), lines: [] });
      yield ctx.waitUntil(() => ending.done);
      ctx.stop();
    }
  } });
}
