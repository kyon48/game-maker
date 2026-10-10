import { access, rename, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import type { FramedEvent } from '../../engine/film/timeline';
import { audioPlan, audioTiming } from './audio-plan';
export const dialogueTiming = audioTiming;
interface Loudness { input_i: string; input_tp: string; input_lra: string; input_thresh: string; target_offset: string }
export function normalizationFilter(measurement: Loudness): string {
  if (![measurement.input_i, measurement.input_tp, measurement.input_lra, measurement.input_thresh, measurement.target_offset].every(value => Number.isFinite(Number(value)))) return 'anull'; // Digital silence has no finite LUFS.
  return `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${measurement.input_i}:measured_TP=${measurement.input_tp}:measured_LRA=${measurement.input_lra}:measured_thresh=${measurement.input_thresh}:offset=${measurement.target_offset}:linear=true`;
}
/** Dialogue, queued narration and music; timeline ducking followed by two-pass loudnorm. */
export async function dialogueAudio(pack: string, out: string, events: readonly FramedEvent[], fps: 30 | 60, frames: number, signal?: AbortSignal, startFrame = 0, root = '.'): Promise<boolean> {
  let plan = audioPlan(pack, events, fps, frames, startFrame, root);
  if (!plan.files.length) return false;
  if (!ffmpeg) throw new Error('ffmpeg-static binary unavailable');
  for (const file of plan.files) try { await access(file); } catch { throw new Error(`Missing audio ${file}; run npm run tts -- ${pack} first for voice cache`); }
  const run = (args: string[]) => promisify(execFile)(ffmpeg!, ['-hide_banner', '-nostdin', '-y', ...args], { signal, maxBuffer: 8 * 1024 * 1024 });
  const mixed = path.join(out, 'mixed.wav'), output = path.join(out, 'video-audio.mp4');
  try {
    // Bound demuxer looping itself: infinite stream_loop can hang ffmpeg 6 at filter EOF.
    const durations: Record<string, number> = {};
    for (const event of events) if (event.type === 'music-start' && event.loop && durations[event.file] === undefined) {
      const file = path.join(root, 'packs', pack, event.file);
      const probe = await run(['-i', file, '-af', 'aresample=48000,aformat=channel_layouts=mono,astats=metadata=0:reset=0', '-f', 'null', '-']);
      const match = probe.stderr.match(/Number of samples: (\d+)/);
      const duration = match ? Number(match[1]) / 48000 : 0;
      if (duration <= 0) throw new Error(`Cannot determine music duration: ${event.file}`);
      durations[event.file] = duration;
    }
    plan = audioPlan(pack, events, fps, frames, startFrame, root, durations);
    await run(['-loglevel', 'error', '-filter_complex_threads', '1', ...plan.args, '-filter_complex', plan.filter, '-map', '[mixed]', '-t', String(plan.duration), '-ar', '48000', '-ac', '2', '-c:a', 'pcm_f32le', mixed]);
    const analysis = await run(['-i', mixed, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-']);
    const json = analysis.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0];
    if (!json) throw new Error('ffmpeg loudness measurement missing');
    const filter = normalizationFilter(JSON.parse(json) as Loudness);
    await run(['-loglevel', 'error', '-i', path.join(out, 'video.mp4'), '-i', mixed, '-map', '0:v:0', '-map', '1:a:0', '-af', filter, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', String(plan.duration), '-movflags', '+faststart', output]);
    await rename(output, path.join(out, 'video.mp4')); return true;
  } finally { await Promise.all([rm(output, { force: true }), rm(mixed, { force: true })]); }
}
