import type { TextMeasurer, InputFrame } from '../ports';
import type { TextRequest } from '../event/types';
import { resolveText } from '../../data/text';
import type { DisplaySegment, TextResolver } from '../../data/text';
import { wrapSegments } from './wrapSegments';
export interface MessageSnapshot {
  readonly text: string; readonly plainText: string; readonly speaker: string | undefined; readonly lines: readonly string[];
  readonly segments: readonly (readonly DisplaySegment[])[];
  readonly page: number; readonly pageCount: number; readonly fullyShown: boolean;
}
export interface MessageConfig { readonly width: number; readonly rows: number; readonly charsPerTick: number }
const literal: TextResolver = { variable: name => { throw new Error(`Unresolved variable: ${name}`); }, plugin: name => { throw new Error(`Unresolved plugin: ${name}`); } };
export class MessageState {
  private request: TextRequest | undefined;
  private resolved: readonly DisplaySegment[] = [];
  private pages: DisplaySegment[][][] = [];
  private flatPages: DisplaySegment[][] = [];
  private page = 0;
  private shown = 0;
  private progress = 0;
  private wait = 0;
  private entered = false;
  constructor(private readonly config: MessageConfig, private readonly measurer: TextMeasurer, private readonly resolver: TextResolver = literal) {}
  get segments(): readonly DisplaySegment[] { return this.resolved; }
  get opened(): boolean { return this.request !== undefined; }
  open(request: TextRequest): void {
    if (this.opened) throw new Error('Message already open');
    const parsed = resolveText(request.text, this.resolver);
    const speaker = request.speaker === undefined ? undefined : resolveText(request.speaker, this.resolver, false).plainText;
    const lines = wrapSegments(parsed.segments, this.config.width, this.measurer);
    this.resolved = parsed.segments;
    this.request = { text: parsed.plainText, speaker }; this.page = 0; this.reset(); this.pages = [];
    for (let i = 0; i < lines.length; i += this.config.rows) this.pages.push(lines.slice(i, i + this.config.rows));
    this.flatPages = this.pages.map(page => page.flat());
  }
  private reset(): void { this.shown = 0; this.progress = 0; this.wait = 0; this.entered = false; }
  close(): void { this.request = undefined; }
  private get points(): readonly DisplaySegment[] { return this.flatPages[this.page]!; }
  update(input: InputFrame): void {
    if (!this.opened) return;
    const points = this.points;
    if (input.pressed.has('ok') || input.pressed.has('cancel')) {
      if (this.shown < points.length) { this.shown = points.length; this.wait = 0; this.progress = 0; }
      else if (this.page + 1 < this.pages.length) { this.page++; this.reset(); }
      else this.close();
      return;
    }
    let budget = 1;
    while (this.shown < points.length) {
      const segment = points[this.shown]!;
      if (!this.entered) { this.wait = segment.wait; this.entered = true; }
      if (this.wait > 0) {
        if (budget === 1) this.wait--;
        if (!this.wait && !segment.text) { this.shown++; this.entered = false; }
        return;
      }
      if (segment.text) {
        const rate = this.config.charsPerTick * segment.speed, cost = (1 - this.progress) / rate;
        if (cost > budget + 1e-12) { this.progress += budget * rate; return; }
        budget = Math.max(0, budget - cost);
      }
      this.shown++; this.progress = 0; this.entered = false;
      if (budget === 0) return;
    }
  }
  get snapshot(): MessageSnapshot | null {
    if (!this.request) return null;
    let left = this.shown;
    const segments = this.pages[this.page]!.map(points => { const visible = points.slice(0, Math.max(0, left)); left -= points.length; return visible; });
    return { text: this.request.text, plainText: this.request.text, speaker: this.request.speaker,
      lines: segments.map(line => line.map(s => s.text).join('')), segments,
      page: this.page, pageCount: this.pages.length, fullyShown: this.shown === this.points.length };
  }
}
