import type { Battle } from '../../data/battle';
export interface Fighter { id: string; side: 'actor' | 'enemy'; index: number; name: string; hp: number; maxHp: number; atk: number; def: number; speed: number; skills: string[]; guard: boolean; buffs: { stat: 'atk' | 'def' | 'speed'; multiplier: number; turns: number; appliedTurn: number }[] }
export interface BattleState { troop: string; turn: number; fighters: Fighter[]; result?: 0 | 1 | 2 }
export interface Action { user: number; skill?: string; target?: number; defend?: boolean; escape?: boolean }
export function startBattle(data: Battle, troopId: string): BattleState {
  const troop = data.troops[troopId]; if (!troop) throw new Error(`Unknown troop: ${troopId}`);
  const actors = troop.actors ?? Object.keys(data.actors);
  if (!actors.length || actors.length > 3) throw new Error('Battle requires 1~3 actors');
  const fighters = (['actor', 'enemy'] as const).flatMap(side => (side === 'actor' ? actors : troop.enemies).map((id, index) => {
    const unit = (side === 'actor' ? data.actors : data.enemies)[id]; if (!unit) throw new Error(`Unknown fighter: ${id}`);
    return { ...unit, id, side, index, maxHp: unit.hp, guard: false, buffs: [] } as Fighter;
  }));
  return { troop: troopId, turn: 1, fighters };
}
export const stat = (f: Fighter, key: 'atk' | 'def' | 'speed'): number => Math.floor(f.buffs.filter(b => b.stat === key).reduce((n, b) => n * b.multiplier, f[key]));
export function turnOrder(state: BattleState): number[] {
  return state.fighters.map((_, i) => i).filter(i => state.fighters[i]!.hp > 0).sort((a, b) => stat(state.fighters[b]!, 'speed') - stat(state.fighters[a]!, 'speed') || (state.fighters[a]!.side === state.fighters[b]!.side ? state.fighters[a]!.index - state.fighters[b]!.index : state.fighters[a]!.side === 'actor' ? -1 : 1));
}
export function enemyAction(data: Battle, state: BattleState, user: number, rng: () => number): Action {
  const fighter = state.fighters[user]!, enemy = data.enemies[fighter.id]!;
  let skill = enemy.script?.[String(state.turn)];
  if (!skill) {
    const weights = enemy.skills.map(s => enemy.weights?.[s] ?? 1), total = weights.reduce((a, b) => a + b, 0); let roll = rng() * total;
    skill = enemy.skills.find((_, i) => (roll -= weights[i]!) < 0) ?? enemy.skills.at(-1)!;
  }
  const effect = data.skills[skill]!.effect;
  const targets = state.fighters.map((f, i) => ({ f, i })).filter(({ f }) => f.hp > 0 && (effect === 'damage' ? f.side !== fighter.side : f.side === fighter.side));
  return { user, skill, target: targets[0]?.i };
}
export function applyAction(data: Battle, original: BattleState, action: Action, rng: () => number): { state: BattleState; value: number; target?: number } {
  const state: BattleState = JSON.parse(JSON.stringify(original)), user = state.fighters[action.user]!; let value = 0;
  if (state.result !== undefined || user.hp <= 0) return { state, value };
  if (action.escape) { if (data.troops[state.troop]!.canEscape) state.result = 2; return { state, value }; }
  if (action.defend) { user.guard = true; return { state, value }; }
  if (!action.skill || !user.skills.includes(action.skill)) throw new Error('Unavailable battle skill');
  const skill = data.skills[action.skill]!; let targetIndex = action.target ?? -1, target = state.fighters[targetIndex];
  if (!target || (skill.effect === 'damage' ? target.side === user.side : target.side !== user.side)) throw new Error('Invalid battle target');
  if (target.hp <= 0) { targetIndex = state.fighters.findIndex(f => f.hp > 0 && (skill.effect === 'damage' ? f.side !== user.side : f.side === user.side)); target = state.fighters[targetIndex]; if (!target) throw new Error('No live battle target'); }
  if (skill.effect === 'damage') {
    const base = Math.max(1, (skill.power ?? 0) + stat(user, 'atk') - stat(target, 'def'));
    const factor = (data.troops[state.troop]!.variation ?? data.variation ?? true) ? 0.9 + rng() * 0.2 : 1;
    value = Math.min(target.hp, Math.max(1, Math.floor(base * factor * (target.guard ? 0.5 : 1)))); target.hp -= value;
  } else if (skill.effect === 'heal') { value = Math.min(target.maxHp - target.hp, skill.power ?? 0); target.hp += value; }
  else { value = skill.multiplier ?? 0; if (!skill.stat || !skill.multiplier || !skill.turns) throw new Error('Invalid buff'); target.buffs = target.buffs.filter(b => b.stat !== skill.stat); target.buffs.push({ stat: skill.stat, multiplier: skill.multiplier, turns: skill.turns, appliedTurn: state.turn }); }
  if (!state.fighters.some(f => f.side === 'enemy' && f.hp > 0)) state.result = 0;
  else if (!state.fighters.some(f => f.side === 'actor' && f.hp > 0)) state.result = 1;
  return { state, value, target: targetIndex };
}
export function nextTurn(original: BattleState): BattleState {
  return { ...original, turn: original.turn + 1, fighters: original.fighters.map(f => ({ ...f, guard: false, buffs: f.buffs.map(b => b.appliedTurn === original.turn ? { ...b } : { ...b, turns: b.turns - 1 }).filter(b => b.turns > 0) })) };
}
