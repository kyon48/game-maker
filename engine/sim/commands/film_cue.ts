import { Type } from '@sinclair/typebox';
import { Id, objectOptions } from '../../data/schema/primitives';
import type { CommandRegistry } from '../event/CommandRegistry';
export const argsSchema = Type.Object({ id: Id }, objectOptions);
export function registerFilmCue(registry: CommandRegistry): void {
  registry.register('film_cue', { args: argsSchema, parallelSafe: false, *run(args, ctx) {
    if (!ctx.filmCues) return;
    ctx.filmCues.enter(args.id);
    try { yield ctx.waitUntil(() => !ctx.filmCues!.waiting(args.id)); }
    finally { ctx.filmCues.cancel(args.id); }
  } });
}
