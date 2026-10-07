import { Game } from '../engine/sim/Game';
import type { ScenarioFactory } from '../engine/data/scenarios/run';
import { Collision } from '../engine/sim/world/Collision';
export function scenarioGameWithPlugins(plugins?: import('../engine/sim/plugins/PluginRuntime').PluginRuntime): ScenarioFactory { return (pack, start, state) => {
  const data = pack.maps.get(start.map);
  if (!data || !new Collision(data).passable(start.x, start.y)) throw new Error('Invalid scenario start');
  const game = new Game({ ...pack.game, start, state }, data, pack.characters, pack.events.get(start.map)!, {
    plugins, save: () => {}, skin: pack.skin, commonEvents: pack.common,
    mapLoader: { load: async id => { const data = pack.maps.get(id), events = pack.events.get(id); if (!data || !events) throw new Error(`Unknown map: ${id}`); return { data, events }; } },
  });
  return game;
}; }
export const scenarioGame = scenarioGameWithPlugins();
