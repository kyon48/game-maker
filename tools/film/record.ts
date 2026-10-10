import { dialogueAudio } from './audio';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildPack } from '../buildPack';
import { prepareFilm, rehearse } from './rehearse';
import { encoder } from './video';
import { artifacts, croppedEvents } from './artifacts';
import type { FramedEvent } from '../../engine/film/timeline';
// Structural bridge only: tools must not import platform.
interface Frame { rgba: string | null; events: FramedEvent[]; frame: number; done: boolean }
export interface RecordOptions { fps?: 30 | 60; chapter?: string; out?: string; hashes?: boolean; build?: boolean; signal?: AbortSignal }
export async function recordFilm(packId: string, filmId: string, options: RecordOptions = {}) {
  const { pack, film, plugins } = await prepareFilm(packId, filmId);
  const rehearsal = await rehearse(pack, film, plugins);
  for (const warning of rehearsal.warnings) console.warn(warning);
  if (options.chapter && !film.steps.some(step => 'chapter' in step && step.chapter === options.chapter)) throw new Error(`Unknown chapter: ${options.chapter}`);
  const fps = options.fps ?? film.fps ?? 30, out = options.out ?? path.join('out', packId, filmId);
  if (options.build !== false) await buildPack(packId, { recording: true });
  await mkdir(out, { recursive: true });
  let server: Awaited<ReturnType<typeof preview>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined, video: ReturnType<typeof encoder> | undefined;
  const interrupt = () => { void browser?.close().catch(() => {}); };
  const hashes: string[] = [], events: FramedEvent[] = [];
  let start = options.chapter ? -1 : 0, end = Infinity, count = 0;
  try {
    options.signal?.throwIfAborted();
    options.signal?.addEventListener('abort', interrupt);
    server = await preview({ configFile: false, root: process.cwd(), build: { outDir: path.resolve('dist', packId) }, preview: { host: '127.0.0.1', port: 0 } });
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Static server failed');
    browser = await chromium.launch({ channel: 'chromium', headless: true });
    options.signal?.throwIfAborted();
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.addInitScript(({ film, fps }) => { (window as unknown as { __filmRequest: unknown }).__filmRequest = { film, fps }; }, { film, fps });
    await page.goto(`http://127.0.0.1:${address.port}/?record=${encodeURIComponent(filmId)}`);
    await page.waitForFunction(() => !!(window as unknown as { __recorder?: unknown }).__recorder || !!document.querySelector('[role=alert]'));
    if (await page.locator('[role=alert]').count()) throw new Error(await page.locator('[role=alert]').innerText());
    video = encoder(pack.game.screen.width, pack.game.screen.height, fps, path.join(out, 'video.mp4'));
    while (true) {
      options.signal?.throwIfAborted();
      if (errors.length) throw new Error(errors.join('\n'));
      const frame = await page.evaluate(capture => (window as unknown as { __recorder: { next(options: { capture: boolean }): Promise<Frame> } }).__recorder.next({ capture }), start >= 0) as Frame;
      events.push(...frame.events);
      const chapters = frame.events.filter(e => e.type === 'chapter');
      if (start < 0) { const target = chapters.find(e => e.title === options.chapter); if (target) start = target.frame; }
      if (options.chapter && start >= 0) { const next = chapters.find(e => e.title !== options.chapter && e.frame >= start); if (next) end = next.frame; }
      if (frame.frame >= end) break;
      if (start >= 0 && frame.frame >= start && (!frame.done || frame.rgba !== null || frame.events.length > 0)) {
        const rgba = frame.rgba ?? (!frame.done ? await page.evaluate(() => (window as unknown as { __recorder: { frame(): string } }).__recorder.frame()) : null);
        if (rgba !== null) {
          const bytes = Buffer.from(rgba, 'base64');
          if (options.hashes) hashes.push(createHash('sha256').update(bytes).digest('hex'));
          await video.write(bytes); count++;
          if (count % (fps * 10) === 0) console.log(`Recorded ${(count / fps).toFixed(0)}s (${count} frames)`);
        }
      }
      if (frame.done) break;
    }
    if (count === 0) throw new Error('Film/chapter produced no frames');
    await video.finish(); video = undefined;
    const selected = options.chapter ? croppedEvents(events, start, start + count, fps) : events;
    await dialogueAudio(packId, out, selected, fps, count, options.signal, options.chapter ? start : 0);
    const files = artifacts(selected, fps, count, film.name);
    await Promise.all([
      writeFile(path.join(out, 'timeline.json'), JSON.stringify(selected, null, 2) + '\n'),
      writeFile(path.join(out, 'subtitles.srt'), files.subtitles),
      writeFile(path.join(out, 'chapters.txt'), files.chapters),
      writeFile(path.join(out, 'script.md'), files.script),
    ]);
    console.log(`${out}: ${count} frames, ${(count / fps).toFixed(3)}s, ${fps}fps, 1920×1080`);
    return { frames: count, fps, hashes, out, events: selected, startFrame: start };
  } finally {
    options.signal?.removeEventListener('abort', interrupt);
    try { await video?.abort(); } finally {
      try { await browser?.close(); } finally {
        if (server) await new Promise<void>((resolve, reject) => server!.httpServer.close(error => error ? reject(error) : resolve()));
      }
    }
  }
}
