import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
import type { Condition, Command } from '../../data/events';
export function registerChoice(registry: CommandRegistry): void {
  registry.register('choice', {
    args: Type.Object({ prompt: Type.Optional(Type.String()),
      options: Type.Array(Type.Object({ label: Type.String({ minLength: 1 }), when: Type.Optional(Type.Unknown()),
        commands: Type.Array(Type.Unknown()) }, { additionalProperties: false }), { minItems: 1, maxItems: 6 }),
      cancel: Type.Optional(Type.Union([Type.Null(), Type.Integer({ minimum: 0 })])) }, { additionalProperties: false }),
    parallelSafe: false,
    *run(args, ctx) {
      const cancelIndex = args.cancel ?? null;
      if (cancelIndex !== null && cancelIndex >= args.options.length) throw new Error('Choice cancel index out of range');
      const labels = args.options.map(option => option.when === undefined || ctx.evaluate(option.when as Condition) ? option.label : null);
      if (labels.every(label => label === null)) return;
      const index = yield* ctx.showChoice({ prompt: args.prompt, labels, cancelIndex });
      const chosen = args.options[index];
      if (chosen) yield* ctx.runCommands(chosen.commands as Command[]);
    },
  });
}
