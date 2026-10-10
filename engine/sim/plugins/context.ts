import type { CommandContext as PublicContext, GameStateAccess, ReadonlyGameState } from '@engine/api';
import type { CommandContext } from '../event/types';
import type { GameState } from '../state/GameState';
export function readonlyState(state: GameState): ReadonlyGameState {
  return Object.freeze({ getFlag: (name: string) => state.getFlag(name), getVar: (name: string) => state.getVar(name),
    getSelf: (map: string, event: string, name: string) => state.getSelf(map, event, name) });
}
export function stateAccess(state: GameState): GameStateAccess {
  return Object.freeze({ ...readonlyState(state), setFlag: (name: string, value: boolean) => state.setFlag(name, value),
    setVar: (name: string, value: number) => state.setVar(name, value), setSelf: (map: string, event: string, name: string, value: boolean) => state.setSelf(map, event, name, value) });
}
export function publicContext(context: CommandContext): PublicContext {
  return Object.freeze({ state: stateAccess(context.state), thisEvent: context.thisEvent && Object.freeze({ ...context.thisEvent }),
    get player() { return Object.freeze({ ...context.player }); }, waitFrames: context.waitFrames, waitUntil: context.waitUntil,
    runCommands: context.runCommands, showText: (request: Parameters<PublicContext['showText']>[0]) => context.showText(request), showChoice: context.showChoice,
    get stopped() { return context.stopped; }, stop: context.stop });
}
