import { expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { migratePack, packMigrations } from '../engine/data/migrations';
import type { PackMigration } from '../engine/data/migrations';
import { rewritePack } from '../tools/migratePack';
it('current pack migration list is empty and migration runner leaves its input untouched', () => {
  expect(packMigrations).toEqual([]);
  const files = new Map<string, unknown>([['game.json', { id: 'test', formatVersion: 1, title: 'Test' }]]);
  const migration: PackMigration = { from: 1, to: 2, up(files) { (files.get('game.json') as Record<string, unknown>).added = true; return files; } };
  expect(migratePack(files, 2, [migration]).get('game.json')).toEqual({ id: 'test', formatVersion: 2, title: 'Test', added: true });
  expect(files.get('game.json')).toEqual({ id: 'test', formatVersion: 1, title: 'Test' });
  expect(() => migratePack(files, 2)).toThrow('Missing'); expect(() => migratePack(files, 2, [migration, migration])).toThrow('ambiguous');
  expect(() => migratePack(files, 2, [{ ...migration, up: files => { files.set('../outside.json', {}); return files; } }])).toThrow('Path escapes');
});
it('fake 1→2 migration rewrites JSON/Tiled files, creates/deletes files and preserves key order and two-space formatting', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'pack-migrate-')); await mkdir(path.join(root, 'maps'));
  await writeFile(path.join(root, 'game.json'), JSON.stringify({ id: 'test', formatVersion: 1, title: 'Test' }));
  await writeFile(path.join(root, 'maps/map.tmj'), JSON.stringify({ type: 'map', width: 3 }));
  await writeFile(path.join(root, 'old.json'), '{}'); await writeFile(path.join(root, 'asset.bin'), 'unchanged');
  const migration: PackMigration = { from: 1, to: 2, up(files) {
    (files.get('game.json') as Record<string, unknown>).added = 'new';
    (files.get('maps/map.tmj') as Record<string, unknown>).height = 2;
    files.delete('old.json'); files.set('new.json', { first: 1, second: 2 }); return files;
  } };
  await rewritePack(root, 2, [migration]);
  expect(await readFile(path.join(root, 'game.json'), 'utf8')).toBe('{\n  "id": "test",\n  "formatVersion": 2,\n  "title": "Test",\n  "added": "new"\n}\n');
  expect(await readFile(path.join(root, 'maps/map.tmj'), 'utf8')).toBe('{\n  "type": "map",\n  "width": 3,\n  "height": 2\n}\n');
  expect(await readFile(path.join(root, 'new.json'), 'utf8')).toBe('{\n  "first": 1,\n  "second": 2\n}\n');
  await expect(stat(path.join(root, 'old.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readFile(path.join(root, 'asset.bin'), 'utf8')).toBe('unchanged');
});
