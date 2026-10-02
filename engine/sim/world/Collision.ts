import type { TileMapData } from '../../data/loader/tiled';
import { tileGid } from '../../data/loader/tiled';
export class Collision {
  private readonly blocked: Uint8Array;
  constructor(private readonly map: TileMapData) {
    this.blocked = new Uint8Array(map.width * map.height);
    for (const layer of map.layers) if (layer.type === 'tilelayer' && layer.name === 'collision') {
      for (let index = 0; index < layer.data.length; index++) if (tileGid(layer.data[index] ?? 0)) this.blocked[index] = 1;
    }
  }
  inBounds(x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0
      && x < this.map.width && y < this.map.height;
  }
  passable(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.blocked[y * this.map.width + x] === 0;
  }
}
