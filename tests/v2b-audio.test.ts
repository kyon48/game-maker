import { expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { fake } from '../tools/tts/provider';
import { dialogueAudio, normalizationFilter } from '../tools/film/audio';
import { audioPlan } from '../tools/film/audio-plan';
import type { FramedEvent } from '../engine/film/timeline';
it('audio argument plan mixes voice and loop music with ducking and fades', () => {
  const events: FramedEvent[] = [
    { type: 'text-start', tick: 31, frame: 15, id: 1, text: 'a', plainText: 'a', voiceKey: 'a'.repeat(64), voiceFrames: 15 },
    { type: 'narration-start', tick: 60, frame: 30, id: 1, text: 'b', plainText: 'b', voiceKey: 'b'.repeat(64), voiceFrames: 15 },
    { type: 'music-start', tick: 0, frame: 0, id: 2, file: 'assets/music/test.ogg', volume: 0.2, fade: 0.3, loop: true },
    { type: 'music-stop', tick: 90, frame: 45, id: 2, file: 'assets/music/test.ogg', volume: 0.2, fade: 0.5 },
  ];
  const plan = audioPlan('base', events, 30, 60);
  expect(plan.args).toEqual(['-i', '.cache/voice/base/' + 'a'.repeat(64) + '.wav', '-i', '.cache/voice/base/' + 'b'.repeat(64) + '.wav', '-stream_loop', '-1', '-t', '2', '-i', 'packs/base/assets/music/test.ogg']);
  expect(audioPlan('base', events, 30, 60, 0, '.', { 'assets/music/test.ogg': 0.4 }).args).toContain('4');
  expect(plan.filter).toContain('adelay=500:all=1'); expect(plan.filter).toContain('amix=inputs=3:normalize=0');
  expect(plan.filter).toContain("volume='0.2*"); expect(plan.filter).toContain('eval=frame'); expect(plan.filter).toContain('aresample=48000');
  expect(normalizationFilter({ input_i: '-25', input_tp: '-3', input_lra: '2', input_thresh: '-36', target_offset: '0.1' })).toContain('measured_I=-25');
  const measurement = { input_i: '-25', input_tp: '-3', input_lra: '2', input_thresh: '-36', target_offset: '0.1', normalization_type: 'dynamic', output_i: '-14' };
  expect(normalizationFilter(measurement)).toContain('measured_I=-25');
  expect(normalizationFilter({ input_i: '-inf', input_tp: '-inf', input_lra: '0', input_thresh: '-70', target_offset: 'inf' })).toBe('anull');
});
it('short real ffmpeg integration produces stereo 48kHz AAC and removes temporary mix files', async () => {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10000);
  const root = await mkdtemp(path.join(tmpdir(), 'v2b-audio-')), out = path.join(root, 'out');
  const run = (args: string[]) => promisify(execFile)(ffmpeg!, ['-hide_banner', '-nostdin', '-y', ...args], { signal: abort.signal });
  try {
    await mkdir(out); await mkdir(path.join(root, '.cache/voice/base'), { recursive: true }); await mkdir(path.join(root, 'packs/base/assets/music'), { recursive: true });
    const key = 'a'.repeat(64);
    await writeFile(path.join(root, '.cache/voice/base', key + '.wav'), (await fake.synthesize('fake narration', 'a', 1)).wav);
    await run(['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=size=16x16:rate=30:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(out, 'video.mp4')]);
    await run(['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=0.4', path.join(root, 'packs/base/assets/music/test.wav')]);
    const events: FramedEvent[] = [
      { type: 'narration-start', tick: 0, frame: 0, id: 1, text: 'fake narration', plainText: 'fake narration', voiceKey: key, voiceFrames: 15 },
      { type: 'music-start', tick: 0, frame: 0, id: 2, file: 'assets/music/test.wav', volume: 0.2, fade: 0.05, loop: true },
    ];
    expect(await dialogueAudio('base', out, events, 30, 30, abort.signal, 0, root)).toBe(true);
    const info = await run(['-i', path.join(out, 'video.mp4'), '-f', 'null', '-']);
    expect(info.stderr).toMatch(/Audio: aac.*48000 Hz, stereo/);
    const measured = await run(['-i', path.join(out, 'video.mp4'), '-vn', '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-']);
    const loudness = JSON.parse(measured.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)![0]) as { input_i: string };
    expect(Number(loudness.input_i)).toBeGreaterThan(-15); expect(Number(loudness.input_i)).toBeLessThan(-13);
    await expect(readFile(path.join(out, 'mixed.wav'))).rejects.toThrow();
    await expect(readFile(path.join(out, 'video-audio.mp4'))).rejects.toThrow();
    const before = await readFile(path.join(out, 'video.mp4'));
    expect(await dialogueAudio('base', out, [], 30, 30, abort.signal, 0, root)).toBe(false);
    expect(await readFile(path.join(out, 'video.mp4'))).toEqual(before);
  } finally { clearTimeout(timer); abort.abort(); await rm(root, { recursive: true, force: true }); }
}, 20000);
