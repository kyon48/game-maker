export const SAVE_VERSION = 1;
export interface SaveMigration { from: number; to: number; up(save: Record<string, unknown>): Record<string, unknown> }
export const saveMigrations: readonly SaveMigration[] = [];
export function migrateSave(save: Readonly<Record<string, unknown>>, target = SAVE_VERSION, migrations = saveMigrations): Record<string, unknown> {
  if (!Number.isSafeInteger(target) || target < 0) throw new Error('Invalid target save version');
  let current = JSON.parse(JSON.stringify(save)) as Record<string, unknown>;
  let version = current.saveVersion;
  if (!Number.isSafeInteger(version) || (version as number) < 0 || (version as number) > target) throw new Error('Invalid save migration version');
  while ((version as number) < target) {
    const candidates = migrations.filter(step => step.from === version);
    if (candidates.length !== 1 || candidates[0]!.to !== (version as number) + 1) throw new Error(`Missing or ambiguous save migration: ${version}`);
    const next = candidates[0]!.up(current);
    if (next.saveVersion !== candidates[0]!.to) throw new Error('Save migration did not advance its version');
    current = next; version = current.saveVersion;
  }
  return current;
}
