import { expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { syncSchemaFiles } from '../tools/schemaFiles';
const schemas = new Map([['test.schema.json', { type: 'string' }]]);
it('check reports missing files without creating a directory', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'schema-check-')), directory = path.join(root, 'schemas');
  expect(await syncSchemaFiles(directory, schemas, true)).toEqual(['Missing schema: test.schema.json']);
  await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('check accepts matching files without changing their contents or timestamps', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'schema-check-'));
  await syncSchemaFiles(directory, schemas, false);
  const file = path.join(directory, 'test.schema.json'), before = await stat(file);
  expect(await syncSchemaFiles(directory, schemas, true)).toEqual([]);
  expect((await stat(file)).mtimeMs).toBe(before.mtimeMs);
  expect(await readFile(file, 'utf8')).toBe(JSON.stringify(schemas.get('test.schema.json'), null, 2) + '\n');
});
it('check rejects outdated and extra files without overwriting or deleting them', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'schema-check-'));
  await writeFile(path.join(directory, 'test.schema.json'), 'stale\n');
  await writeFile(path.join(directory, 'extra.schema.json'), '{}\n');
  expect(await syncSchemaFiles(directory, schemas, true)).toEqual(['Outdated schema: test.schema.json', 'Unexpected schema: extra.schema.json']);
  expect(await readFile(path.join(directory, 'test.schema.json'), 'utf8')).toBe('stale\n');
  expect(await readdir(directory)).toEqual(['extra.schema.json', 'test.schema.json']);
});
it('schemas --check CLI exits with 1 on missing schemas and leaves the cwd untouched', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'schema-cli-'));
  await expect(promisify(execFile)(process.execPath, ['--import', createRequire(path.resolve('package.json')).resolve('tsx'), path.resolve('tools/schemas.ts'), '--check'], { cwd })).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/Missing schema: game.schema.json[\s\S]*npm run schemas 를 실행해 다시 생성하세요\n$/) });
  expect(await readdir(cwd)).toEqual([]);
});
