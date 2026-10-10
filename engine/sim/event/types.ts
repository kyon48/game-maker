import type { Condition, Command } from '../../data/events';
import type { Dir } from '../entity/Character';
import type { GameState } from '../state/GameState';
import type { EventScope } from './conditions';
export type Wait = { kind: 'frames'; n: number } | { kind: 'until'; test: () => boolean };
export type CommandGen<R = void> = Generator<Wait, R, void>;
export type CommandHandler<A> = (args: A, ctx: CommandContext) => CommandGen | void;
export interface TextRequest { text: string; speaker?: string }
export interface ChoiceRequest { prompt?: string; labels: (string | null)[]; cancelIndex: number | null }
export interface TransferRequest { map: string; marker?: string; x?: number; y?: number; dir?: Dir; fade?: boolean }
export interface CommandContext {
  showMapName(): void;
  save(): void;
  state: GameState;
  thisEvent: EventScope | null;
  readonly player: { readonly mapId: string; readonly x: number; readonly y: number; readonly dir: Dir };
  waitFrames(n: number): Wait;
  waitUntil(test: () => boolean): Wait;
  runCommands(list: readonly Command[]): CommandGen;
  showText(request: TextRequest, source?: 'command'): CommandGen;
  showChoice(request: ChoiceRequest): CommandGen<number>;
  evaluate(condition: Condition): boolean;
  face(target: string, dir: Dir | 'player'): void;
  transfer(request: TransferRequest): CommandGen;
  move(target: string, route: readonly string[]): { done: boolean };
  fade(to: 'black' | 'clear', frames: number): { done: boolean };
  shake(power: number, frames: number): { done: boolean };
  showCharacter(target: string, visible: boolean): void;
  common(id: string): readonly Command[];
  call(id: string): CommandGen;
  readonly parallel?: boolean;
  readonly stopped: boolean;
  stop(): void;
}
export type CommandHost = Omit<CommandContext, 'runCommands' | 'stopped' | 'stop' | 'call'>;
