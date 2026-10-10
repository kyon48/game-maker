import { Text } from '../../data/schema/primitives';
import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export const argsSchema = Type.Object({ text: Text, speaker: Type.Optional(Type.String()) }, { additionalProperties: false });
export function registerText(registry: CommandRegistry): void {
  registry.register('text', {
    args: argsSchema,
    parallelSafe: false,
    *run(args, ctx) { yield* ctx.showText(args, 'command'); },
  });
}
