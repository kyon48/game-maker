import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export const argsSchema = Type.Object({}, { additionalProperties: false });
export function registerShowMapName(registry: CommandRegistry): void {
  registry.register('show_map_name', { args: argsSchema, parallelSafe: true, run(_args, ctx) { ctx.showMapName(); } });
}
