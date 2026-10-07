import type { Static, TSchema } from '@sinclair/typebox';
import type { Dir } from '../sim/entity/Character';
import type { Command, Condition } from '../data/events';
import type { SaveData } from '../data/saveData';
import type { Wait, CommandGen, TextRequest, ChoiceRequest } from '../sim/event/types';
export { API_VERSION } from '../data/apiVersion';
export type { Action, InputFrame, TextMeasurer, PackSource } from '../sim/ports';
export type { Dir, Command, Condition, SaveData, Wait, CommandGen, TextRequest, ChoiceRequest };
export interface ReadonlyGameState {
  getFlag(name: string): boolean;
  getVar(name: string): number;
  getSelf(mapId: string, eventId: string, name: string): boolean;
}
export interface GameStateAccess extends ReadonlyGameState {
  setFlag(name: string, value: boolean): void;
  setVar(name: string, value: number): void;
  setSelf(mapId: string, eventId: string, name: string, value: boolean): void;
}
export interface CommandContext {
  state: GameStateAccess;
  thisEvent: { mapId: string; id: string } | null;
  player: { readonly mapId: string; readonly x: number; readonly y: number; readonly dir: Dir };
  waitFrames(n: number): Wait;
  waitUntil(test: () => boolean): Wait;
  runCommands(list: readonly Command[]): CommandGen;
  showText(request: TextRequest): CommandGen;
  showChoice(request: ChoiceRequest): CommandGen<number>;
  readonly stopped: boolean;
  stop(): void;
}
export type CommandHandler<A> = (args: A, ctx: CommandContext) => CommandGen | void;
export interface HookContext {
  state: GameStateAccess;
  readonly player: CommandContext['player'];
  readonly mapId: string;
}
export interface CommandDefinition<S extends TSchema> { args: S; parallelSafe?: boolean; run: CommandHandler<Static<S>> }
export interface EngineApi {
  readonly engineVersion: string;
  commands: { register<S extends TSchema>(name: `x_${string}`, definition: CommandDefinition<S>): void };
  conditions: { register<S extends TSchema>(name: `x_${string}`, definition: { args: S; test(args: Static<S>, state: ReadonlyGameState): boolean }): void };
  hooks: {
    on(event: 'mapEnter' | 'mapLeave', handler: (ctx: HookContext, mapId: string) => void): void;
    on(event: 'tick', handler: (ctx: HookContext) => void): void;
    on(event: 'loadSave', handler: (save: SaveData, fromGameVersion: string) => void): void;
  };
}
export interface PluginModule { apiVersion: 1; id: string; register(api: EngineApi): void }
