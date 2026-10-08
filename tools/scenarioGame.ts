import { GameSession } from '../engine/sim/state/GameSession';
import type { ScenarioFactory } from '../engine/data/scenarios/run';
export function scenarioGameWithPlugins(plugins?: import('../engine/sim/plugins/PluginRuntime').PluginRuntime): ScenarioFactory {
  return (pack, start, state) => new GameSession(pack, { plugins }, start, state);
}
export const scenarioGame = scenarioGameWithPlugins();
