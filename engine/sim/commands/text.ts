import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export function registerText(registry: CommandRegistry): void {
  registry.register('text', {
    args: Type.Object({ text: Type.String({ minLength: 1 }), speaker: Type.Optional(Type.String()) }, { additionalProperties: false }),
    parallelSafe: false,
    *run(args, ctx) { yield* ctx.showText(args); },
  });
}
