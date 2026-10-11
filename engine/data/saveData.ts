import type { Dir } from '@engine/api';
export interface SaveData {
  rngState?: number;
  saveVersion: 2; items: Record<string, number>; packId: string; gameVersion: string; engineVersion: string; savedAt: string;
  map: string; x: number; y: number; dir: Dir;
  flags: Record<string, boolean>; vars: Record<string, number>; selfFlags: Record<string, boolean>;
}
