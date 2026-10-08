import assert from 'node:assert/strict';
import { recordFilm } from './record';
const controller = new AbortController();
const interrupt = () => controller.abort();
process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
try {
  const first = await recordFilm('demo', 'visit', { out: 'out/demo/verify/first', hashes: true, signal: controller.signal });
  const second = await recordFilm('demo', 'visit', { out: 'out/demo/verify/second', hashes: true, signal: controller.signal, build: false });
  assert.deepEqual(second.hashes, first.hashes);
  assert.ok(first.hashes.length > 0);
  const chapter = await recordFilm('demo', 'visit', { out: 'out/demo/verify/chapter', chapter: '첫 인사', hashes: true, signal: controller.signal, build: false });
  assert.deepEqual(chapter.hashes, first.hashes.slice(chapter.startFrame, chapter.startFrame + chapter.frames));
  console.log(`film:verify passed: ${first.frames} frame RGBA hashes match; ${chapter.frames} chapter frames match full recording`);
} catch (error) { console.error(String(error)); process.exitCode = 1; } finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); }
