import type { EventDefinition } from '../game';
import { EventsSchema } from '../schema/events';
import { TiledSchema, TilesetSchema } from '../schema/tiled';
import { ID_PATTERN } from '../schema/primitives';
import { loadTiled, tileGid } from '../loader/tiled';
import type { TileMapData } from '../loader/tiled';
import { packPath } from '../loader/path';
import { escapePointer } from './context';
import type { ValidationContext } from './context';
import type { PackBasics } from './coreRules';
export async function mapRules(context: ValidationContext, basics: PackBasics) {
  const { source, read, report, readJson } = context;
  const { game, characters, skin } = basics;
  const events = new Map<string, EventDefinition[]>(), maps = new Map<string, TileMapData>();
  const asset = async (path: string, file: string, pointer: string, owner = 'game.json') => {
    try {
      const resolved = packPath(owner, path);
      if (!await source.exists(resolved)) report('V4', file, pointer, `Missing asset: ${resolved}`);
    } catch (error) { report('V4', file, pointer, String(error)); }
  };
  for (const [name, graphic] of Object.entries(characters)) if (graphic.sheet) await asset(graphic.sheet, 'characters.json', `/${escapePointer(name)}/sheet`);
  await asset(skin.font.src, 'skin.json', '/font/src');
  if (skin.window.image) await asset(skin.window.image, 'skin.json', '/window/image');
  for (let index = 0; index < game.maps.length; index++) {
    const mapId = game.maps[index]!, path = `maps/${mapId}.tmj`, eventFile = `maps/${mapId}.events.json`;
    for (const file of [path, eventFile]) if (!await source.exists(file)) report('V3', 'game.json', `/maps/${index}`, `Missing map file: ${file}`);
    const raw = await read(path, TiledSchema) as { tilesets: ({ firstgid: number; source?: string; image?: string })[] } | undefined;
    const eventData = await read(eventFile, EventsSchema) as { events: EventDefinition[] } | undefined;
    if (eventData) events.set(mapId, eventData.events);
    if (!raw) continue;
    // Resolve tileset paths independently, so missing images and .tsj report V4.
    for (let i = 0; i < raw.tilesets.length; i++) {
      const set = raw.tilesets[i]!, pointer = `/tilesets/${i}`;
      if (set.source !== undefined) {
        try {
          const owner = packPath(path, set.source);
          if (!await source.exists(owner)) { report('V4', path, pointer + '/source', `Missing tileset: ${owner}`); continue; }
          const external = await read(owner, TilesetSchema) as { image: string } | undefined;
          if (external) await asset(external.image, owner, '/image', owner);
        } catch (error) { report('V4', path, pointer + '/source', String(error)); }
      } else if (set.image !== undefined) await asset(set.image, path, pointer + '/image', path);
    }
    try {
      const map = await loadTiled({ readJson, exists: path => source.exists(path) }, path, game.tileSize); maps.set(mapId, map);
      for (const [li, layer] of map.layers.entries()) if (layer.type === 'objectgroup' && layer.name === 'markers') {
        for (const [oi, point] of layer.objects.entries()) if (!new RegExp(ID_PATTERN).test(point.name)) report('V5', path, `/layers/${li}/objects/${oi}/name`, 'Invalid marker id');
      }
      const bounds = (x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height;
      const ids = new Set<string>();
      for (let i = 0; i < (eventData?.events.length ?? 0); i++) {
        const event = eventData!.events[i]!;
        if (ids.has(event.id)) report('V5', eventFile, `/events/${i}/id`, 'Duplicate event id'); ids.add(event.id);
        if (!bounds(event.x, event.y)) report('V5', eventFile, `/events/${i}`, 'Event outside map');
      }
      for (let li = 0; li < map.layers.length; li++) {
        const layer = map.layers[li]!;
        if (layer.type === 'tilelayer') for (let i = 0; i < layer.data.length; i++) {
          const gid = tileGid(layer.data[i]!); if (gid !== 0 && !map.tileLookup.has(gid)) report('V5', path, `/layers/${li}/data/${i}`, 'GID outside tileset range');
        }
      }
    } catch (error) { report('V5', path, '', String(error)); }
  }
  function arrival(mapId: string, x: number, y: number, file: string, pointer: string) {
    const map = maps.get(mapId); if (!map) return;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) { report('V6', file, pointer, 'Arrival outside map'); return; }
    for (const layer of map.layers) if (layer.type === 'tilelayer' && layer.name === 'collision' && tileGid(layer.data[y * map.width + x] ?? 0) !== 0) report('V6', file, pointer, 'Arrival on collision');
  }
  if (!game.maps.includes(game.start.map)) report('V3', 'game.json', '/start/map', 'Unknown start map');
  else arrival(game.start.map, game.start.x, game.start.y, 'game.json', '/start');
  return { events, maps, arrival };
}
export type MapChecks = Awaited<ReturnType<typeof mapRules>>;
