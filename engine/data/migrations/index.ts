import { CURRENT_FORMAT_VERSION } from '../schema/game';
import { packPath } from '../loader/path';
export interface PackMigration { from: number; to: number; up(files: Map<string, unknown>): Map<string, unknown> }
export const packMigrations: readonly PackMigration[] = [];
export function migratePack(files: ReadonlyMap<string, unknown>, target = CURRENT_FORMAT_VERSION, migrations = packMigrations): Map<string, unknown> {
  let current = new Map([...files].map(([file, value]) => [file, JSON.parse(JSON.stringify(value)) as unknown]));
  const initial = current.get('game.json') as { formatVersion?: unknown } | undefined;
  let version = initial?.formatVersion;
  if (!Number.isSafeInteger(target) || target < 1 || !Number.isSafeInteger(version) || (version as number) < 1 || (version as number) > target) throw new Error('Unsupported pack format version');
  while ((version as number) < target) {
    const candidates = migrations.filter(step => step.from === version);
    if (candidates.length !== 1 || candidates[0]!.to !== (version as number) + 1) throw new Error(`Missing or ambiguous pack migration: ${version}`);
    current = candidates[0]!.up(current); version = candidates[0]!.to;
    if (!current.has('game.json')) throw new Error('Pack migration removed game.json');
  }
  for (const [file, value] of current) {
    if (packPath('', file) !== file || !/\.(json|tmj|tsj)$/.test(file)) throw new Error(`Invalid migrated JSON path: ${file}`);
    if (JSON.stringify(value) === undefined) throw new Error(`Invalid migrated JSON value: ${file}`);
  }
  const game = current.get('game.json');
  if (!game || typeof game !== 'object' || Array.isArray(game)) throw new Error('Invalid migrated game.json');
  (game as Record<string, unknown>).formatVersion = target;
  return current;
}
