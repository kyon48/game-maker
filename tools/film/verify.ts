import assert from 'node:assert/strict';
import { recordFilm } from './record';
const controller = new AbortController();
const interrupt = () => controller.abort();
process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
try {
  const first = await recordFilm('demo', 'visit', { out: 'out/demo/verify/first', hashes: true, verifyCapture: true, signal: controller.signal });
  const second = await recordFilm('demo', 'visit', { out: 'out/demo/verify/second', hashes: true, verifyCapture: true, signal: controller.signal, build: false });
  assert.deepEqual(second.hashes, first.hashes);
  assert.ok(first.hashes.length > 0);
  assert.ok(first.captureChecks >= 3, 'Expected samples including portrait dialogue');
  const chapter = await recordFilm('demo', 'visit', { out: 'out/demo/verify/chapter', chapter: '첫 인사', hashes: true, verifyCapture: true, signal: controller.signal, build: false });
  assert.deepEqual(chapter.hashes, first.hashes.slice(chapter.startFrame, chapter.startFrame + chapter.frames));
  const puzzle = await recordFilm('manor', 'lamps', { out: 'out/manor/verify/first', hashes: true, verifyCapture: true, signal: controller.signal });
  const puzzleAgain = await recordFilm('manor', 'lamps', { out: 'out/manor/verify/second', hashes: true, signal: controller.signal, build: false });
  assert.deepEqual(puzzleAgain.hashes, puzzle.hashes);
  assert.ok(puzzle.frames > 0);
  console.log(`scene film:verify passed: ${puzzle.frames} puzzle frame hashes match`);
  console.log(`film:verify passed: ${first.frames} frame RGBA hashes match; ${chapter.frames} chapter frames match full recording; ${first.captureChecks + second.captureChecks + chapter.captureChecks} browser/decoded RGBA samples match`);
} catch (error) { console.error(String(error)); process.exitCode = 1; } finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); }
