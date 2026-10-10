import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
export interface TtsProvider { id: string; synthesize(text: string, voice: string, speed: number): Promise<{ wav: Buffer }> }
export function silentWav(samples: number, rate = 24000): Buffer {
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40); return wav;
}
export function wavFrames(wav: Buffer): number {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid WAV');
  let rate = 0, align = 0, bytes = -1;
  for (let p = 12; p + 8 <= wav.length;) {
    const kind = wav.toString('ascii', p, p + 4), size = wav.readUInt32LE(p + 4); p += 8;
    if (p + size > wav.length) throw new Error('Truncated WAV');
    if (kind === 'fmt ') { rate = wav.readUInt32LE(p + 4); align = wav.readUInt16LE(p + 12); }
    if (kind === 'data') bytes = size;
    p += size + size % 2;
  }
  if (!rate || !align || bytes < 0) throw new Error('Missing WAV format/data');
  return Math.ceil(bytes / align / rate * 30);
}
export const fake: TtsProvider = { id: 'fake', synthesize: async (text, _voice, speed) => ({ wav: silentWav(Math.max(1, Math.ceil([...text].length * 1200 / speed))) }) };
export const macosSay: TtsProvider = {
  id: 'macos-say',
  async synthesize(text, voice, speed) {
    if (process.platform !== 'darwin') throw new Error('macos-say requires macOS');
    if (!ffmpeg) throw new Error('ffmpeg-static binary unavailable');
    const directory = await mkdtemp(path.join(tmpdir(), 'tts-say-'));
    try {
      const listed = (await promisify(execFile)('/usr/bin/say', ['-v', '?'])).stdout;
      const match = listed.split('\n').map(line => /^(.*?)\s+ko_KR\s+#/.exec(line)).find(m => m && (m[1] === voice || m[1]!.startsWith(voice + ' (')));
      if (!match) throw new Error(`Korean macOS voice unavailable: ${voice}`);
      await writeFile(path.join(directory, 'text.txt'), text);
      await promisify(execFile)('/usr/bin/say', ['-v', match[1]!, '-r', String(Math.round(175 * speed)), '-f', path.join(directory, 'text.txt'), '-o', path.join(directory, 'speech.aiff')]);
      await promisify(execFile)(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(directory, 'speech.aiff'), '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', path.join(directory, 'speech.wav')]);
      const wav = await readFile(path.join(directory, 'speech.wav'));
      if (text.trim() && wavFrames(wav) === 0) throw new Error('macos-say returned empty audio; system speech service may be blocked');
      return { wav };
    } finally { await rm(directory, { recursive: true, force: true }); }
  },
};
export const providers: ReadonlyMap<string, TtsProvider> = new Map([[fake.id, fake], [macosSay.id, macosSay]]);
