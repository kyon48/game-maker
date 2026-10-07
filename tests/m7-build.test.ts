import { expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { buildPack } from '../tools/buildPack';
import { API_VERSION } from '../engine/api';
it('build bundles only the target pack plugin and omits the other pack plugin and all TS sources', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'plugin-build-'));
  await cp('index.html', path.join(root, 'index.html')); await cp('package.json', path.join(root, 'package.json'));
  await symlink(path.resolve('engine'), path.join(root, 'engine'), 'dir'); await symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  await mkdir(path.join(root, 'packs'));
  for (const id of ['target', 'other']) {
    const packRoot = path.join(root, 'packs', id); await cp('tests/fixtures/base', packRoot, { recursive: true }); await mkdir(path.join(packRoot, 'plugins'));
    const game = JSON.parse(await readFile(path.join(packRoot, 'game.json'), 'utf8')); game.id = id; game.plugins = ['sample']; await writeFile(path.join(packRoot, 'game.json'), JSON.stringify(game));
    await writeFile(path.join(packRoot, 'plugins/sample.ts'), `import {API_VERSION} from '@engine/api'; import {Type} from '@sinclair/typebox'; export default {apiVersion: API_VERSION, id:'sample', register(api){ api.commands.register('x_marker',{args:Type.Object({}),run(_args,ctx){return ctx.showText({text:'M7_${id.toUpperCase()}_PLUGIN_MARKER'});}});}};`);
  }
  const outDir = path.join(root, 'out'), info = await buildPack('target', { root, outDir });
  expect(info.apiVersion).toBe(API_VERSION);
  const assets = await readdir(path.join(outDir, 'assets'));
  const code = (await Promise.all(assets.filter(file => file.endsWith('.js')).map(file => readFile(path.join(outDir, 'assets', file), 'utf8')))).join('\n');
  expect(code).toContain('M7_TARGET_PLUGIN_MARKER'); expect(code).not.toContain('M7_OTHER_PLUGIN_MARKER');
  const files = await new (await import('../tools/fsSource')).FsSource(outDir).listFiles();
  expect(files.some(file => file.startsWith('pack/plugins/') || file.endsWith('.ts'))).toBe(false);
});
