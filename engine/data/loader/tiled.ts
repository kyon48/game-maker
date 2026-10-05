import type { Static } from '@sinclair/typebox';
import type { TilesetSchema, TiledSchema, TileLayerSchema, ObjectLayerSchema } from '../schema/tiled';
import type { PackSource } from '@engine/api';
import { packPath } from './path';
export type Tileset = Static<typeof TilesetSchema> & { firstgid: number };
export type TileLayer = Static<typeof TileLayerSchema>;
type ObjectLayer = Static<typeof ObjectLayerSchema>;
export interface TileReference {
  readonly tileset: Tileset; readonly sourceX: number; readonly sourceY: number;
}
export interface TileMapData {
  width: number; height: number; tilewidth: number; tileheight: number;
  layers: (TileLayer | ObjectLayer)[]; tilesets: Tileset[];
  tileLookup: ReadonlyMap<number, TileReference>;
}
type RawMap = Static<typeof TiledSchema>;
export const tileGid = (gid: number): number => (gid >>> 0) & 0x0fffffff;
export async function loadTiled(source: PackSource, path: string, tileSize: number): Promise<TileMapData> {
  const raw = await source.readJson(path) as RawMap;
  if (raw.orientation !== 'orthogonal' || raw.infinite !== false || raw.tilewidth !== tileSize || raw.tileheight !== tileSize
    || !Number.isInteger(raw.width) || raw.width <= 0 || !Number.isInteger(raw.height) || raw.height <= 0
    || !Array.isArray(raw.layers) || !Array.isArray(raw.tilesets)) throw new Error(`Unsupported Tiled map: ${path}`);
  for (const layer of raw.layers) {
    if (layer.type === 'tilelayer') {
      if (layer.width !== raw.width || layer.height !== raw.height || !Array.isArray(layer.data)
        || layer.data.length !== layer.width * layer.height || !layer.data.every(gid => Number.isInteger(gid) && gid >= 0 && gid <= 0xffffffff))
        throw new Error(`Invalid tilelayer: ${path}/${layer.name}`);
    } else if (layer.type !== 'objectgroup') throw new Error(`Unsupported layer: ${path}`);
    else if (layer.name === 'markers') {
      const names = new Set<string>();
      for (const object of layer.objects) {
        if (object.point !== true || names.has(object.name)) throw new Error(`Invalid marker: ${path}/${object.name}`);
        names.add(object.name);
      }
    }
  }
  const tilesets = await Promise.all(raw.tilesets.map(async entry => {
    const owner = 'source' in entry ? packPath(path, entry.source) : path;
    const set = 'source' in entry ? await source.readJson(owner) as Tileset : entry;
    if (!Number.isInteger(entry.firstgid) || entry.firstgid < 1 || set.tilewidth !== tileSize || set.tileheight !== tileSize
      || !Number.isInteger(set.columns) || set.columns < 1 || !Number.isInteger(set.tilecount) || set.tilecount < 1)
      throw new Error(`Invalid tileset: ${owner}`);
    return { ...set, firstgid: entry.firstgid, image: packPath(owner, set.image) };
  }));
  tilesets.sort((a, b) => a.firstgid - b.firstgid);
  const tileLookup = new Map<number, TileReference>();
  for (const set of tilesets) {
    if (set.firstgid + set.tilecount - 1 > 0x0fffffff) throw new Error(`Invalid tileset range: ${path}`);
    const spacing = set.spacing ?? 0, margin = set.margin ?? 0;
    for (let tile = 0; tile < set.tilecount; tile++) {
      const gid = set.firstgid + tile;
      if (tileLookup.has(gid)) throw new Error(`Overlapping tilesets: ${path}`);
      tileLookup.set(gid, { tileset: set,
        sourceX: margin + (tile % set.columns) * (set.tilewidth + spacing),
        sourceY: margin + Math.floor(tile / set.columns) * (set.tileheight + spacing) });
    }
  }
  return { ...raw, layers: raw.layers.filter(layer => layer.type !== 'group'), tilesets, tileLookup };
}
export function markers(map: TileMapData): ReadonlyMap<string, { x: number; y: number }> {
  const points = new Map<string, { x: number; y: number }>();
  for (const layer of map.layers) if (layer.type === 'objectgroup' && layer.name === 'markers')
    for (const object of layer.objects) points.set(object.name, { x: Math.floor(object.x / map.tilewidth), y: Math.floor(object.y / map.tileheight) });
  return points;
}
