import { expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildPack } from '../tools/buildPack';
import { packLocation } from '../engine/platform/packLocation';
import { FetchSource } from '../engine/platform/fetchSource';
import type { PackRuntime } from '../engine/data/buildInfo';
it('build rejects invalid packs before touching an existing output directory', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'invalid-build-'));
  await mkdir(path.join(root, 'packs'), { recursive: true }); await cp('tests/fixtures/base', path.join(root, 'packs/base'), { recursive: true });
  await writeFile(path.join(root, 'packs/base/characters.json'), JSON.stringify({ hero: { placeholder: '#fff', moveTicks: 0 } }));
  const outDir = path.join(root, 'out'); await mkdir(outDir); await writeFile(path.join(outDir, 'previous.txt'), 'keep');
  await expect(buildPack('base', { root, outDir })).rejects.toThrow('Validation failed');
  expect(await readFile(path.join(outDir, 'previous.txt'), 'utf8')).toBe('keep');
});
it('build emits pack data, real metadata and custom base, excluding tests/plugins and the dev validator', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'valid-build-')), outDir = path.join(root, 'out');
  const info = await buildPack('demo', { outDir, base: '/subdir/' });
  expect(JSON.parse(await readFile(path.join(outDir, 'build-info.json'), 'utf8'))).toEqual(info);
  expect(info).toMatchObject({ gameId: 'demo', gameVersion: '0.1.0', engineVersion: JSON.parse(await readFile('package.json', 'utf8')).version, formatVersion: 1, apiVersion: 1 });
  expect(info.commit).toMatch(/^[0-9a-f]+$/); expect(Number.isNaN(Date.parse(info.builtAt))).toBe(false);
  expect(await readFile(path.join(outDir, 'index.html'), 'utf8')).toContain('/subdir/assets/');
  expect(await readFile(path.join(outDir, 'pack/game.json'), 'utf8')).toBe(await readFile('packs/demo/game.json', 'utf8'));
  for (const folder of ['tests', 'plugins', 'films']) await expect(stat(path.join(outDir, 'pack', folder))).rejects.toMatchObject({ code: 'ENOENT' });
  const files = await import('node:fs/promises').then(fs => fs.readdir(path.join(outDir, 'assets')));
  expect(files.some(name => name.startsWith('validate-'))).toBe(false);
  const js = (await Promise.all(files.filter(name => name.endsWith('.js')).map(name => readFile(path.join(outDir, 'assets', name), 'utf8')))).join('\n');
  expect(js).not.toContain('Auto page may repeat indefinitely'); expect(js).not.toContain('CREDITS.md is required');
});
it('path resolution uses dev manifest/base or pack-local production data, fixing the pack and versioning every file URL', () => {
  const runtime: PackRuntime = { fixedPackId: null, roots: { example: '/nested/packs/example/' }, inventory: '/nested/__pack-files', cacheKey: null, buildInfo: null, engineVersion: '1' };
  expect(packLocation(runtime, 'https://example.test/nested/?pack=example')).toEqual({ id: 'example', root: '/nested/packs/example/', inventory: '/nested/__pack-files?pack=example', cacheKey: undefined });
  const deployed = packLocation({ ...runtime, fixedPackId: 'example', inventory: null, cacheKey: '1.0.0-abc' }, 'https://example.test/sub/game/index.html?pack=ignored');
  expect(deployed).toEqual({ id: 'example', root: 'https://example.test/sub/game/pack/', inventory: undefined, cacheKey: '1.0.0-abc' });
  const source = new FetchSource(deployed.root, undefined, deployed.cacheKey);
  expect(source.url('maps/map.tmj')).toBe('https://example.test/sub/game/pack/maps/map.tmj?v=1.0.0-abc');
  expect(source.url('assets/character sheet.png')).toContain('character%20sheet.png?v=1.0.0-abc');
});
