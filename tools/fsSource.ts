import { readFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { PackSource } from '../engine/sim/ports';
export class FsSource implements PackSource {
  constructor(readonly root: string) {}
  private resolve(file: string): string {
    const root = path.resolve(this.root), resolved = path.resolve(root, file);
    if (path.isAbsolute(file) || file.includes('\\') || !resolved.startsWith(root + path.sep)) throw new Error(`Outside pack: ${file}`);
    return resolved;
  }
  async readJson(file: string): Promise<unknown> { return JSON.parse(await readFile(this.resolve(file), 'utf8')); }
  async exists(file: string): Promise<boolean> { try { await access(this.resolve(file)); return true; } catch { return false; } }
  async listFiles(): Promise<readonly string[]> {
    const walk = async (dir: string): Promise<string[]> => {
      const entries = await readdir(path.join(this.root, dir), { withFileTypes: true });
      return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(path.posix.join(dir, entry.name)) : [path.posix.join(dir, entry.name)]))).flat();
    };
    return walk('');
  }
}
