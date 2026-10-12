import { beforeAll, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { voiceKey } from '../engine/data/voice';
import { BattleSchema, battleText } from '../engine/data/battle';
import type { Battle } from '../engine/data/battle';
import { Value } from '@sinclair/typebox/value';
import { startBattle, turnOrder, enemyAction, applyAction, nextTurn, stat } from '../engine/sim/battle/model';
import { Random } from '../engine/sim/scenes/Random';
import { plainText } from '../engine/data/text';
import { validatePack } from '../engine/data/validator/validate';
import { fixtureSource } from './fixtureSource';
import { builtinCatalog } from '../tools/catalog';
import { FsSource } from '../tools/fsSource';
import { nodePluginRuntime } from '../tools/loadPlugins';
import { runScenario } from '../engine/data/scenarios/run';
import { GameSession } from '../engine/sim/state/GameSession';
import { parseStory } from '../tools/story/parser';
import { lintStories } from '../tools/story/lint';
import { compileStories } from '../tools/story/compile';
import { generateFilm } from '../tools/story/film';
let data: Battle;
beforeAll(async () => { data = JSON.parse(await readFile('packs/debate/battle.json', 'utf8')); });
const fresh = () => startBattle(data, 'night_watch');
it('speed order breaks ties by allies then array order and excludes defeated fighters', () => {
  const s = fresh(); s.fighters[1]!.speed = 6; s.fighters.push({ ...s.fighters[0]!, index: 1 });
  expect(turnOrder(s)).toEqual([0, 2, 1]); s.fighters[0]!.hp = 0; expect(turnOrder(s)).toEqual([2, 1]);
});
it('damage formula, disabled variation and defense half damage are exact and do not mutate input', () => {
  const s = fresh(), rng = () => { throw new Error('No random calls expected'); };
  const hit = applyAction(data, s, { user: 0, skill: 'reason', target: 1 }, rng);
  expect(hit.value).toBe(12); expect(hit.state.fighters[1]!.hp).toBe(4); expect(s.fighters[1]!.hp).toBe(16);
  const guarded = applyAction(data, s, { user: 1, defend: true }, rng).state;
  expect(applyAction(data, guarded, { user: 0, skill: 'reason', target: 1 }, rng).value).toBe(6);
  expect(nextTurn(guarded).fighters[1]!.guard).toBe(false);
  const strong = fresh(); strong.fighters[1]!.def = 100; expect(applyAction(data, strong, { user: 0, skill: 'reason', target: 1 }, rng).value).toBe(1);
});
it('healing caps HP, buffs replace same stat and expire at round boundaries', () => {
  const d = structuredClone(data); d.skills.boost = { name: 'boost', text: '{value}', effect: 'buff', power: 0, stat: 'atk', multiplier: 2, turns: 2 }; d.actors.visitor!.skills.push('boost');
  const s = startBattle(d, 'night_watch'); s.fighters[0]!.hp = 19;
  expect(applyAction(d, s, { user: 0, skill: 'listen', target: 0 }, () => 0).value).toBe(1);
  const buff = applyAction(d, s, { user: 0, skill: 'boost', target: 0 }, () => 0).state;
  expect(stat(buff.fighters[0]!, 'atk')).toBe(12); expect(stat(nextTurn(buff).fighters[0]!, 'atk')).toBe(12); expect(stat(nextTurn(nextTurn(buff)).fighters[0]!, 'atk')).toBe(12); expect(stat(nextTurn(nextTurn(nextTurn(buff))).fighters[0]!, 'atk')).toBe(6);
});
it('script overrides weighted randomness and seeded variation gives repeatable battles', () => {
  expect(enemyAction(data, fresh(), 1, () => { throw new Error('Script does not roll'); }).skill).toBe('concern');
  const d = structuredClone(data); d.variation = true; d.enemies.host!.script = {}; d.enemies.host!.skills.push('reason'); d.enemies.host!.weights = { concern: 1, reason: 3 };
  expect(enemyAction(d, startBattle(d, 'night_watch'), 1, () => .9).skill).toBe('reason');
  const replay = () => { const rng = new Random(42); let s = startBattle(d, 'night_watch'); for (let i = 0; i < 8 && s.result === undefined; i++) { s = applyAction(d, s, { user: 0, skill: 'reason', target: 1 }, () => rng.next()).state; if (s.result === undefined) s = applyAction(d, s, enemyAction(d, s, 1, () => rng.next()), () => rng.next()).state; } return { s, seed: rng.state }; };
  expect(replay()).toEqual(replay());
});
it('victory, defeat and allowed/forbidden escape use 0/1/2', () => {
  const s = fresh(); s.fighters[1]!.hp = 1; expect(applyAction(data, s, { user: 0, skill: 'reason', target: 1 }, () => 0).state.result).toBe(0);
  s.fighters[0]!.hp = 1; expect(applyAction(data, s, { user: 1, skill: 'concern', target: 0 }, () => 0).state.result).toBe(1);
  expect(applyAction(data, fresh(), { user: 0, escape: true }, () => 0).state.result).toBe(2);
  const d = structuredClone(data); d.troops.night_watch!.canEscape = false; expect(applyAction(d, fresh(), { user: 0, escape: true }, () => 0).state.result).toBeUndefined();
});
it('battle placeholders use escaped literals and share G1 controls and variable substitution', () => {
  const text = battleText('{user} → {target}: {value} {var:n}{wait:3}{color:accent}끝{color} {{user}}', { user: 'A{b}', target: 'B', value: 12 });
  expect(plainText(text, { variable: () => '2', plugin: () => '', color: () => true })).toBe('A{b} → B: 12 2끝 {user}');
});
it('valid schema plus base-pack memory variants catch references, images, numeric ranges and scripts', async () => {
  expect(Value.Check(BattleSchema, data)).toBe(true);
  for (const [mutation, code] of [
    [(d: Battle) => { d.actors.visitor!.skills = ['missing']; }, 'V3'],
    [(d: Battle) => { d.troops.night_watch!.actors = ['missing']; }, 'V3'],
    [(d: Battle) => { d.troops.night_watch!.enemies = ['missing']; }, 'V3'],
    [(d: Battle) => { d.troops.night_watch!.background = 'missing.png'; }, 'V4'],
    [(d: Battle) => { d.actors.visitor!.hp = 0; }, 'V1'],
    [(d: Battle) => { d.enemies.host!.script = { '01': 'concern' }; }, 'V1'],
    [(d: Battle) => { d.enemies.host!.script = { '1': 'listen' }; }, 'V3'],
    [(d: Battle) => { d.skills.reason!.effect = 'buff'; }, 'V1'],
  ] as const) {
    const d = structuredClone(data); mutation(d); for (const skill of Object.values(d.skills)) delete skill.sfx;
    const source = await fixtureSource([{ op: 'set', file: 'battle.json', pointer: '', value: d }]);
    expect((await validatePack(source, 'base', { commands: builtinCatalog() })).diagnostics.some(x => x.code === code && x.level === 'error')).toBe(true);
  }
});
it('real debate scenarios reproduce win, loss and escape, freeze map and forbid save during battle', async () => {
  const source = new FsSource('packs/debate'), plugins = await nodePluginRuntime(source, 'packs/debate');
  const pack = (await validatePack(source, 'debate', plugins.validationOptions)).pack!;
  for (const name of ['win', 'lose', 'escape']) for (let repeat = 0; repeat < 2; repeat++) await runScenario(pack, await source.readJson(`tests/${name}.scenario.json`), (p, start, state) => new GameSession(p, { plugins }, start, state));
  const session = new GameSession(pack), g = session.game; g.scenes.open('battle', { troop: 'night_watch' }); const player = g.player.snapshot();
  for (let i = 0; i < 10; i++) g.tick({ held: new Set(['right']), pressed: new Set() }); expect(g.player.snapshot()).toEqual(player);
  expect(() => g['host'](g.events[0]!).save()).toThrow('scene'); expect(g.snapshot.scenes[0]!.draw.some(x => x.kind === 'text' && x.text.includes('설득력'))).toBe(true);
  const d = structuredClone(data); d.troops.night_watch!.canLose = false;
  let lost: GameSession | undefined;
  await expect(runScenario({ ...pack, battle: d }, await source.readJson('tests/lose.scenario.json'), (p, start, state) => { lost = new GameSession(p, { plugins }, start, state); return lost; })).rejects.toThrow('settle');
  expect(lost!.snapshot.scenes.at(-1)?.name).toBe('ending'); expect(lost!.game.state.getVar('result')).toBe(1);
});
it('story battle parsing/lint/compile requires a declared result and known troop; film hints replay deterministically', async () => {
  const source = new FsSource('packs/lantern'), plugins = await nodePluginRuntime(source, 'packs/lantern'), base = (await validatePack(source, 'lantern', plugins.validationOptions)).pack!;
  const original = await readFile('packs/lantern/story/main.story.md', 'utf8');
  const text = original.replace('@var trust 0', '@var trust 0\n@var result -1\n@flag battle_won').replace('@event elder at elder_spot trigger=action character=elder\n', '@event elder at elder_spot trigger=action character=elder\n  @battle night_watch -> result\n  @film choose 0,0,0,0,0,0\n  @if result==0\n    @set battle_won\n  @else\n    @unset battle_won\n  @end\n');
  const parsed = parseStory(text); expect(parsed.diagnostics).toEqual([]);
  expect(lintStories([parsed.story], { battleTroops: new Set(['other']) }).some(d => d.code === 'S046')).toBe(true);
  expect(lintStories([parseStory(text.replace('-> result', '-> missing')).story]).some(d => d.code === 'S003')).toBe(true);
  const compilation = compileStories([parsed.story], base.game, await source.readJson('story/tiles.json'));
  const storyBattle = structuredClone(data); for (const skill of Object.values(storyBattle.skills)) delete skill.sfx;
  const pack = { ...base, battle: storyBattle, game: JSON.parse(compilation.files.get('game.json')!), common: JSON.parse(compilation.files.get('common-events.json')!), events: new Map(base.game.maps.map(id => [id, JSON.parse(compilation.files.get(`maps/${id}.events.json`)!).events])) };
  expect(compilation.files.get('maps/pier.events.json')).toContain('"cmd": "battle"');
  expect([...await generateFilm([parsed.story], pack, plugins)]).toEqual([...await generateFilm([parsed.story], pack, plugins)]);
  const fatal = structuredClone(storyBattle); fatal.troops.night_watch!.canLose = false;
  const lossStory = parseStory(text.replace('@film choose 0,0,0,0,0,0', '@film choose 1,1,1,1')).story;
  const fatalFilm = await generateFilm([lossStory], { ...pack, battle: fatal }, plugins);
  expect(fatalFilm.get('films/main.film.json')).toContain('\"pause\": 2');
  const noHint = parseStory(text.replace('  @film choose 0,0,0,0,0,0\n', '')).story;
  await expect(generateFilm([noHint], pack, plugins)).rejects.toThrow('입력 힌트');
});

it('a queued target defeated by an earlier ally is redirected to the first remaining live target', () => {
  const s = fresh(); s.fighters[1]!.hp = 1;
  s.fighters.splice(1, 0, { ...s.fighters[0]!, name: '동료', index: 1 });
  s.fighters.push({ ...s.fighters[2]!, index: 1, hp: 16 });
  const first = applyAction(data, s, { user: 0, skill: 'reason', target: 2 }, () => 0).state;
  const second = applyAction(data, first, { user: 1, skill: 'reason', target: 2 }, () => 0);
  expect(second.target).toBe(3); expect(second.value).toBe(12);
});

it('battle progress uses normal MessageState plain text, narrator voice length and G5 sound requests', async () => {
  const source = new FsSource('packs/debate'), pack = (await validatePack(source, 'debate', { commands: builtinCatalog() })).pack!;
  const voice = { provider: 'fake', voice: 'narrator' }, text = '여행자의 반박에 마을 대표의 설득력이 12만큼 달라졌다.', key = voiceKey(voice, text);
  const game = new GameSession(pack, { voices: { narrator: voice }, voiceLengths: { [key]: 30 }, recording: true }).game;
  const tick = (ok = false) => game.tick({ held: new Set(), pressed: new Set(ok ? ['ok'] : []) });
  game.scenes.open('battle', { troop: 'night_watch' });
  for (let choice = 0; choice < 3; choice++) {
    let wait = 0; while (!game.choice.opened && ++wait < 20) tick(); expect(game.choice.opened).toBe(true); tick(true); tick();
  }
  let wait = 0; while (!game.message.opened && ++wait < 20) tick();
  expect(game.message.snapshot).toMatchObject({ plainText: text, textOrigin: 'command', voiceKey: key, voiceFrames: 30, voiceAuto: true });
  expect(game.snapshot.audio.requests).toContainEqual({ kind: 'sfx', id: 'hit' });
});
