import type { PersistentState } from '../sim/state/loadSave';
import { SAVE_VERSION } from '../sim/state/saveMigrations';
import type { SaveData } from '../data/saveData';
export type { SaveData } from '../data/saveData';
export class SaveStorage {
  private readonly key: string;
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | (() => Pick<Storage, 'getItem' | 'setItem'>), private readonly metadata: { packId: string; gameVersion: string; engineVersion: string }, private readonly now = () => new Date().toISOString()) {
    this.key = `game-maker:${metadata.packId}:slot1`;
  }
  private acquire() { return typeof this.storage === 'function' ? this.storage() : this.storage; }
  read(): string | null { try { return this.acquire().getItem(this.key); } catch { return null; } }
  write(state: PersistentState): void {
    try {
      const save: SaveData = { ...state, ...this.metadata, saveVersion: SAVE_VERSION, savedAt: this.now() };
      this.acquire().setItem(this.key, JSON.stringify(save));
    } catch (error) { console.warn('Save failed:', error); }
  }
}
