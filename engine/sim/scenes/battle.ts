import type { SceneDefinition } from '@engine/api';
import { BattleArgs, battleText } from '../../data/battle';
import type { Battle } from '../../data/battle';
import type { DrawList } from '../../data/scenes';
import { startBattle, turnOrder, enemyAction, applyAction, nextTurn } from '../battle/model';
import type { BattleState, Action } from '../battle/model';
interface ViewState { model: BattleState; actor: number; phase: 'command' | 'skill' | 'target' | 'execute' | 'finish' | 'done'; waiting: boolean; skill?: string; targets: number[]; actions: Action[]; order: number[]; cursor: number; width: number; height: number }
export function battle(data: Battle, choose: (labels: string[], prompt?: string) => void, choiceResult: () => number, sfx: (id: string) => void): SceneDefinition<{ troop: string }, ViewState> {
  const actorIds = (s: ViewState) => s.model.fighters.map((f, i) => ({ f, i })).filter(({ f }) => f.side === 'actor' && f.hp > 0).map(({ i }) => i);
  return {
    args: BattleArgs,
    init: (args, ctx) => ({ model: startBattle(data, args.troop), actor: 0, phase: 'command', waiting: false, targets: [], actions: [], order: [], cursor: 0, ...ctx.screen }),
    update(original, _input, ctx) {
      const s = { ...original, actions: [...original.actions] }, actors = actorIds(s), fighter = s.model.fighters[actors[s.actor] ?? 0]!;
      if (s.phase === 'done') return { done: s.model.result! };
      if (s.phase === 'finish') { const text = s.model.result === 0 ? data.labels.victory : s.model.result === 1 ? data.labels.defeat : undefined; if (text) { ctx.showText({ text }); s.phase = 'done'; return s; } return { done: s.model.result! }; }
      if (s.phase === 'execute') {
        if (s.cursor >= s.order.length) { s.model = nextTurn(s.model); s.phase = 'command'; s.actions = []; s.actor = 0; return s; }
        const user = s.order[s.cursor++]!, f = s.model.fighters[user]!;
        if (f.hp <= 0) return s;
        const action = f.side === 'enemy' ? enemyAction(data, s.model, user, ctx.rng) : s.actions.find(a => a.user === user)!;
        const applied = applyAction(data, s.model, action, ctx.rng); s.model = applied.state;
        const skill = action.skill ? data.skills[action.skill]! : undefined;
        if (skill?.sfx) sfx(skill.sfx);
        const message = skill ? battleText(skill.text, { user: f.name, target: s.model.fighters[applied.target!]!.name, value: applied.value }) : action.escape ? data.labels.escape! : data.labels.defend;
        ctx.showText({ text: message });
        if (s.model.result !== undefined) s.phase = 'finish';
        return s;
      }
      if (!s.waiting) {
        const labels = s.phase === 'command' ? [data.labels.attack, data.labels.defend, ...(data.troops[s.model.troop]!.canEscape ? [data.labels.escape!] : [])] : s.phase === 'skill' ? fighter.skills.map(id => data.skills[id]!.name) : s.targets.map(i => s.model.fighters[i]!.name);
        choose(labels, fighter.name); s.waiting = true; return s;
      }
      const selected = choiceResult(); s.waiting = false;
      if (s.phase === 'command' && selected === 0) { s.phase = 'skill'; return s; }
      if (s.phase === 'skill') {
        s.skill = fighter.skills[selected]!;
        const effect = data.skills[s.skill]!.effect;
        s.targets = s.model.fighters.map((f, i) => ({ f, i })).filter(({ f }) => f.hp > 0 && (effect === 'damage' ? f.side !== fighter.side : f.side === fighter.side)).map(({ i }) => i);
        s.phase = 'target'; return s;
      }
      s.actions.push(s.phase === 'target' ? { user: actors[s.actor]!, skill: s.skill, target: s.targets[selected]! } : { user: actors[s.actor]!, defend: selected === 1, escape: selected === 2 });
      if (++s.actor < actors.length) s.phase = 'command';
      else { s.order = turnOrder(s.model); s.cursor = 0; s.phase = 'execute'; }
      return s;
    },
    view(s) {
      const draw: DrawList = [{ kind: 'rect', x: 0, y: 0, w: s.width, h: s.height, color: 'fade' }], troop = data.troops[s.model.troop]!;
      if (troop.background) draw.push({ kind: 'image', asset: troop.background, x: 0, y: 0 });
      s.model.fighters.filter(f => f.side === 'enemy').forEach((f, i) => {
        const x = (i + 1) * s.width / (troop.enemies.length + 1), image = data.enemies[f.id]!.image ?? troop.image;
        if (image && f.hp > 0) draw.push({ kind: 'image', asset: image, x: x - 16, y: 14 });
        draw.push({ kind: 'window', x: x - 48, y: 34, w: 96, h: 44 }, { kind: 'text', x, y: 42, text: f.name, align: 'center' }, { kind: 'text', x, y: 60, text: `${data.labels.hp} ${f.hp}`, align: 'center' });
      });
      const actors = s.model.fighters.filter(f => f.side === 'actor');
      actors.forEach((f, i) => draw.push({ kind: 'window', x: 8 + i * (s.width - 16) / actors.length, y: s.height - 58, w: (s.width - 16) / actors.length, h: 50 }, { kind: 'text', x: 16 + i * (s.width - 16) / actors.length, y: s.height - 50, text: f.name }, { kind: 'text', x: 16 + i * (s.width - 16) / actors.length, y: s.height - 30, text: `${data.labels.hp} ${f.hp}/${f.maxHp}` }));
      return draw;
    },
  };
}
