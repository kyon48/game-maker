import { Text } from '../../data/schema/primitives';
import { CommandRef, ConditionRef } from '../../data/schema/events';
import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export const argsSchema = Type.Object({ prompt: Type.Optional(Type.String()),
      options: Type.Array(Type.Object({ label: Text, when: Type.Optional(ConditionRef),
        commands: Type.Array(CommandRef) }, { additionalProperties: false }), { minItems: 1, maxItems: 6 }),
      cancel: Type.Optional(Type.Union([Type.Null(), Type.Integer({ minimum: 0 })])) }, { additionalProperties: false });
export function registerChoice(registry: CommandRegistry): void {
  registry.register('choice', {
    args: argsSchema,
    parallelSafe: false,
    *run(args, ctx) {
      const cancelIndex = args.cancel ?? null;
      const labels = args.options.map(option => option.when === undefined || ctx.evaluate(option.when) ? option.label : null);
      if (labels.every(label => label === null)) return;
      const index = yield* ctx.showChoice({ prompt: args.prompt, labels, cancelIndex });
      const chosen = args.options[index];
      if (chosen) yield* ctx.runCommands(chosen.commands);
    },
  });
}
