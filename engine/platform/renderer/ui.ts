import type { Skin } from '../../data/skin';
import type { GameSnapshot } from '../../sim/Game';
function windowBox(context: CanvasRenderingContext2D, skin: Skin, images: ReadonlyMap<string, CanvasImageSource>,
  x: number, y: number, width: number, height: number): void {
  if (skin.window.image) {
    const image = images.get(skin.window.image) as HTMLImageElement | undefined;
    if (!image) throw new Error(`Missing window image: ${skin.window.image}`);
    const slice = skin.window.slice;
    for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
      const sx = column === 0 ? 0 : column === 1 ? slice : image.width - slice;
      const sy = row === 0 ? 0 : row === 1 ? slice : image.height - slice;
      const sw = column === 1 ? image.width - 2 * slice : slice;
      const sh = row === 1 ? image.height - 2 * slice : slice;
      const dx = x + (column === 0 ? 0 : column === 1 ? slice : width - slice);
      const dy = y + (row === 0 ? 0 : row === 1 ? slice : height - slice);
      context.drawImage(image, sx, sy, sw, sh, dx, dy, column === 1 ? width - 2 * slice : slice, row === 1 ? height - 2 * slice : slice);
    }
  } else {
    context.fillStyle = 'rgba(0,0,0,0.8)'; context.fillRect(x, y, width, height);
    context.strokeStyle = '#ffffff'; context.lineWidth = 1; context.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  }
}
export function drawUi(context: CanvasRenderingContext2D, snapshot: Pick<GameSnapshot, 'message' | 'choice'>, skin: Skin,
  images: ReadonlyMap<string, CanvasImageSource>): void {
  context.save(); context.imageSmoothingEnabled = false;
  context.font = `${skin.font.size}px ${JSON.stringify(skin.font.family)}`;
  context.textBaseline = 'top';
  const padding = skin.window.padding, lineHeight = skin.font.lineHeight;
  if (snapshot.message) {
    const message = snapshot.message, speakerRows = message.speaker === undefined ? 0 : 1;
    const height = (skin.message.rows + speakerRows) * lineHeight + 2 * padding;
    const top = context.canvas.height - height;
    windowBox(context, skin, images, 0, top, context.canvas.width, height);
    if (message.speaker !== undefined) {
      context.fillStyle = skin.colors.speaker; context.fillText(message.speaker, padding, top + padding);
    }
    context.fillStyle = skin.colors.text;
    message.lines.forEach((line, index) => context.fillText(line, padding, top + padding + (index + speakerRows) * lineHeight));
  }
  if (snapshot.choice) {
    const choice = snapshot.choice, promptRows = choice.prompt === undefined ? 0 : 1;
    let textWidth = choice.prompt === undefined ? 0 : context.measureText(choice.prompt).width;
    for (const option of choice.options) textWidth = Math.max(textWidth, context.measureText(option.label).width + lineHeight);
    const width = Math.min(context.canvas.width, Math.ceil(textWidth) + 2 * padding);
    const height = (choice.options.length + promptRows) * lineHeight + 2 * padding;
    const left = Math.floor((context.canvas.width - width) / 2), top = context.canvas.height - height - 2 * padding;
    windowBox(context, skin, images, left, top, width, height);
    context.fillStyle = skin.colors.text;
    if (choice.prompt !== undefined) context.fillText(choice.prompt, left + padding, top + padding);
    choice.options.forEach((option, index) => {
      const y = top + padding + (index + promptRows) * lineHeight;
      context.fillStyle = skin.colors.text; context.fillText(option.label, left + padding + lineHeight, y);
      if (option.index === choice.selected) {
        context.fillStyle = skin.colors.cursor; context.beginPath();
        context.moveTo(left + padding, y + 3); context.lineTo(left + padding + 6, y + 7); context.lineTo(left + padding, y + 11);
        context.closePath(); context.fill();
      }
    });
  }
  context.restore();
}
