import { Value } from '@sinclair/typebox/value';
import { FilmSchema } from '../../engine/data/schema/film';
import type { Film } from '../../engine/data/schema/film';
import { ConditionSchema, CommandSchema } from '../../engine/data/schema/events';
import type { ValidatedPack } from '../../engine/data/validator/types';
import { validatePack } from '../../engine/data/validator/validate';
import { Game } from '../../engine/sim/Game';
import { Collision } from '../../engine/sim/world/Collision';
import type { PluginRuntime } from '../../engine/sim/plugins/PluginRuntime';
import { FsSource } from '../fsSource';
import { nodePluginRuntime } from '../loadPlugins';
import { FilmSession } from '../../engine/film/session';
import type { TimelineEvent } from '../../engine/film/timeline';
export const filmId = (id: string): boolean => /^[a-z][a-z0-9_]*$/.test(id);
export function asFilm(value: unknown): Film {
  if (!Value.Check(FilmSchema, [ConditionSchema, CommandSchema], value)) throw new Error('Invalid film schema');
  return value;
}
export async function filmFiles(source: FsSource): Promise<string[]> { return (await source.listFiles()).filter(file => /^films\/[^/]+\.film\.json$/.test(file)).sort(); }
export async function prepareFilm(packId: string, id: string) {
  if (!filmId(packId) || !filmId(id)) throw new Error('Invalid pack/film id');
  const source = new FsSource(`packs/${packId}`), plugins = await nodePluginRuntime(source, `packs/${packId}`);
  const result = await validatePack(source, packId, plugins.validationOptions);
  if (!result.pack) throw new Error(result.diagnostics.map(d => `${d.code} ${d.file}${d.pointer}: ${d.message}`).join('\n'));
  return { pack: result.pack, plugins, film: asFilm(await source.readJson(`films/${id}.film.json`)) };
}
export async function rehearse(pack: ValidatedPack, film: Film, plugins: PluginRuntime) {
  const start = film.start ?? pack.game.start;
  const data = pack.maps.get(start.map);
  if (!data || !new Collision(data).passable(start.x, start.y)) throw new Error('Invalid film start');
  const game = new Game({ ...pack.game, start, state: {
    flags: { ...pack.game.state.flags, ...film.state?.flags }, vars: { ...pack.game.state.vars, ...film.state?.vars },
  } }, data, pack.characters, pack.events.get(start.map)!, {
    plugins, skin: pack.skin, commonEvents: pack.common, save: () => {},
    mapLoader: { load: id => { const data = pack.maps.get(id), events = pack.events.get(id); return data && events ? Promise.resolve({ data, events }) : Promise.reject(new Error(`Unknown map: ${id}`)); } },
  });
  const session = new FilmSession(game, film), events: TimelineEvent[] = [];
  while (await session.tick()) events.push(...session.events());
  events.push(...session.events());
  return { ticks: session.driver.ticks, events, game };
}
