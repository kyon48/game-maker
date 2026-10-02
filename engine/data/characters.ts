import type { Dir } from '@engine/api';
interface Timing { moveTicks?: number }
export type CharacterDefinition = Readonly<Timing & (
  | { placeholder: string; sheet?: never }
  | { sheet: string; placeholder?: never; frameWidth: number; frameHeight: number;
      rows?: Readonly<Record<Dir, number>>; walkFrames?: readonly number[]; frameTicks?: number }
)>;
export type Characters = Readonly<Record<string, CharacterDefinition>>;
