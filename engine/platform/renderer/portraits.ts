import type { Skin } from '../../data/skin';
import { portraitSlot } from '../../data/portraits';
import type { Portraits } from '../../data/portraits';
import type { MessageSnapshot } from '../../sim/ui/MessageState';
/** Positions are logical pixels; only image sampling happens at display resolution. */
export function drawPortrait(context: CanvasRenderingContext2D, message: MessageSnapshot | null, skin: Skin,
  portraits: Portraits, images: ReadonlyMap<string, HTMLImageElement>, logicalWidth: number, logicalHeight: number): void {
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  if (!message?.portrait || !message.expression) return;
  const path = portraits[message.portrait]?.[message.expression], image = path && images.get(path);
  if (!image) throw new Error(`Missing preloaded portrait: ${message.portrait}/${message.expression}`);
  const padding = skin.window.padding, slot = portraitSlot(skin);
  const height = (skin.message.rows + (message.speaker === undefined ? 0 : 1)) * skin.font.lineHeight;
  const top = logicalHeight - height - padding;
  const ratio = Math.min(slot.width / image.naturalWidth, height / image.naturalHeight);
  const width = image.naturalWidth * ratio, drawnHeight = image.naturalHeight * ratio;
  context.save(); context.scale(context.canvas.width / logicalWidth, context.canvas.height / logicalHeight);
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.drawImage(image, padding + (slot.width - width) / 2, top + (height - drawnHeight) / 2, width, drawnHeight);
  context.restore();
}
