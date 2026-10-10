import { mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
const [pack] = process.argv.slice(2);
if (!pack || !/^[a-z][a-z0-9_]*$/.test(pack)) throw new Error('Usage: node --import tsx tools/generate-film-music.ts <pack>');
if (!ffmpeg) throw new Error('ffmpeg-static unavailable');
const output = path.join('packs', pack, 'assets/music/harbor.ogg');
await mkdir(path.dirname(output), { recursive: true });
// Original eight-second A-minor sine chord. Integer cycles and edge fades make a quiet loop.
await promisify(execFile)(ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'aevalsrc=0.06*(sin(2*PI*220*t)+sin(2*PI*261.625*t)+sin(2*PI*329.625*t))/3:s=48000:d=8', '-af', 'afade=t=in:d=0.1,afade=t=out:st=7.9:d=0.1', '-ac', '2', '-c:a', 'libvorbis', '-q:a', '4', output]);
console.log(output);
