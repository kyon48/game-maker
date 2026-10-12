import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { packLocations, packLocation, packPaths } from '../tools/packPaths';
import { packIds } from '../tools/packs';
import { productionProcess } from '../tools/productionProcess';
import { newStory } from '../tools/story/new';
import { description, review } from '../tools/releaseReport';

import { FsSource } from '../tools/fsSource';
const temporary: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(temporary.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
const temp = async () => { const dir = await mkdtemp(path.join(tmpdir(), 'v4-test-')); temporary.push(dir); return dir; };
it('external containers and direct packs resolve, default all stays local, duplicates fail and outputs/caches stay with private packs', async () => {
  const root = await temp(), external = await temp(); await mkdir(path.join(root, 'packs/public'), { recursive: true }); await mkdir(path.join(external, 'private'));
  await writeFile(path.join(external, 'private/game.json'), '{"id":"private"}'); vi.stubEnv('GAME_PACKS_PATH', external);
  expect(await packIds('--all', root, false)).toEqual(['public']); expect(await packIds('--all', root, true)).toEqual(['private', 'public']);
  const located = packLocation('private', root); expect(located.external).toBe(true);
  expect(packPaths('private', root).cache).toBe(path.join(located.directory, '.cache/voice/private')); expect(packPaths('private', root).output).toBe(path.join(located.directory, 'out')); expect(packPaths('private', root).build).toBe(path.join(located.directory, '.cache/build'));
  vi.stubEnv('GAME_PACKS_PATH', path.join(external, 'private')); expect(packLocation('private', root).directory).toBe(located.directory);
  await mkdir(path.join(root, 'packs/private')); expect(() => packLocations(root)).toThrow('Duplicate pack');
});
it('description replaces known placeholders once; review computes actual chapter/voice/face/credits/goal data', () => {
  expect(description('{title}\n{credits}\n{duration}', { title: 'Title', chapters: '', credits: '{title}', duration: '10s' })).toBe('Title\n{title}\n10s');
  const text = review({ measurement: { duration: 60, lufs: -14.02, peak: -1 }, targetMinutes: 2, events: [{ type: 'chapter', tick: 0, frame: 0, title: 'One' }, { type: 'chapter', tick: 1800, frame: 900, title: 'Two' }, { type: 'text-start', tick: 1, frame: 0, id: 1, text: 'Hello', plainText: 'Hello', speaker: 'A' }], fps: 30, warnings: ['S014 long', 'Narration overlaps voiced dialogue'], placeholders: ['npc'], credits: '{source}', voices: new Set() });
  for (const expected of ['60.000초', '-1.00분', '-14.02 LUFS', '-1 dBTP', 'One: 30초', 'Two: 30초', '1/1', 'A', 'npc', '{source}', 'S014 long', 'Narration overlaps', '- [ ]']) expect(text).toContain(expected);
});
it('fresh external story builds immediately, refuses overwrites and releases six files without public artifacts', async () => {
  const root = await temp(), destination = path.join(root, 'starter'); await newStory('starter', { dir: destination, provider: 'fake' });
  await expect(newStory('starter', { dir: destination, provider: 'fake' })).rejects.toThrow();
  const game = JSON.parse(await readFile(path.join(destination, 'game.json'), 'utf8')); game.plugins = ['example'];
  await writeFile(path.join(destination, 'game.json'), JSON.stringify(game)); await mkdir(path.join(destination, 'plugins'));
  await writeFile(path.join(destination, 'plugins/example.ts'), `import { Type } from '@sinclair/typebox'; import { API_VERSION } from '@engine/api'; export default { id:'example', apiVersion:API_VERSION, register(api) { api.commands.register('x_example',{args:Type.Object({}),run(){}}); } };`);
  const run = promisify(execFile), env = { ...process.env, GAME_PACKS_PATH: root };
  await run(process.execPath, ['--import', 'tsx', 'tools/story/index.ts', 'build', 'starter'], { env, timeout: 30000 });
  expect((await readFile(path.join(destination, 'story/.compiled.json'), 'utf8'))).toContain('films/main.film.json');
  await run(process.execPath, ['--import', 'tsx', 'tools/release.ts', 'starter'], { env, timeout: 45000, maxBuffer: 4 * 1024 * 1024 });
  expect((await readdir(path.join(destination, 'out/main/release'))).sort()).toEqual(['chapters.txt', 'description.md', 'review.md', 'script.md', 'subtitles.srt', 'video.mp4']);
  expect(await readFile(path.join(destination, 'out/main/release/description.md'), 'utf8')).toContain('합성 음성(TTS) 사용');
  expect(await readFile(path.join(destination, 'out/main/release/review.md'), 'utf8')).toContain('출처 빈 칸:');
  expect(await new FsSource('.').exists('out/starter')).toBe(false); expect(await new FsSource('.').exists('.cache/voice/starter')).toBe(false); expect(await new FsSource('.').exists('dist/starter')).toBe(false);
}, 60000);
it('external TS plugins import the public API and shared TypeBox without a node_modules link', async () => {
  const root = await temp(), pack = path.join(root, 'pluginpack'); await mkdir(path.join(pack, 'plugins'), { recursive: true });
  await writeFile(path.join(pack, 'game.json'), JSON.stringify({ plugins: ['example'] }));
  await writeFile(path.join(pack, 'plugins/example.ts'), `import { Type } from '@sinclair/typebox'; import { API_VERSION } from '@engine/api'; export default { id:'example', apiVersion:API_VERSION, register(api) { api.commands.register('x_example',{args:Type.Object({}),run(){}}); } };`);
  const script = `import { nodePluginRuntime } from './tools/loadPlugins.ts'; import { FsSource } from './tools/fsSource.ts'; const runtime=await nodePluginRuntime(new FsSource(process.argv[1]),process.argv[1]); console.log(JSON.stringify({diagnostics:runtime.diagnostics, command:runtime.validationOptions.commands.has('x_example')}));`;
  const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, pack]);
  expect(JSON.parse(result.stdout)).toEqual({ diagnostics: [], command: true });
  const dev = `import { createServer } from 'vite'; const server=await createServer({server:{port:0}}); try { await server.listen(); const address=server.httpServer.address(); const response=await fetch('http://localhost:'+address.port+'/packs/pluginpack/game.json'); if(!response.ok)throw Error('External HTTP failed'); const json=await response.json(); if(json.plugins[0]!=='example')throw Error('Wrong pack'); const plugins=await server.ssrLoadModule('virtual:pack-plugins'); const modules=await plugins.default.pluginpack(); if(modules[0].id!=='example')throw Error('External Vite plugin failed'); } finally {await server.close();}`;
  await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', dev], { env: { ...process.env, GAME_PACKS_PATH: root }, timeout: 15000 });
});

it('production stages terminate descendants on failure and cancellation', async () => {
  const root = await temp();
  for (const abort of [false, true]) {
    const pidFile = path.join(root, abort ? 'abort.pid' : 'failure.pid'), controller = new AbortController();
    const script = `const {spawn}=require('node:child_process'); const fs=require('node:fs'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); fs.writeFileSync(process.argv[1],String(child.pid)); ${abort ? 'setInterval(()=>{},1000)' : 'process.exit(1)'};`;
    const completion = productionProcess(process.execPath, ['-e', script, pidFile], controller.signal).then(() => false, () => true);
    let pid = 0;
    for (let attempt = 0; attempt < 100 && !pid; attempt++) { pid = Number(await readFile(pidFile, 'utf8').catch(() => '0')); if (!pid) await new Promise(resolve => setTimeout(resolve, 10)); }
    expect(pid).toBeGreaterThan(0); if (abort) controller.abort(); expect(await completion).toBe(true);
    let alive = true;
    for (let attempt = 0; attempt < 100 && alive; attempt++) { try { process.kill(pid, 0); } catch { alive = false; } if (alive) await new Promise(resolve => setTimeout(resolve, 10)); }
    expect(alive).toBe(false);
  }
});
