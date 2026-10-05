import type { PackSource } from '../sim/ports';
import { packPath } from '../data/loader/path';
export class FetchSource implements PackSource {
  constructor(readonly root: string, private readonly inventoryUrl?: string) {}
  url(path: string): string { return this.root + packPath('', path).split('/').map(encodeURIComponent).join('/'); }
  async readJson(path: string): Promise<unknown> {
    const response = await fetch(this.url(path));
    if (!response.ok) throw new Error(`Load failed: ${path} (${response.status})`);
    return response.json();
  }
  async listFiles(): Promise<readonly string[]> {
    if (!this.inventoryUrl) return [];
    const response = await fetch(this.inventoryUrl);
    if (!response.ok) throw new Error('Cannot list development pack files');
    return response.json() as Promise<string[]>;
  }
  async exists(path: string): Promise<boolean> {
    const response = await fetch(this.url(path), { method: 'HEAD' });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error(`Load failed: ${path} (${response.status})`);
    return true;
  }
}
