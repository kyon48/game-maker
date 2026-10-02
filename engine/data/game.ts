import type { Dir } from '@engine/api';
export interface InitialState { flags: Record<string, boolean>; vars: Record<string, number> }
export interface GameConfig {
  title: string; tileSize: number; screen: { width: number; height: number };
  maps: string[]; start: { map: string; x: number; y: number; dir: Dir };
  player: string; state: InitialState;
}
export interface EventPage {
  character?: string; dir?: Dir; through?: boolean; when?: unknown;
  trigger: 'action' | 'touch' | 'auto' | 'parallel' | 'none'; commands?: readonly unknown[];
}
export interface EventDefinition { id: string; x: number; y: number; pages: EventPage[] }
