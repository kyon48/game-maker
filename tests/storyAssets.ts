import { cp } from 'node:fs/promises';
import path from 'node:path';
export function copyStoryAssets(folder: string): Promise<void> {
  const root = path.resolve('packs/lantern/assets');
  return cp(root, path.join(folder, 'assets'), { recursive: true, filter: file => file !== path.join(root, 'portraits') && !file.startsWith(path.join(root, 'portraits') + path.sep) });
}
