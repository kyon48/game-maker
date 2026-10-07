import type { GameConfig, EventDefinition } from '../../data/game';
import type { Dir } from '../entity/Character';
import { directions } from '../entity/Character';
import type { TileMapData } from '../../data/loader/tiled';
import { Collision } from '../world/Collision';
import { migrateSave, SAVE_VERSION, saveMigrations } from './saveMigrations';
import type { SaveMigration } from './saveMigrations';
export type PersistentState = Pick<import('../../data/saveData').SaveData, 'map' | 'x' | 'y' | 'dir' | 'flags' | 'vars' | 'selfFlags'>;
export interface SaveCandidate { data: Record<string, unknown> | null; warnings: string[]; fromGameVersion?: string }
export interface LoadedSave { state: PersistentState | null; fromGameVersion: string; warnings: string[] }
export interface LoadOptions {
  version?: number; migrations?: readonly SaveMigration[];
  loadSave?: (state: PersistentState, fromGameVersion: string) => PersistentState;
}
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
/** §11.3(1–2). Reports warnings as data; clocks, IO and logging stay outside sim. */
export function readSave(raw: string | null, packId: string, options: LoadOptions = {}): SaveCandidate {
  if (raw === null) return { data: null, warnings: [] };
  let data: Record<string, unknown>;
  try { data = record(JSON.parse(raw)); } catch { return { data: null, warnings: [] }; }
  if (data.packId !== packId) return { data: null, warnings: [] };
  const fromGameVersion = typeof data.gameVersion === 'string' ? data.gameVersion : '';
  const version = options.version ?? SAVE_VERSION;
  if (!Number.isSafeInteger(data.saveVersion) || (data.saveVersion as number) < 0) return { data: null, warnings: ['Invalid saveVersion'] };
  if ((data.saveVersion as number) > version) return { data: null, warnings: ['Save version is newer than this engine'] };
  if ((data.saveVersion as number) < version) data = migrateSave(data, version, options.migrations ?? saveMigrations);
  return { data, warnings: [], fromGameVersion };
}
/** §11.3(3–6), after platform has loaded the candidate map needed for collision checks. */
export function restoreSave(candidate: SaveCandidate, game: GameConfig, events: ReadonlyMap<string, readonly EventDefinition[]>, maps: ReadonlyMap<string, TileMapData>, options: LoadOptions = {}): LoadedSave {
  const warnings = [...candidate.warnings], data = candidate.data;
  if (!data) return { state: null, fromGameVersion: '', warnings };
  const flags: Record<string, boolean> = {}, vars: Record<string, number> = {};
  const savedFlags = record(data.flags), savedVars = record(data.vars);
  for (const [name, initial] of Object.entries(game.state.flags)) flags[name] = typeof savedFlags[name] === 'boolean' ? savedFlags[name] as boolean : initial;
  for (const [name, initial] of Object.entries(game.state.vars)) vars[name] = Number.isSafeInteger(savedVars[name]) ? savedVars[name] as number : initial;
  for (const name of Object.keys(savedFlags)) if (!Object.hasOwn(game.state.flags, name)) warnings.push(`Dropped undeclared flag: ${name}`);
  for (const name of Object.keys(savedVars)) if (!Object.hasOwn(game.state.vars, name)) warnings.push(`Dropped undeclared variable: ${name}`);
  const selfFlags: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(record(data.selfFlags))) {
    const parts = key.split(':'), [map, event, name] = parts;
    if (parts.length === 3 && map && event && name && /^[a-z][a-z0-9_]*$/.test(name) && game.maps.includes(map) && events.get(map)?.some(object => object.id === event) && typeof value === 'boolean') selfFlags[key] = value;
  }
  let position = { map: game.start.map, x: game.start.x, y: game.start.y, dir: game.start.dir };
  const map = typeof data.map === 'string' && game.maps.includes(data.map) ? maps.get(data.map) : undefined;
  if (map && Number.isSafeInteger(data.x) && Number.isSafeInteger(data.y) && new Collision(map).passable(data.x as number, data.y as number)) {
    position = { map: data.map as string, x: data.x as number, y: data.y as number, dir: directions.includes(data.dir as Dir) ? data.dir as Dir : game.start.dir };
  }
  const fromGameVersion = candidate.fromGameVersion ?? (typeof data.gameVersion === 'string' ? data.gameVersion : '');
  let state: PersistentState = { ...position, flags, vars, selfFlags };
  if (options.loadSave) {
    const changed = options.loadSave(state, fromGameVersion);
    // Repeat steps 3–5 only; a hook must never run recursively.
    const normalized = restoreSave({ data: { ...changed }, warnings: [], fromGameVersion }, game, events, maps);
    state = normalized.state!; warnings.push(...normalized.warnings);
  }
  return { state, fromGameVersion, warnings };
}
export function loadSave(raw: string | null, game: GameConfig, events: ReadonlyMap<string, readonly EventDefinition[]>, maps: ReadonlyMap<string, TileMapData>, options: LoadOptions = {}): LoadedSave {
  return restoreSave(readSave(raw, game.id, options), game, events, maps, options);
}
