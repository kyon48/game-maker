import type { TextMeasurer } from '../sim/ports';
export class CanvasTextMeasurer implements TextMeasurer {
  constructor(private readonly context: CanvasRenderingContext2D) {}
  width(text: string): number { return this.context.measureText(text).width; }
}
