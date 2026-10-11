import type { DrawList } from '../../data/scenes';
import type { Skin } from '../../data/skin';
import { windowBox } from './ui';
export function drawScene(context: CanvasRenderingContext2D, draw: DrawList, skin: Skin, images: ReadonlyMap<string, CanvasImageSource>, tileSize: number): void {
  const colors: Readonly<Record<string, string>> = skin.colors;
  context.save(); context.imageSmoothingEnabled = false; context.textBaseline = 'top';
  context.font = `${skin.font.size}px ${JSON.stringify(skin.font.family)}`;
  for (const command of draw) {
    switch (command.kind) {
      case 'rect': context.fillStyle = colors[command.color] ?? command.color; context.fillRect(command.x, command.y, command.w, command.h); break;
      case 'window': windowBox(context, skin, images, command.x, command.y, command.w, command.h); break;
      case 'text': context.textAlign = command.align ?? 'left'; context.fillStyle = command.color ? colors[command.color] ?? command.color : skin.colors.text; context.fillText(command.text, command.x, command.y); break;
      case 'image': {
        const image = images.get(command.asset); if (!image) throw new Error(`Missing scene image: ${command.asset}`);
        if (command.frame === undefined) context.drawImage(image, command.x, command.y);
        else context.drawImage(image, command.frame * tileSize, 0, tileSize, tileSize, command.x, command.y, tileSize, tileSize);
        break;
      }
    }
  }
  context.restore();
}
