import { writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { FsSource } from './fsSource';
import { migratePack, packMigrations } from '../engine/data/migrations';
import type { PackMigration } from '../engine/data/migrations';
import { CURRENT_FORMAT_VERSION } from '../engine/data/schema/game';
export async function rewritePack(root: string, target = CURRENT_FORMAT_VERSION, migrations: readonly PackMigration[] = packMigrations): Promise<void> {
  const source = new FsSource(root), files = new Map<string, unknown>();
  for (const file of (await source.listFiles()).filter(file => /\.(json|tmj|tsj)$/.test(file)).sort()) files.set(file, await source.readJson(file));
  const migrated = migratePack(files, target, migrations);
  if ((files.get('game.json') as { formatVersion: number }).formatVersion === target) return;
  for (const [file, value] of migrated) {
    if (file === 'game.json' || JSON.stringify(files.get(file)) === JSON.stringify(value)) continue;
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), JSON.stringify(value, null, 2) + '\n');
  }
  for (const file of files.keys()) if (!migrated.has(file)) await unlink(path.join(root, file));
  if (JSON.stringify(files.get('game.json')) !== JSON.stringify(migrated.get('game.json'))) await writeFile(path.join(root, 'game.json'), JSON.stringify(migrated.get('game.json'), null, 2) + '\n');
}
