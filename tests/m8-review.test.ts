import { expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, stat, utimes, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { rewritePack } from '../tools/migratePack';
import { nodePluginRuntime } from '../tools/loadPlugins';
import { validatePack } from '../engine/data/validator/validate';
import { FsSource } from '../tools/fsSource';
import { fixtureSource } from './fixtureSource';
import { builtinCatalog } from '../engine/sim/commands';
import { loadSave } from '../engine/sim/state/loadSave';
import { packRuntimePlugin } from '../tools/vitePackRuntime';
import { execFileSync } from 'node:child_process';
import type { ResolvedConfig } from 'vite';
it('missing plugins produce V3 file/pointer diagnostics in both Node loading and shared validation', async () => {
  const source = await fixtureSource([{ op: 'set', file: 'game.json', pointer: '/plugins', value: ['missing'] }]);
  const runtime = await nodePluginRuntime(source, 'tests/fixtures/base');
  for (const options of [runtime.validationOptions, { commands: builtinCatalog() }]) {
    const result = await validatePack(source, 'base', options);
    expect(result.pack).toBeUndefined();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'V3', file: 'game.json', pointer: '/plugins/0' }));
  }
});
it('virtual plugin module imports existing files only and isolates the missing file to its pack loader', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'missing-plugin-'));
  for (const id of ['good', 'broken']) {
    await mkdir(path.join(root, 'packs', id, 'plugins'), { recursive: true });
    await writeFile(path.join(root, 'packs', id, 'game.json'), JSON.stringify({ plugins: [id === 'good' ? 'present' : 'missing'] }));
  }
  await writeFile(path.join(root, 'packs/good/plugins/present.ts'), 'export default {};');
  const plugin = packRuntimePlugin();
  const configure = plugin.configResolved as (config: ResolvedConfig) => Promise<void>;
  await configure({ root, base: '/' } as ResolvedConfig);
  const load = plugin.load as (id: string) => Promise<string>;
  const code = await load('\0pack-plugins');
  expect(code).toContain('import('); expect(code).toContain('present.ts');
  expect(code).not.toContain('import(' + JSON.stringify(path.join(root, 'packs/broken/plugins/missing.ts')));
  // Execute just the broken loader; good pack imports remain lazy.
  const loaders = new Function(code.replace('export default', 'return'))() as Record<string, () => Promise<unknown>>;
  await expect(loaders.broken!()).rejects.toMatchObject({ diagnostics: [expect.objectContaining({ code: 'V3', file: 'game.json', pointer: '/plugins/0' })] });
});
it('latest packs are byte/mtime unchanged and migrations write only changed JSON files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'migration-noop-'));
  await cp('tests/fixtures/base', root, { recursive: true });
  const game = path.join(root, 'game.json'), map = path.join(root, 'maps/map.tmj');
  await writeFile(game, '{"id":"base","formatVersion":1}');
  for (const file of [game, map]) await utimes(file, 1000, 1000);
  const before = await readFile(game, 'utf8');
  await rewritePack(root);
  expect(await readFile(game, 'utf8')).toBe(before); expect((await stat(game)).mtimeMs).toBe(1000000);
  await rewritePack(root, 2, [{ from: 1, to: 2, up: files => files }]);
  expect((await stat(map)).mtimeMs).toBe(1000000);
  expect(JSON.parse(await readFile(game, 'utf8')).formatVersion).toBe(2);
});
it('loadSave hooks are followed by declaration/type/self/position normalization without running the hook again', async () => {
  const pack = (await validatePack(new FsSource('tests/fixtures/base'), 'base', { commands: builtinCatalog() })).pack!;
  let calls = 0;
  const result = loadSave(JSON.stringify({ packId: 'base', saveVersion: 1, gameVersion: 'old' }), pack.game, pack.events, pack.maps, { loadSave: state => {
    calls++;
    return { ...state, map: 'unknown', x: -4, dir: 'bad', flags: { met: 'bad', injected: true }, vars: { n: 1.5, injected: 7 }, selfFlags: { 'map:npc:valid': true, 'map:missing:bad': true, 'map:npc:wrong': 4 } } as unknown as typeof state;
  } });
  expect(calls).toBe(1); expect(result.state).toEqual({ ...pack.game.start, flags: pack.game.state.flags, vars: pack.game.state.vars, selfFlags: { 'map:npc:valid': true } });
  expect(result.warnings).toContain('Dropped undeclared flag: injected');
});

it.each(['validate', 'scenarios', 'build'])('%s CLI reports missing plugins as diagnostics rather than module resolution exceptions', async command => {
  const root = await mkdtemp(path.join(tmpdir(), 'missing-plugin-cli-'));
  await cp('tests/fixtures/base', path.join(root, 'packs/base'), { recursive: true });
  const gameFile = path.join(root, 'packs/base/game.json');
  const game = JSON.parse(await readFile(gameFile, 'utf8')); game.plugins = ['missing'];
  await writeFile(gameFile, JSON.stringify(game));
  let output = '';
  try { execFileSync(process.execPath, ['--import', path.resolve('node_modules/tsx/dist/loader.mjs'), path.resolve(`tools/${command}.ts`), 'base'], { cwd: root, encoding: 'utf8', stdio: 'pipe' }); }
  catch (error) { const failed = error as { status: number; stdout: string; stderr: string }; expect(failed.status).toBe(1); output = String(failed.stdout) + String(failed.stderr); }
  expect(output).toContain('V3'); expect(output).toContain('game.json/plugins/0');
  expect(output).not.toContain('Cannot find module'); expect(output).not.toContain('ERR_MODULE_NOT_FOUND');
});
