import type { CharacterSnapshot } from '../../sim/entity/Character';
import type { Point } from '../../sim/world/Camera';

export function drawCharacters(context: CanvasRenderingContext2D, characters: readonly CharacterSnapshot[],
  images: ReadonlyMap<string, CanvasImageSource>, tileSize: number, view: Point): void {
  context.imageSmoothingEnabled = false;
  for (const character of characters) {
    if (!character.active || !character.visible || !character.graphic) continue;
    const graphic = character.graphic;
    const centerX = Math.floor(character.pixelX + tileSize / 2) - view.x;
    const bottomY = Math.floor(character.pixelY + tileSize) - view.y;
    if (graphic.sheet !== undefined) {
      const image = images.get(graphic.sheet);
      if (!image) throw new Error(`Missing character sheet: ${graphic.sheet}`);
      context.drawImage(image, character.frame * graphic.frameWidth, graphic.rows![character.dir] * graphic.frameHeight,
        graphic.frameWidth, graphic.frameHeight, centerX - Math.floor(graphic.frameWidth / 2),
        bottomY - graphic.frameHeight, graphic.frameWidth, graphic.frameHeight);
    } else {
      context.fillStyle = graphic.placeholder;
      context.fillRect(centerX - tileSize / 2, bottomY - tileSize, tileSize, tileSize);
      const centerY = bottomY - tileSize / 2;
      const dx = character.dir === 'left' ? -1 : character.dir === 'right' ? 1 : 0;
      const dy = character.dir === 'up' ? -1 : character.dir === 'down' ? 1 : 0;
      const tip = Math.max(2, Math.floor(tileSize / 3)), base = Math.max(1, Math.floor(tileSize / 6));
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.moveTo(centerX + dx * tip, centerY + dy * tip);
      context.lineTo(centerX - dx * base - dy * base, centerY - dy * base + dx * base);
      context.lineTo(centerX - dx * base + dy * base, centerY - dy * base - dx * base);
      context.closePath(); context.fill();
    }
  }
}
