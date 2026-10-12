import type { Battle } from '../../engine/data/battle';
import { startBattle, applyAction, enemyAction, turnOrder, nextTurn } from '../../engine/sim/battle/model';
import type { Action } from '../../engine/sim/battle/model';
/** Predict the chosen path using the same pure rules, without voice/text timing. */
export function battleChoiceResult(data: Battle, troop: string, choices: readonly number[], rng: () => number): number {
  let state = startBattle(data, troop), cursor = 0;
  const pick = () => { const n = choices[cursor++]; if (n === undefined) throw new Error('전투 선택 힌트 부족'); return n; };
  for (let round = 0; round < 600; round++) {
    const actions: Action[] = [];
    for (const [user, fighter] of state.fighters.entries()) if (fighter.side === 'actor' && fighter.hp > 0) {
      const command = pick();
      if (command === 1) actions.push({ user, defend: true });
      else if (command === 2 && data.troops[troop]!.canEscape) actions.push({ user, escape: true });
      else if (command === 0) {
        const skill = fighter.skills[pick()]; if (!skill) throw new Error('전투 기술 힌트 오류');
        const effect = data.skills[skill]!.effect;
        const targets = state.fighters.map((f, i) => ({ f, i })).filter(({ f }) => f.hp > 0 && (effect === 'damage' ? f.side !== fighter.side : f.side === fighter.side));
        const target = targets[pick()]?.i; if (target === undefined) throw new Error('전투 대상 힌트 오류');
        actions.push({ user, skill, target });
      } else throw new Error('전투 명령 힌트 오류');
    }
    for (const user of turnOrder(state)) {
      if (state.fighters[user]!.hp <= 0) continue;
      const action = state.fighters[user]!.side === 'enemy' ? enemyAction(data, state, user, rng) : actions.find(a => a.user === user)!;
      state = applyAction(data, state, action, rng).state;
      if (state.result !== undefined) return state.result;
    }
    state = nextTurn(state);
  }
  throw new Error('전투 힌트 600턴 초과');
}
