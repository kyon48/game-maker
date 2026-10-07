import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export const argsSchema = Type.Object({}, { additionalProperties: false });
export function registerSave(registry: CommandRegistry): void {
  registry.register('save', { args: argsSchema, parallelSafe: false, run(_args, ctx) { ctx.save(); } });
}
