import type { Audio, SoundRequest, SoundSnapshot } from '../../data/audio';
/** Requests belong to one simulation tick. No playback clock or saved transport. */
export class SoundState {
  private bgm: string | null = null;
  private requests: SoundRequest[] = [];
  constructor(private readonly audio: Audio = {}) {}
  beginTick(): void { this.requests = []; }
  playBgm(id: string | null, fade = 0): void {
    if (id !== null && !Object.hasOwn(this.audio, id)) throw new Error(`Unknown audio: ${id}`);
    if (id !== null && id === this.bgm) return;
    this.bgm = id; this.requests.push({ kind: 'bgm', id, fade });
  }
  playSfx(id: string): void {
    if (!Object.hasOwn(this.audio, id)) throw new Error(`Unknown audio: ${id}`);
    this.requests.push({ kind: 'sfx', id });
  }
  get snapshot(): SoundSnapshot { return { bgm: this.bgm, requests: this.requests.map(request => ({ ...request })) }; }
}
