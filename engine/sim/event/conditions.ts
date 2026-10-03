import type { Condition } from '../../data/events';
import type { GameState } from '../state/GameState';
export interface EventScope { readonly mapId: string; readonly id: string }
export function evaluate(condition: Condition, state: GameState, scope: EventScope | null): boolean {
  if ('flag' in condition) return state.getFlag(condition.flag) === condition.is;
  if ('var' in condition) {
    const value = state.getVar(condition.var), expected = condition.value;
    switch (condition.op) {
      case '==': return value === expected;
      case '!=': return value !== expected;
      case '>': return value > expected;
      case '>=': return value >= expected;
      case '<': return value < expected;
      case '<=': return value <= expected;
    }
  }
  if ('self' in condition) {
    if (!scope) throw new Error('Self condition requires an event');
    return state.getSelf(scope.mapId, scope.id, condition.self) === condition.is;
  }
  if ('all' in condition) return condition.all.every(child => evaluate(child, state, scope));
  if ('any' in condition) return condition.any.some(child => evaluate(child, state, scope));
  if ('not' in condition) return !evaluate(condition.not, state, scope);
  throw new Error(`Unsupported condition: ${JSON.stringify(condition)}`);
}
