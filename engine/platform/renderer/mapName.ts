import type { MapNameSnapshot } from '../../sim/ui/MapNameState';
import type { Skin } from '../../data/skin';
export function drawMapName(context: CanvasRenderingContext2D, name: MapNameSnapshot | null, skin: Skin): void {
  if (!name) return;
  context.save(); context.globalAlpha = name.alpha;
  context.fillStyle = skin.colors.mapNameBackground ?? skin.colors.fade;
  context.fillRect(0, 0, context.canvas.width, skin.font.lineHeight + skin.window.padding * 2);
  context.font = `${skin.font.size}px ${JSON.stringify(skin.font.family)}`;
  context.textAlign = 'center'; context.textBaseline = 'top';
  context.fillStyle = skin.colors.mapNameText ?? skin.colors.text;
  context.fillText(name.text, context.canvas.width / 2, skin.window.padding); context.restore();
}
