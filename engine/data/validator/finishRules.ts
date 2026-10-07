import { ScenarioSchema } from '../schema/scenario';
import { escapePointer } from './context';
import type { ValidationContext, Usage } from './context';
import type { PackBasics } from './coreRules';
export async function finishRules(context: ValidationContext, basics: PackBasics, usage: Usage): Promise<void> {
  const { report, source, read } = context;
  const { game, characters, common } = basics;
  const { usedCharacters, usedCommon, usedFlags, usedVars } = usage;
  for (const [kind, declared, used] of [['characters', characters, usedCharacters], ['common-events', common, usedCommon], ['flags', game.state.flags, usedFlags], ['vars', game.state.vars, usedVars]] as const) {
    for (const key of Object.keys(declared)) if (!used.has(key)) report('V11', kind === 'flags' || kind === 'vars' ? 'game.json' : `${kind}.json`, kind === 'flags' || kind === 'vars' ? `/state/${kind}/${escapePointer(key)}` : `/${escapePointer(key)}`, `Unused ${kind}: ${key}`);
  }
  if (source.listFiles) for (const file of await source.listFiles()) {
    if (/^tests\/.*\.scenario\.json$/.test(file)) await read(file, ScenarioSchema);
    if (/^maps\/[^/]+\.tmj$/.test(file) && !game.maps.includes(file.slice(5, -4))) report('V11', file, '', 'Map not listed in game.maps');
  }
}
