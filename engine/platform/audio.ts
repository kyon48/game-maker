import type { Audio, SoundSnapshot } from '../data/audio';
interface Track { source: AudioBufferSourceNode; gain: GainNode }
/** Browser-only transport. Simulation ticks own requests, AudioContext owns playback. */
export class GameAudio {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly tracks = new Set<Track>();
  private music?: Track;
  private unlocked = false;
  private disposed = false;
  private readonly listeners = new AbortController();
  constructor(private readonly definitions: Audio, private readonly context: AudioContext = new AudioContext(), target: EventTarget = window, private readonly visibility: Document = document) {
    void context.suspend().catch(console.warn);
    const unlock = () => { this.unlocked = true; if (!this.visibility.hidden) void context.resume().catch(console.warn); };
    target.addEventListener('keydown', unlock, { signal: this.listeners.signal });
    target.addEventListener('pointerdown', unlock, { signal: this.listeners.signal });
    visibility.addEventListener('visibilitychange', () => {
      if (this.disposed) return;
      if (visibility.hidden) void context.suspend().catch(console.warn);
      else if (this.unlocked) void context.resume().catch(console.warn);
    }, { signal: this.listeners.signal });
  }
  async preload(read: (file: string) => Promise<Uint8Array>): Promise<void> {
    await Promise.all([...new Set(Object.values(this.definitions).map(a => a.file))].map(async file => {
      const bytes = await read(file); const buffer = await this.context.decodeAudioData(bytes.slice().buffer as ArrayBuffer);
      if (!this.disposed) this.buffers.set(file, buffer);
    }));
  }
  apply(snapshot: SoundSnapshot): void {
    for (const request of snapshot.requests) {
      if (request.kind === 'bgm') {
        if (this.music) {
          const track = this.music, now = this.context.currentTime;
          track.gain.gain.cancelAndHoldAtTime(now); track.gain.gain.linearRampToValueAtTime(0, now + request.fade);
          track.source.stop(now + request.fade); this.music = undefined;
        }
        if (request.id !== null) this.music = this.start(request.id, true, request.fade);
      } else this.start(request.id, false, 0);
    }
  }
  private start(id: string, bgm: boolean, fade: number): Track {
    const data = this.definitions[id]; if (!data) throw new Error(`Unknown audio: ${id}`);
    const buffer = this.buffers.get(data.file); if (!buffer) throw new Error(`Audio not decoded: ${data.file}`);
    const source = this.context.createBufferSource(), gain = this.context.createGain(), track = { source, gain }, now = this.context.currentTime;
    source.buffer = buffer; source.loop = bgm && (data.loop ?? false);
    gain.gain.setValueAtTime(fade ? 0 : data.volume ?? 1, now);
    if (fade) gain.gain.linearRampToValueAtTime(data.volume ?? 1, now + fade);
    source.connect(gain); gain.connect(this.context.destination); this.tracks.add(track);
    source.onended = () => { source.disconnect(); gain.disconnect(); this.tracks.delete(track); if (this.music === track) this.music = undefined; };
    source.start(); return track;
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.listeners.abort();
    for (const track of this.tracks) { track.source.onended = null; track.source.stop(); track.source.disconnect(); track.gain.disconnect(); }
    this.tracks.clear(); this.buffers.clear(); void this.context.close().catch(console.warn);
  }
}
