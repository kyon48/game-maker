import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';
import { productionProcess } from './productionProcess';
import { packDirectory, packPaths } from './packPaths';
import { FsSource } from './fsSource';
import { prepareFilm, rehearse } from './film/rehearse';
import { recordFilm } from './film/record';
import { readStories } from './story/files';
import { parseStoryConfig } from './story/config';
import { review, description } from './releaseReport';
import type { Measurement } from './releaseReport';
export async function release(pack: string, name = 'main', signal?: AbortSignal) {
  const directory = packDirectory(pack), source = new FsSource(directory), run = promisify(execFile), warnings: string[] = [];
  const cli = async (tool: string, args: string[]) => {
    try {
      const result = await productionProcess(process.execPath, ['--import', createRequire(import.meta.url).resolve('tsx'), fileURLToPath(new URL(tool, import.meta.url)), ...args], signal); process.stdout.write(result.stdout); process.stderr.write(result.stderr);
      warnings.push(...(result.stdout + result.stderr).split('\n').filter(line => /경고:|warning|overlaps|Missing voice/i.test(line)));
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string }; process.stdout.write(failure.stdout ?? ''); process.stderr.write(failure.stderr ?? ''); throw error;
    }
  };
  const story = await source.exists('story');
  if (story) await cli('./story/index.ts', ['build', pack]);
  else if (await source.exists('voices.json')) await cli('./tts.ts', [pack, '--film', name]);
  if (story && name !== 'main' && await source.exists('voices.json')) await cli('./tts.ts', [pack, '--film', name]);
  const prepared = await prepareFilm(pack, name), rehearsal = await rehearse(prepared.pack, prepared.film, prepared.plugins); warnings.push(...rehearsal.warnings);
  if (story) warnings.push(...(await readStories(pack)).diagnostics.filter(d => d.level === 'warning').map(d => `${d.file}:${d.line} ${d.code} ${d.message}`));
  const recording = await recordFilm(pack, name, { signal }), destination = path.join(packPaths(pack).output, name, 'release');
  if (!ffmpeg) throw new Error('ffmpeg-static unavailable');
  const measured = await run(ffmpeg, ['-hide_banner', '-nostdin', '-i', path.join(recording.out, 'video.mp4'), '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], { signal, maxBuffer: 16 * 1024 * 1024 });
  const sample = measured.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0];
  const analysis = sample ? JSON.parse(sample) as { input_i: string; input_tp: string } : undefined;
  const duration = measured.stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!duration) throw new Error('Could not measure video duration');
  const measurement: Measurement = { duration: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]), lufs: analysis && Number.isFinite(Number(analysis.input_i)) ? Number(analysis.input_i) : null, peak: analysis && Number.isFinite(Number(analysis.input_tp)) ? Number(analysis.input_tp) : null };
  const config = await source.exists('story/story.config.json') ? parseStoryConfig(await source.readJson('story/story.config.json')) : {};
  const credits = await readFile(path.join(directory, 'CREDITS.md'), 'utf8'), chapters = await readFile(path.join(recording.out, 'chapters.txt'), 'utf8');
  const template = await source.exists('story/release.md') ? await readFile(path.join(directory, 'story/release.md'), 'utf8') : '# {title}\n\n합성 음성(TTS) 사용\n\n길이: {duration}\n\n{chapters}\n\n{credits}\n';
  await mkdir(destination, { recursive: true });
  for (const file of ['video.mp4', 'subtitles.srt', 'chapters.txt', 'script.md']) await copyFile(path.join(recording.out, file), path.join(destination, file));
  await writeFile(path.join(destination, 'description.md'), description(template, { title: prepared.pack.game.title, chapters, credits, duration: measurement.duration.toFixed(3) + '초' }));
  await writeFile(path.join(destination, 'review.md'), review({ measurement, targetMinutes: config.targetMinutes, events: recording.events, fps: recording.fps, warnings: [...new Set(warnings)], placeholders: Object.entries(prepared.pack.characters).filter(([, c]) => 'placeholder' in c).map(([id]) => id), credits, voices: new Set(Object.keys(prepared.pack.voices ?? {})) }));
  console.log(`Release: ${destination}`); return { destination, measurement };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const controller = new AbortController(), interrupt = () => controller.abort(); process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  try { const [pack, ...args] = process.argv.slice(2); if (!pack || args.length && (args.length !== 2 || args[0] !== '--film' || !args[1])) throw new Error('Usage: release <packId> [--film main]'); await release(pack, args[1] ?? 'main', controller.signal); }
  catch (error) { console.error(String(error)); process.exitCode = 1; }
  finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); }
}
