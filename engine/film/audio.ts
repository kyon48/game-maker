import type { TimelineEvent } from './timeline';
export interface NarrationVoice { plainText: string; voiceKey: string; voiceFrames: number }
export interface FilmAudioOptions { narration(text: string): NarrationVoice }
/** Film-clock scheduling only; never mutates simulation state. */
export class FilmAudio {
  private sequence = 0;
  private queue: { start: number; end: number; voice: NarrationVoice; id: number; started: boolean }[] = [];
  private pending: TimelineEvent[] = [];
  private music?: Extract<TimelineEvent, { type: 'music-start' }>;
  private dialogue?: { key: string; end: number };
  private overlaps = new Set<string>();
  readonly warnings: string[] = [];
  constructor(private readonly options?: FilmAudioOptions) {}
  get end(): number { return this.queue.at(-1)?.end ?? 0; }
  narrate(text: string, tick: number): number {
    if (!this.options) throw new Error('Missing narration voice length; run npm run tts first');
    const voice = this.options.narration(text);
    if (!Number.isSafeInteger(voice.voiceFrames) || voice.voiceFrames < 0) throw new Error('Missing narration voice length; run npm run tts first');
    const start = Math.max(tick, this.end), end = start + voice.voiceFrames * 2;
    this.queue.push({ start, end, voice, id: ++this.sequence, started: false });
    this.update(tick); return end;
  }
  update(tick: number, dialogue?: { voiceAuto?: boolean; messageId?: number; voiceKey?: string; voiceFrames?: number } | null): void {
    if (dialogue !== undefined) {
      if (!dialogue?.voiceAuto || dialogue.voiceFrames === undefined) this.dialogue = undefined;
      else {
        const key = `${dialogue.messageId}:${dialogue.voiceKey}`;
        if (this.dialogue?.key !== key) this.dialogue = { key, end: Math.max(0, tick - 1) + dialogue.voiceFrames * 2 };
      }
    }
    for (const item of this.queue) {
      if (!item.started && tick >= item.start) { item.started = true; this.pending.push({ type: 'narration-start', tick: item.start, id: item.id, text: item.voice.plainText, ...item.voice }); }
      if (this.dialogue && tick < this.dialogue.end && tick >= item.start && tick < item.end) {
        const key = `${item.id}:${this.dialogue.key}`;
        if (!this.overlaps.has(key)) { this.overlaps.add(key); this.warnings.push(`Narration overlaps voiced dialogue at tick ${tick}`); }
      }
      if (tick >= item.end) this.pending.push({ type: 'narration-end', tick: item.end, id: item.id, text: item.voice.plainText, ...item.voice });
    }
    this.queue = this.queue.filter(item => tick < item.end);
  }
  setMusic(value: { file: string; volume?: number; fadeIn?: number; loop?: true } | null, tick: number, fadeOut = 0): void {
    if (this.music) this.pending.push({ type: 'music-stop', tick, id: this.music.id, file: this.music.file, volume: this.music.volume, fade: fadeOut });
    this.music = undefined;
    if (value) { this.music = { type: 'music-start', tick, id: ++this.sequence, file: value.file, volume: value.volume ?? 1, fade: value.fadeIn ?? 0, loop: value.loop ?? false }; this.pending.push(this.music); }
  }
  events(): TimelineEvent[] { return this.pending.splice(0); }
}
