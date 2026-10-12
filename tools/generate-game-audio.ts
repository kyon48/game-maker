import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
const pack = process.argv[2];
if (!pack || !/^[a-z][a-z0-9_]*$/.test(pack) || !ffmpeg) throw new Error('Usage: tsx tools/generate-game-audio.ts <pack>');
const folder = path.join('packs', pack, 'assets/audio'); await mkdir(folder, { recursive: true });
// Original synthesized tones, dedicated to the public domain under CC0-1.0.
const sounds = [
  { id: 'quiet', seconds: 8, signal: '0.025*(sin(2*PI*220*t)+sin(2*PI*261.625565*t)+sin(2*PI*329.627557*t))/3', ogg: true },
  { id: 'mystery', seconds: 8, signal: '0.025*(sin(2*PI*146.832384*t)+sin(2*PI*174.614116*t)+sin(2*PI*220*t))/3', ogg: true },
  { id: 'get', seconds: 0.4, signal: '0.12*sin(2*PI*(660*t+220*t*t))', ogg: false },
  { id: 'door', seconds: 0.25, signal: '0.16*sin(2*PI*(100*t-60*t*t))', ogg: false },
  { id: 'confirm', seconds: 0.15, signal: '0.1*sin(2*PI*880*t)', ogg: false },
];
for (const sound of sounds) {
  await promisify(execFile)(ffmpeg, ['-hide_banner', '-nostdin', '-y', '-f', 'lavfi', '-i', `aevalsrc=${sound.signal}:s=48000:d=${sound.seconds}`, '-af', `afade=t=in:d=0.01,afade=t=out:st=${sound.seconds - 0.05}:d=0.05`, '-ac', '2', ...(sound.ogg ? ['-c:a', 'libvorbis', '-q:a', '4'] : ['-c:a', 'pcm_s16le']), path.join(folder, sound.id + (sound.ogg ? '.ogg' : '.wav'))]);
}
console.log(`Generated CC0 audio: ${folder}`);
