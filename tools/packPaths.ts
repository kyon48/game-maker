import { existsSync, readdirSync, statSync, realpathSync, readFileSync } from 'node:fs';
import path from 'node:path';
export interface PackLocation { id: string; directory: string; external: boolean }
const validId = /^[a-z][a-z0-9_]*$/;
export function packLocations(root = process.cwd(), includeExternal = true): Map<string, PackLocation> {
  const local = path.join(existsSync(root) ? realpathSync(root) : path.resolve(root), 'packs'), result = new Map<string, PackLocation>();
  const add = (id: string, directory: string) => {
    if (!validId.test(id)) return;
    const canonical = realpathSync(directory), previous = result.get(id);
    if (previous && previous.directory !== canonical) throw new Error(`Duplicate pack id: ${id} (${previous.directory}, ${canonical})`);
    result.set(id, { id, directory: canonical, external: !canonical.startsWith(local + path.sep) });
  };
  const scan = (directory: string, direct = false) => {
    if (!existsSync(directory)) { if (direct) throw new Error(`GAME_PACKS_PATH directory missing: ${directory}`); return; }
    if (direct && existsSync(path.join(directory, 'game.json'))) { const game = JSON.parse(readFileSync(path.join(directory, 'game.json'), 'utf8')) as { id: string }; add(game.id, directory); return; }
    for (const entry of readdirSync(directory, { withFileTypes: true })) if (validId.test(entry.name) && (entry.isDirectory() || entry.isSymbolicLink() && statSync(path.join(directory, entry.name)).isDirectory())) add(entry.name, path.join(directory, entry.name));
  };
  scan(local);
  if (includeExternal) for (const directory of (process.env.GAME_PACKS_PATH ?? '').split(path.delimiter).filter(Boolean)) scan(path.resolve(directory), true);
  return result;
}
export function packLocation(id: string, root = process.cwd(), required = true): PackLocation {
  if (!validId.test(id)) throw new Error('Invalid pack id');
  const found = packLocations(root).get(id);
  if (found) return found;
  if (required) throw new Error(`Pack not found: ${id}`);
  return { id, directory: path.join(root, 'packs', id), external: false };
}
export const packDirectory = (id: string, root = process.cwd()) => packLocation(id, root).directory;
export function packPaths(id: string, root = process.cwd()) {
  const location = packLocation(id, root, false);
  return { ...location, cache: location.external ? path.join(location.directory, '.cache/voice', id) : path.join(root, '.cache/voice', id), output: location.external ? path.join(location.directory, 'out') : path.join(root, 'out', id), build: location.external ? path.join(location.directory, '.cache/build') : path.join(root, 'dist', id) };
}
