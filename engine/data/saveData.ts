import type { Dir } from '@engine/api';
export interface SaveData {
  saveVersion: 1; packId: string; gameVersion: string; engineVersion: string; savedAt: string;
  map: string; x: number; y: number; dir: Dir;
  flags: Record<string, boolean>; vars: Record<string, number>; selfFlags: Record<string, boolean>;
}
