import { Type } from '@sinclair/typebox';
import { Id, objectOptions } from '../../data/schema/primitives';
import type { CommandRegistry } from '../event/CommandRegistry';
export function registerSfx(registry: CommandRegistry): void {
  registry.register('sfx', { args: Type.Object({ id: Id }, objectOptions), parallelSafe: true, run: (args, ctx) => { ctx.sfx(args.id); } });
}
