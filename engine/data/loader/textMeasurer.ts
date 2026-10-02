import type { TextMeasurer } from '@engine/api';
export class HeadlessTextMeasurer implements TextMeasurer {
  constructor(private readonly fontSize: number) {}
  width(text: string): number {
    let width = 0;
    for (const point of text) width += (point.codePointAt(0) ?? 0) >= 0x1100 ? this.fontSize : this.fontSize / 2;
    return width;
  }
}
