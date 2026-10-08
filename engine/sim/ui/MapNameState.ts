export interface MapNameSnapshot { readonly text: string; readonly ticksRemaining: number; readonly alpha: number }
export class MapNameState {
  private text: string | undefined;
  private remaining = 0;
  show(text?: string): void { this.text = text; this.remaining = text ? 90 : 0; }
  update(): void { if (this.remaining > 0) this.remaining--; }
  get snapshot(): MapNameSnapshot | null { return this.text && this.remaining > 0 ? { text: this.text, ticksRemaining: this.remaining, alpha: Math.min(1, this.remaining / 20) } : null; }
}
