import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export function registerStop(registry: CommandRegistry): void {
  registry.register('stop', {
    args: Type.Object({  }, { additionalProperties: false }),
    parallelSafe: true,
    run(_args, ctx) { ctx.stop(); },
  });
}
