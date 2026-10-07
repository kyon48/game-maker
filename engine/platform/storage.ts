import type { PersistentState } from '../sim/state/loadSave';
import { SAVE_VERSION } from '../sim/state/saveMigrations';
export interface SaveData extends PersistentState {
  saveVersion: 1; packId: string; gameVersion: string; engineVersion: string; savedAt: string;
}
export class SaveStorage {
  private readonly key: string;
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>, private readonly metadata: { packId: string; gameVersion: string; engineVersion: string }, private readonly now = () => new Date().toISOString()) {
    this.key = `game-maker:${metadata.packId}:slot1`;
  }
  read(): string | null { return this.storage.getItem(this.key); }
  write(state: PersistentState): void {
    const save: SaveData = { ...state, ...this.metadata, saveVersion: SAVE_VERSION, savedAt: this.now() };
    this.storage.setItem(this.key, JSON.stringify(save));
  }
}
