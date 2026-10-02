import type { TileMapData } from '../../data/loader/tiled';
import { tileGid } from '../../data/loader/tiled';
import type { Point } from '../../sim/world/Camera';
export function drawTileMap(context: CanvasRenderingContext2D, map: TileMapData,
  images: ReadonlyMap<string, CanvasImageSource>, view: Point, pass: 'below' | 'over'): void {
  context.imageSmoothingEnabled = false;
  for (const layer of map.layers) {
    if (layer.type !== 'tilelayer' || layer.name === 'collision' || layer.visible === false
      || layer.name.startsWith('over_') !== (pass === 'over')) continue;
    context.save(); context.globalAlpha = layer.opacity ?? 1;
    for (let index = 0; index < layer.data.length; index++) {
      const gid = tileGid(layer.data[index] ?? 0); if (!gid) continue;
      const set = [...map.tilesets].reverse().find(set => set.firstgid <= gid);
      if (!set || gid >= set.firstgid + set.tilecount) throw new Error(`Unknown tile GID: ${gid}`);
      const image = images.get(set.image); if (!image) throw new Error(`Missing tileset image: ${set.image}`);
      const tile = gid - set.firstgid, spacing = set.spacing ?? 0, margin = set.margin ?? 0;
      const x = Math.round(((index % layer.width) + (layer.x ?? 0)) * map.tilewidth + (layer.offsetx ?? 0) - view.x);
      const y = Math.round((Math.floor(index / layer.width) + (layer.y ?? 0)) * map.tileheight + (layer.offsety ?? 0) - view.y);
      if (x + map.tilewidth <= 0 || y + map.tileheight <= 0 || x >= context.canvas.width || y >= context.canvas.height) continue;
      context.drawImage(image, margin + (tile % set.columns) * (set.tilewidth + spacing),
        margin + Math.floor(tile / set.columns) * (set.tileheight + spacing), set.tilewidth, set.tileheight,
        x, y, map.tilewidth, map.tileheight);
    }
    context.restore();
  }
}
