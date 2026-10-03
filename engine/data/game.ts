import type { Dir } from '@engine/api';
import type { Condition, Command } from './events';
export interface InitialState { flags: Record<string, boolean>; vars: Record<string, number> }
export interface GameConfig {
  title: string; tileSize: number; screen: { width: number; height: number };
  maps: string[]; start: { map: string; x: number; y: number; dir: Dir };
  player: string; state: InitialState;
}
export interface EventPage {
  character?: string; dir?: Dir; through?: boolean; when?: Condition;
  trigger: 'action' | 'touch' | 'auto' | 'parallel' | 'none'; commands?: readonly Command[];
}
export interface EventDefinition { id: string; x: number; y: number; pages: EventPage[] }
