import type { TSchema } from '@sinclair/typebox';
import type { GameConfig, EventDefinition } from '../game';
import type { Characters } from '../characters';
import type { Skin } from '../skin';
import type { Command } from '../events';
import type { TileMapData } from '../loader/tiled';
export interface Diagnostic { level: 'error' | 'warning'; file: string; pointer: string; code: string; message: string }
export type CommandCatalog = ReadonlyMap<string, { args: TSchema; parallelSafe: boolean }>;
export interface ValidationOptions {
  pluginDiagnostics?: readonly Diagnostic[];
  commands: CommandCatalog;
  conditions?: ReadonlyMap<string, TSchema>;
  plugins?: readonly { id: string; apiVersion: number }[];
}
export interface ValidatedPack {
  game: GameConfig; characters: Characters; skin: Skin;
  common: Record<string, { commands: Command[] }>;
  events: ReadonlyMap<string, EventDefinition[]>;
  maps: ReadonlyMap<string, TileMapData>;
}
