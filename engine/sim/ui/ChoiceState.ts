import type { InputFrame } from '../ports';
import type { ChoiceRequest } from '../event/types';
export interface ChoiceSnapshot {
  readonly prompt: string | undefined; readonly options: readonly { readonly index: number; readonly label: string }[];
  readonly selected: number;
}
export class ChoiceState {
  private request: ChoiceRequest | undefined;
  private options: { index: number; label: string }[] = [];
  private cursor = 0;
  result: number | undefined;
  get opened(): boolean { return this.request !== undefined; }
  open(request: ChoiceRequest): void {
    if (this.opened) throw new Error('Choice already open');
    if (request.cancelIndex !== null && (!Number.isInteger(request.cancelIndex) || request.cancelIndex < 0 || request.cancelIndex >= request.labels.length)) throw new Error('Choice cancel index out of range');
    this.request = { ...request, labels: [...request.labels] }; this.options = []; this.cursor = 0; this.result = undefined;
    request.labels.forEach((label, index) => { if (label !== null) this.options.push({ index, label }); });
    if (!this.options.length) { this.result = -1; this.close(); }
  }
  close(): void { this.request = undefined; }
  update(input: InputFrame): void {
    if (!this.request) return;
    const movement = Number(input.pressed.has('down')) - Number(input.pressed.has('up'));
    this.cursor = (this.cursor + movement + this.options.length) % this.options.length;
    if (input.pressed.has('ok')) { this.result = this.options[this.cursor]!.index; this.close(); }
    else if (input.pressed.has('cancel') && this.request.cancelIndex !== null) { this.result = this.request.cancelIndex; this.close(); }
  }
  get snapshot(): ChoiceSnapshot | null {
    return this.request ? { prompt: this.request.prompt, options: this.options, selected: this.options[this.cursor]!.index } : null;
  }
}
