import type { TextMeasurer, InputFrame } from '../ports';
import type { TextRequest } from '../event/types';
import { wrapText } from './wrapText';
export interface MessageSnapshot {
  readonly text: string; readonly speaker: string | undefined; readonly lines: readonly string[];
  readonly page: number; readonly pageCount: number; readonly fullyShown: boolean;
}
export interface MessageConfig { readonly width: number; readonly rows: number; readonly charsPerTick: number }
export class MessageState {
  private request: TextRequest | undefined;
  private pages: string[][][] = [];
  private page = 0;
  private shown = 0;
  constructor(private readonly config: MessageConfig, private readonly measurer: TextMeasurer) {
  }
  get opened(): boolean { return this.request !== undefined; }
  open(request: TextRequest): void {
    if (this.opened) throw new Error('Message already open');
    this.request = { ...request }; this.page = 0; this.shown = 0; this.pages = [];
    const lines = wrapText(request.text, this.config.width, this.measurer);
    for (let i = 0; i < lines.length; i += this.config.rows) this.pages.push(lines.slice(i, i + this.config.rows).map(line => [...line]));
  }
  close(): void { this.request = undefined; }
  private get length(): number { return this.pages[this.page]!.reduce((total, line) => total + line.length, 0); }
  update(input: InputFrame): void {
    if (!this.opened) return;
    if (input.pressed.has('ok') || input.pressed.has('cancel')) {
      if (this.shown < this.length) this.shown = this.length;
      else if (this.page + 1 < this.pages.length) { this.page++; this.shown = 0; }
      else this.close();
    } else this.shown = Math.min(this.length, this.shown + this.config.charsPerTick);
  }
  get snapshot(): MessageSnapshot | null {
    if (!this.request) return null;
    let left = this.shown;
    const lines = this.pages[this.page]!.map(points => {
      const visible = points.slice(0, Math.max(0, left)).join(''); left -= points.length; return visible;
    });
    return { text: this.request.text, speaker: this.request.speaker, lines,
      page: this.page, pageCount: this.pages.length, fullyShown: this.shown === this.length };
  }
}
