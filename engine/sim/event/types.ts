import type { Condition, Command } from '../../data/events';
import type { Dir } from '../entity/Character';
import type { GameState } from '../state/GameState';
import type { EventScope } from './conditions';
export type Wait = { kind: 'frames'; n: number } | { kind: 'until'; test: () => boolean };
export type CommandGen<R = void> = Generator<Wait, R, void>;
export type CommandHandler<A> = (args: A, ctx: CommandContext) => CommandGen | void;
export interface TextRequest { text: string; speaker?: string }
export interface ChoiceRequest { prompt?: string; labels: (string | null)[]; cancelIndex: number | null }
export interface CommandContext {
  state: GameState;
  thisEvent: EventScope | null;
  readonly player: { readonly mapId: string; readonly x: number; readonly y: number; readonly dir: Dir };
  waitFrames(n: number): Wait;
  waitUntil(test: () => boolean): Wait;
  runCommands(list: readonly Command[]): CommandGen;
  showText(request: TextRequest): CommandGen;
  showChoice(request: ChoiceRequest): CommandGen<number>;
  evaluate(condition: Condition): boolean;
  face(target: string, dir: Dir | 'player'): void;
  readonly stopped: boolean;
  stop(): void;
}
export type CommandHost = Omit<CommandContext, 'runCommands' | 'stopped' | 'stop'>;
