import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export const argsSchema = Type.Object({  }, { additionalProperties: false });
export function registerStop(registry: CommandRegistry): void {
  registry.register('stop', {
    args: argsSchema,
    parallelSafe: true,
    run(_args, ctx) { ctx.stop(); },
  });
}
