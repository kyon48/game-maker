import type { TileMapData } from '../../data/loader/tiled';
import type { EventDefinition } from '../../data/game';
export interface LoadedMap { readonly data: TileMapData; readonly events: readonly EventDefinition[] }
/** Resolves only after platform assets are ready; no browser objects cross this port. */
export interface MapLoader { load(id: string): Promise<LoadedMap> }
