import { ChoiceState } from '../sim/ui/ChoiceState';
import { FixedTickLoop, startLoop } from './loop';
import { drawUi } from './renderer/ui';
import type { Keyboard } from './keyboard';
import type { Skin } from '../data/skin';
export async function chooseStart(context: CanvasRenderingContext2D, skin: Skin, images: ReadonlyMap<string, CanvasImageSource>, keyboard: Keyboard, labels: string[]): Promise<number> {
  const choice = new ChoiceState(); choice.open({ labels, cancelIndex: null });
  let stop = () => {};
  try {
    return await new Promise<number>((resolve, reject) => {
      stop = startLoop(new FixedTickLoop(input => {
        choice.update(input); if (!choice.opened) resolve(choice.result!);
      }, () => keyboard.consume(), () => {
        context.clearRect(0, 0, context.canvas.width, context.canvas.height);
        drawUi(context, { message: null, choice: choice.snapshot }, skin, images);
      }), reject);
    });
  } finally { stop(); }
}
