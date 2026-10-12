import type { ValidationContext } from './context';
import { escapePointer } from './context';
import type { Battle } from '../battle';
import type { Audio } from '../audio';
import { packPath } from '../loader/path';
export async function battleRules({ report, source }: ValidationContext, battle: Battle, audio: Audio | undefined): Promise<void> {
  const file = 'battle.json';
  const image = async (value: string | undefined, pointer: string) => { if (!value) return; try { packPath('', value); if (!/\.(png|jpe?g|webp)$/i.test(value) || !await source.exists(value)) throw new Error('Missing battle image'); } catch (e) { report('V4', file, pointer, String(e)); } };
  for (const side of ['actors', 'enemies'] as const) for (const [id, unit] of Object.entries(battle[side])) {
    const p = `/${side}/${escapePointer(id)}`;
    unit.skills.forEach((skill, i) => { if (!battle.skills[skill]) report('V3', file, `${p}/skills/${i}`, 'Unknown skill'); }); await image(unit.image, p + '/image');
    if (side === 'enemies') {
      const enemy = battle.enemies[id]!;
      for (const [turn, skill] of Object.entries(enemy.script ?? {})) { if (!Number.isSafeInteger(Number(turn))) report('V1', file, p + '/script/' + turn, 'Unsafe turn'); if (!enemy.skills.includes(skill)) report('V3', file, p + '/script/' + turn, 'Unavailable scripted skill'); }
      for (const skill of Object.keys(enemy.weights ?? {})) if (!enemy.skills.includes(skill)) report('V3', file, p + '/weights/' + skill, 'Unavailable weighted skill');
    }
  }
  for (const [id, skill] of Object.entries(battle.skills)) {
    const p = '/skills/' + escapePointer(id);
    if (skill.effect !== 'buff' && skill.power === undefined) report('V1', file, p + '/power', 'Damage/heal requires power');
    if (skill.effect === 'buff' && (!skill.stat || skill.multiplier === undefined || skill.turns === undefined)) report('V1', file, p, 'Buff requires stat/multiplier/turns');
    if (skill.sfx && !audio?.[skill.sfx]) report('V3', file, p + '/sfx', 'Unknown battle sound');
  }
  for (const [id, troop] of Object.entries(battle.troops)) {
    const p = '/troops/' + escapePointer(id), actors = troop.actors ?? Object.keys(battle.actors);
    if (!actors.length || actors.length > 3) report('V1', file, p + '/actors', 'Battle requires 1~3 actors');
    actors.forEach((a, i) => { if (!battle.actors[a]) report('V3', file, `${p}/actors/${i}`, 'Unknown actor'); });
    troop.enemies.forEach((e, i) => { if (!battle.enemies[e]) report('V3', file, `${p}/enemies/${i}`, 'Unknown enemy'); });
    await image(troop.background, p + '/background'); await image(troop.image, p + '/image');
    if (troop.canEscape && !battle.labels.escape) report('V3', file, '/labels/escape', 'Escape label required');
    if (!troop.canLose && !battle.labels.gameOver) report('V3', file, '/labels/gameOver', 'Game over label required');
  }
}
