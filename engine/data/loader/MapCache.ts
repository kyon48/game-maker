import type { PackSource } from '@engine/api';
import type { EventDefinition } from '../game';
import { loadTiled } from './tiled';
export class MapCache {
  private readonly cache = new Map<string, ReturnType<typeof loadTiled>>();
  constructor(private readonly source: PackSource, private readonly tileSize: number,
    readonly events: ReadonlyMap<string, readonly EventDefinition[]>) {}
  load(id: string): ReturnType<typeof loadTiled> {
    if (!this.events.has(id)) return Promise.reject(new Error(`Unknown map: ${id}`));
    let result = this.cache.get(id);
    if (!result) {
      result = loadTiled(this.source, `maps/${id}.tmj`, this.tileSize);
      this.cache.set(id, result);
      void result.catch(() => this.cache.delete(id));
    }
    return result;
  }
}
