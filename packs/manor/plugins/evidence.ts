import { Type } from '@sinclair/typebox';
import type { PluginModule, ReadonlyGameState } from '@engine/api';

// The clue flags are the source of truth; revisiting evidence never inflates a counter.
const clues = ["clue_clock", "clue_seal", "clue_letter", "clue_ledger", "clue_receipt"] as const;
const count = (state: Pick<ReadonlyGameState, 'getFlag'>) => clues.reduce((total, flag) => total + (state.getFlag(flag) ? 1 : 0), 0);
const plugin: PluginModule = {
  apiVersion: 1,
  id: 'evidence',
  register(api) {
    api.conditions.register('x_enough_clues', {
      args: Type.Object({ minimum: Type.Integer({ minimum: 0, maximum: 5 }) }, { additionalProperties: false }),
      test: (args, state) => count(state) >= args.minimum,
    });
    api.text.register('x_clue_count', {
      args: Type.Object({}, { additionalProperties: false }),
      format: (_args, state) => String(count(state)),
    });
  },
};
export default plugin;
