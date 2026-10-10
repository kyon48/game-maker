import type { FilmCuePort } from '../sim/ports';
export class FilmCueGate implements FilmCuePort {
  pending: string | null = null;
  enter(id: string): void { if (this.pending !== null) throw new Error(`Concurrent film cue: ${id}`); this.pending = id; }
  waiting(id: string): boolean { return this.pending === id; }
  cancel(id: string): void { if (this.pending === id) this.pending = null; }
  release(id: string): void { if (this.pending !== id) throw new Error(`Unexpected film cue: ${id}`); this.pending = null; }
}
