import { frameOf } from '../../engine/film/timeline';
import { access, rename, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import type { FramedEvent } from '../../engine/film/timeline';
export function dialogueTiming(event: Extract<FramedEvent, { type: 'text-start' }>, fps: 30 | 60, startFrame = 0) {
  const offset = Math.max(0, startFrame - frameOf(event.tick, fps)) / fps;
  return { offset, duration: Math.max(0, (event.voiceFrames ?? 0) / 30 - offset), delay: Math.round(event.frame * 1000 / fps) };
}
/** V2a only: place dialogue WAVs at timeline frames. No music, ducking or loudness normalization. */
export async function dialogueAudio(pack: string, out: string, events: readonly FramedEvent[], fps: 30 | 60, frames: number, signal?: AbortSignal, startFrame = 0): Promise<boolean> {
  const starts = events.filter(e => e.type === 'text-start' && e.voiceKey && e.voiceFrames !== undefined && dialogueTiming(e, fps, startFrame).duration > 0);
  if (!starts.length) return false;
  if (!ffmpeg) throw new Error('ffmpeg-static binary unavailable');
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(out, 'video.mp4')], filters: string[] = [], labels: string[] = [];
  for (const [i, event] of starts.entries()) {
    if (event.type !== 'text-start' || !/^[a-f0-9]{64}$/.test(event.voiceKey!)) throw new Error('Invalid voice key');
    const file = path.join('.cache/voice', pack, event.voiceKey! + '.wav');
    try { await access(file); } catch { throw new Error(`Missing voice cache ${event.voiceKey}; run npm run tts -- ${pack} first`); }
    args.push('-i', file);
    const label = `v${i}`, { offset, duration, delay } = dialogueTiming(event, fps, startFrame);
    filters.push(`[${i + 1}:a]atrim=start=${offset},asetpts=PTS-STARTPTS,apad,atrim=duration=${duration},adelay=${delay}:all=1[${label}]`); labels.push(`[${label}]`);
  }
  filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,apad,atrim=duration=${frames / fps}[dialogue]`);
  const output = path.join(out, 'video-audio.mp4');
  try {
    await promisify(execFile)(ffmpeg, [...args, '-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[dialogue]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-t', String(frames / fps), '-movflags', '+faststart', output], { signal });
    await rename(output, path.join(out, 'video.mp4')); return true;
  } finally { await rm(output, { force: true }); }
}
