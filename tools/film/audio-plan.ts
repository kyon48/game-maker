import path from 'node:path';
import type { FramedEvent } from '../../engine/film/timeline';
import { frameOf } from '../../engine/film/timeline';
import { packPath } from '../../engine/data/loader/path';
export interface SpeechRegion { start: number; end: number }
export interface DuckRegion extends SpeechRegion { attack: number; release: number }
const duckGain = 10 ** (-12 / 20);
/** Merge nearby speech, avoiding a volume bounce between adjacent sentences. Seconds throughout. */
export function duckRegions(speech: readonly SpeechRegion[], ramp = 0.15): DuckRegion[] {
  const merged: SpeechRegion[] = [];
  for (const interval of [...speech].filter(s => s.end > s.start).sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end + ramp * 2) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged.map(s => ({ ...s, attack: Math.max(0, s.start - ramp), release: s.end + ramp }));
}
export function duckVolumeAt(regions: readonly DuckRegion[], time: number): number {
  return regions.reduce((gain, s) => {
    const value = time < s.attack || time >= s.release ? 1 : time < s.start ? 1 - (1 - duckGain) * (time - s.attack) / (s.start - s.attack) : time <= s.end ? duckGain : duckGain + (1 - duckGain) * (time - s.end) / (s.release - s.end);
    return Math.min(gain, value);
  }, 1);
}
function duckExpression(regions: readonly DuckRegion[], time: string): string {
  return regions.reduce((expr, s) => {
    const attack = s.start > s.attack ? `1-(1-${duckGain})*(${time}-${s.attack})/${s.start - s.attack}` : String(duckGain);
    const release = `${duckGain}+(1-${duckGain})*(${time}-${s.end})/${s.release - s.end}`;
    return `min(${expr},if(lt(${time},${s.attack}),1,if(lt(${time},${s.start}),${attack},if(lte(${time},${s.end}),${duckGain},if(lt(${time},${s.release}),${release},1)))))`;
  }, '1');
}
export function audioTiming(event: Extract<FramedEvent, { type: 'text-start' | 'narration-start' }>, fps: 30 | 60, startFrame = 0) {
  const original = event.type === 'text-start' ? frameOf(event.tick, fps) : Math.floor(event.tick * fps / 60);
  const offset = Math.max(0, startFrame - original) / fps;
  return { offset, duration: Math.max(0, (event.voiceFrames ?? 0) / 30 - offset), delay: Math.round(event.frame * 1000 / fps) };
}
/** Build the exact deterministic mix, before two-pass loudness normalization. */
export function audioPlan(pack: string, events: readonly FramedEvent[], fps: 30 | 60, frames: number, startFrame = 0, root = '.', musicDurations: Readonly<Record<string, number>> = {}) {
  const total = frames / fps, args: string[] = [], filters: string[] = [], labels: string[] = [], files: string[] = [];
  const speech: SpeechRegion[] = [];
  for (const event of events) if ((event.type === 'text-start' || event.type === 'narration-start') && event.voiceKey && event.voiceFrames !== undefined) {
    const { offset, duration, delay } = audioTiming(event, fps, startFrame), seconds = Math.min(duration, total - event.frame / fps);
    if (seconds <= 0) continue;
    if (!/^[a-f0-9]{64}$/.test(event.voiceKey)) throw new Error('Invalid voice key');
    const file = path.join(root, '.cache/voice', pack, event.voiceKey + '.wav'), index = files.length, label = `voice${index}`;
    files.push(file); args.push('-i', file);
    filters.push(`[${index}:a]atrim=start=${offset},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${seconds},atrim=duration=${seconds},adelay=${delay}:all=1[${label}]`);
    labels.push(`[${label}]`); speech.push({ start: event.frame / fps, end: event.frame / fps + seconds });
  }
  const duck = duckRegions(speech);
  for (const event of events) if (event.type === 'music-start') {
    const original = Math.floor(event.tick * fps / 60), offset = Math.max(0, startFrame - original) / fps, delay = event.frame / fps;
    const stop = events.find(s => s.type === 'music-stop' && s.id === event.id);
    const fadeOut = stop?.type === 'music-stop' ? stop.fade : 0;
    const stopTime = stop ? (Math.floor(stop.tick * fps / 60) - original) / fps : Infinity;
    const seconds = Math.min(total - delay, stopTime + fadeOut - offset);
    if (seconds <= 0) continue;
    const reference = packPath('', event.file);
    const file = path.join(root, 'packs', pack, reference), index = files.length, label = `music${index}`;
    files.push(file); if (event.loop) { const length = musicDurations[event.file]; args.push('-stream_loop', String(length ? Math.max(0, Math.ceil((offset + seconds) / length) - 1) : -1)); } args.push('-t', String(offset + seconds), '-i', file);
    const fadeIn = event.fade > 0 ? `min(1,(t+${offset})/${event.fade})` : '1';
    const fade = fadeOut > 0 ? `max(0,min(1,(${stopTime + fadeOut}-(t+${offset}))/${fadeOut}))` : '1';
    filters.push(`[${index}:a]atrim=start=${offset},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${seconds},volume='${event.volume}*${fadeIn}*${fade}*${duckExpression(duck, `(t+${delay})`)}':eval=frame,adelay=${Math.round(delay * 1000)}:all=1[${label}]`);
    labels.push(`[${label}]`);
  }
  if (labels.length) filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,apad=whole_dur=${total},atrim=duration=${total}[mixed]`);
  return { args, filter: filters.join(';'), files, duck, duration: total };
}
