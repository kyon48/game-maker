import type { TileMapData } from '../../data/loader/tiled';
import { tileGid } from '../../data/loader/tiled';
import type { Point } from '../../sim/world/Camera';
export function drawTileMap(context: CanvasRenderingContext2D, map: TileMapData,
  images: ReadonlyMap<string, CanvasImageSource>, view: Point, pass: 'below' | 'over'): void {
  context.imageSmoothingEnabled = false;
  for (const layer of map.layers) {
    if (layer.type !== 'tilelayer' || layer.name === 'collision' || layer.visible === false
      || layer.name.startsWith('over_') !== (pass === 'over')) continue;
    const originX = (layer.x ?? 0) * map.tilewidth + (layer.offsetx ?? 0);
    const originY = (layer.y ?? 0) * map.tileheight + (layer.offsety ?? 0);
    const left = Math.max(0, Math.floor((view.x - originX) / map.tilewidth));
    const top = Math.max(0, Math.floor((view.y - originY) / map.tileheight));
    const right = Math.min(layer.width, Math.ceil((view.x + context.canvas.width - originX) / map.tilewidth));
    const bottom = Math.min(layer.height, Math.ceil((view.y + context.canvas.height - originY) / map.tileheight));
    context.save(); context.globalAlpha = layer.opacity ?? 1;
    for (let row = top; row < bottom; row++) for (let column = left; column < right; column++) {
      const gid = tileGid(layer.data[row * layer.width + column] ?? 0);
      if (!gid) continue;
      const tile = map.tileLookup.get(gid);
      if (!tile) throw new Error(`Unknown tile GID: ${gid}`);
      const set = tile.tileset;
      const image = images.get(set.image);
      if (!image) throw new Error(`Missing tileset image: ${set.image}`);
      context.drawImage(image, tile.sourceX, tile.sourceY, set.tilewidth, set.tileheight,
        Math.floor(column * map.tilewidth + originX) - view.x,
        Math.floor(row * map.tileheight + originY) - view.y, map.tilewidth, map.tileheight);
    }
    context.restore();
  }
}
