import { voiceKey } from '../engine/data/voice';
import { beforeAll, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { Value } from '@sinclair/typebox/value';
import { ItemsSchema, itemNotice } from '../engine/data/items';
import type { Items } from '../engine/data/items';
import { GameSession } from '../engine/sim/state/GameSession';
import { Game } from '../engine/sim/Game';
import { GameState } from '../engine/sim/state/GameState';
import { loadSave, readSave } from '../engine/sim/state/loadSave';
import { Interpreter } from '../engine/sim/event/Interpreter';
import { plainText } from '../engine/data/text';
import { validatePack } from '../engine/data/validator/validate';
import type { ValidatedPack } from '../engine/data/validator/types';
import { fixtureSource } from './fixtureSource';
import { FsSource } from '../tools/fsSource';
import { builtinCatalog } from '../tools/catalog';
import { nodePluginRuntime } from '../tools/loadPlugins';
import { asFilm, rehearse } from '../tools/film/rehearse';
import { parseStory } from '../tools/story/parser';
import { lintStories } from '../tools/story/lint';
import { compileStories } from '../tools/story/compile';
let pack: ValidatedPack;
const items: Items = { key: { name: 'Key {var:n}', description: 'A key', category: 'item', icon: 'assets/characters/hero.png' }, note: { name: 'Note', description: 'A recorded clue.', category: 'clue' } };
const labels = { itemGet: '{name} ×{count}', menuItems: 'Items', menuClues: 'Clues', menuClose: 'Close', menuEmpty: 'Empty' };
beforeAll(async () => { pack = (await validatePack(new FsSource('tests/fixtures/base'), 'base', { commands: builtinCatalog() })).pack!; });
const input = (key?: import('../engine/api').Action) => ({ held: new Set(key ? [key] : []), pressed: new Set(key ? [key] : []) });
function session(counts: Record<string, number> = {}) { return new GameSession({ ...pack, items, game: { ...pack.game, labels: { ...pack.game.labels, ...labels } } }, {}, pack.game.start, { ...pack.game.state, items: counts }); }
function execute(game: Game, commands: import('../engine/data/events').Command[]) {
  const runner = new Interpreter(game.commands); runner.start(commands, game['host'](game.events[0]!)); runner.update(); return runner;
}
it('item counts, category totals, zero clamping and overflow rejection share state/conditions/text resolution', () => {
  const runtime = session(), g = runtime.game;
  execute(g, [{ cmd: 'give_item', item: 'key', count: 2, notify: false }, { cmd: 'give_item', item: 'note', notify: false }]);
  expect(g.state.getItem('key')).toBe(2); expect(g.state.itemCount('clue')).toBe(1);
  expect(g.evaluate({ all: [{ item: 'key', op: '==', value: 2 }, { itemCount: 'clue', op: '>=', value: 1 }] }, null)).toBe(true);
  execute(g, [{ cmd: 'take_item', item: 'key', count: 4 }]); expect(g.state.getItem('key')).toBe(0);
  const resolver = { variable: () => '', plugin: () => '', item: (id: string) => String(g.state.getItem(id)), itemCount: (c: string) => String(g.state.itemCount(c as 'clue')) };
  expect(plainText('수첩 {item:note}/{itemCount:clue}', resolver)).toBe('수첩 1/1');
  execute(g, [{ cmd: 'give_item', item: 'key', count: Number.MAX_SAFE_INTEGER, notify: false }]);
  expect(() => execute(g, [{ cmd: 'give_item', item: 'key', notify: false }])).toThrow('Invalid item count');
  expect(g.state.getItem('key')).toBe(Number.MAX_SAFE_INTEGER); expect(() => g.state.getItem('bad')).toThrow('Undeclared item');
});
it('notice uses pack labels, escapes inserted control text, follows ordinary message and voice timing paths', () => {
  const g = session().game, runner = execute(g, [{ cmd: 'give_item', item: 'key' }]);
  expect(g.message.snapshot).toMatchObject({ text: 'Key {var:n} ×1', plainText: 'Key {var:n} ×1', textOrigin: 'command' });
  expect(runner.running).toBe(true); g.tick(input('ok')); g.tick(input('ok')); runner.update(); expect(runner.running).toBe(false);
  const voice = { provider: 'fake', voice: 'narrator' }, key = voiceKey(voice, 'Key {var:n} ×1');
  const voiced = new GameSession({ ...pack, items, game: { ...pack.game, labels: { ...pack.game.labels, ...labels } } }, { voices: { narrator: voice }, voiceLengths: { [key]: 20 }, recording: true });
  const notification = execute(voiced.game, [{ cmd: 'give_item', item: 'key' }]);
  expect(voiced.game.message.snapshot).toMatchObject({ voiceKey: key, voiceAuto: true, voiceFrames: 20 });
  for (let i = 0; i < 100; i++) voiced.tick(input()); notification.update(); expect(notification.running).toBe(false);
  expect(itemNotice('{{{name}}}', 'Key', 1)).toBe('{{Key}}');
  expect(() => itemNotice('{bad}', 'Key', 1)).toThrow('placeholder');
  expect(plainText(itemNotice('{name} {count}', 'a}b', 3), { variable: () => '', plugin: () => '' })).toBe('a}b 3');
});
it('menu opens with cancel, displays tabs/empty/item/icon/description, freezes map and closes deterministically', () => {
  const g = session({ key: 1 }).game; g.tick(input('cancel'));
  expect(g.snapshot.scenes.at(-1)?.name).toBe('menu'); const player = g.player.snapshot();
  for (let i = 0; i < 12; i++) g.tick(input()); expect(g.player.snapshot()).toEqual(player);
  g.tick(input('right')); expect(g.snapshot.scenes[0]!.draw.some(c => c.kind === 'text' && c.text === 'Empty')).toBe(true);
  g.tick(input('left')); g.tick(input('ok'));
  expect(g.snapshot.scenes[0]!.draw.some(c => c.kind === 'image' && c.asset === items.key!.icon)).toBe(true);
  expect(g.snapshot.scenes[0]!.draw.some(c => c.kind === 'text' && c.text === 'A key')).toBe(true);
  g.tick(input('cancel')); g.tick(input('right')); g.tick(input('right')); g.tick(input('ok')); expect(g.scenes.opened).toBe(false);
});
it('menu is blocked by interpreter, message, choice, scene or a pending transfer; closing UI input is consumed', () => {
  const g = session().game;
  g.main.start([{ cmd: 'wait', frames: 3 }], g['host'](g.events[0]!)); g.tick(input('cancel')); expect(g.scenes.opened).toBe(false); g.main.abort();
  g.message.open({ text: 'A' }); g.tick(input('cancel')); g.tick(input('cancel')); expect(g.scenes.opened).toBe(false);
  g.choice.open({ labels: ['A'], cancelIndex: 0 }); g.tick(input('cancel')); expect(g.scenes.opened).toBe(false);
  g.scenes.open('ending', { title: 'End', lines: [] }); g.tick(input('cancel')); expect(g.snapshot.scenes.map(s => s.name)).toEqual(['ending']);
  const loading = session().game; loading.main.start([{ cmd: 'transfer', map: 'map', x: 3, y: 3, fade: false }], loading['host'](loading.events[0]!));
  loading.tick(input()); loading.tick(input('cancel')); expect(loading.scenes.opened).toBe(false);
});
it('v1 fixture migrates to v2, continues flags/position/rng, then saves items and reloads without aliasing', async () => {
  const raw = await readFile('tests/fixtures/save/v1.json', 'utf8'), candidate = readSave(raw, 'base');
  expect(candidate.data).toMatchObject({ saveVersion: 2, items: {}, rngState: 12345 });
  const restored = loadSave(raw, pack.game, pack.events, pack.maps, { items }).state!;
  expect(restored).toMatchObject({ map: 'map', x: 3, y: 3, flags: { met: true }, items: { key: 0, note: 0 }, rngState: 12345 });
  const runtime = new GameSession({ ...pack, items }, { rngState: restored.rngState, selfFlags: restored.selfFlags }, { map: restored.map, x: restored.x, y: restored.y, dir: restored.dir }, { flags: restored.flags, vars: restored.vars, items: restored.items });
  expect(runtime.game.state.getSelf('map', 'npc', 'opened')).toBe(true);
  execute(runtime.game, [{ cmd: 'give_item', item: 'note', notify: false }, { cmd: 'save' }]);
  expect(runtime.lastSave).toMatchObject({ saveVersion: 2, items: { note: 1 }, rngState: 12345 });
  runtime.game.state.setItem('note', 0); runtime.reload(); expect(runtime.game.state.getItem('note')).toBe(1);
});
it('load filters undeclared/invalid item counts and repeats filtering after plugin loadSave', () => {
  const raw = JSON.stringify({ saveVersion: 2, packId: 'base', items: { key: -1, note: 1.5, ghost: 7 } });
  let calls = 0;
  const loaded = loadSave(raw, pack.game, pack.events, pack.maps, { items, loadSave: state => { calls++; return { ...state, items: { key: 'bad', note: 3, ghost: 1 } as unknown as Record<string, number> }; } });
  expect(calls).toBe(1); expect(loaded.state?.items).toEqual({ key: 0, note: 3 }); expect(loaded.warnings).toContain('Dropped undeclared item: ghost');
  expect(new GameState(pack.game.state, items).getItem('key')).toBe(0);
});
it('schemas and validator reject bad categories/names, missing icons, unknown references, invalid counts and text substitutions', async () => {
  expect(Value.Check(ItemsSchema, { key: { ...items.key, name: ' ' } })).toBe(false);
  expect(Value.Check(ItemsSchema, { key: { ...items.key, category: 'other' } })).toBe(false);
  for (const [file, pointer, value, code] of [
    ['items.json', '/key/icon', 'assets/missing.png', 'V4'],
    ['maps/map.events.json', '/events/0/pages/0/commands', [{ cmd: 'give_item', item: 'bad' }], 'V3'],
    ['maps/map.events.json', '/events/0/pages/0/commands', [{ cmd: 'take_item', item: 'key', count: 0 }], 'V1'],
    ['maps/map.events.json', '/events/0/pages/0/when', { item: 'bad', op: '>=', value: 1 }, 'V3'],
    ['maps/map.events.json', '/events/0/pages/0/when', { itemCount: 'bad', op: '>=', value: 1 }, 'V1'],
    ['maps/map.events.json', '/events/0/pages/0/commands', [{ cmd: 'text', text: '{item:bad}' }], 'V3'],
    ['maps/map.events.json', '/events/0/pages/0/commands', [{ cmd: 'text', text: '{itemCount:bad}' }], 'V3'],
  ] as const) {
    const source = await fixtureSource([{ op: 'set', file: 'items.json', pointer: '', value: items }, ...Object.entries(labels).map(([key, value]) => ({ op: 'set' as const, file: 'game.json', pointer: '/labels/' + key, value })), { op: 'set', file, pointer, value }]);
    expect((await validatePack(source, 'base', { commands: builtinCatalog() })).diagnostics.some(d => d.code === code)).toBe(true);
  }
});
it('manor legacy examined clues become items, native itemCount decides endings and menu film replays', async () => {
  const fs = new FsSource('packs/manor'), plugins = await nodePluginRuntime(fs, fs.root);
  const pack = (await validatePack(fs, 'manor', plugins.validationOptions)).pack!;
  const raw = { saveVersion: 1, packId: 'manor', gameVersion: '0.1.0', selfFlags: { 'hall:clock:examined': true }, flags: { clue_clock: true }, rngState: 77 };
  const loaded = loadSave(JSON.stringify(raw), pack.game, pack.events, pack.maps, { items: pack.items, loadSave: (state, from) => plugins.loadSave(state, raw, from) });
  expect(loaded.state?.items.clue_clock).toBe(1); expect(loaded.state?.rngState).toBe(77);
  expect(plugins.conditions.size).toBe(0); expect(plugins.text.size).toBe(0);
  const replay = await rehearse(pack, asFilm(await fs.readJson('films/menu.film.json')), plugins);
  expect(replay.game.state.getItem('clue_clock')).toBe(1); expect(replay.game.scenes.opened).toBe(false);
});
it('story item declarations/commands/conditions lint, compile and repeat byte-identically (lantern + memory mutations)', async () => {
  const text = await readFile('packs/lantern/story/main.story.md', 'utf8'), parsed = parseStory(text.replace(/ voice=[^\s]+/g, ''), 'main.story.md');
  expect(parsed.diagnostics).toEqual([]); expect(lintStories([parsed.story], { legend: new Set(Object.keys(JSON.parse(await readFile('packs/lantern/story/tiles.json','utf8')).legend)) }).filter(d => d.level === 'error')).toEqual([]);
  const game = JSON.parse(await readFile('packs/lantern/game.json', 'utf8')) as unknown, tiles = JSON.parse(await readFile('packs/lantern/story/tiles.json', 'utf8')) as unknown;
  const first = compileStories([parsed.story], game, tiles); expect(first).toEqual(compileStories([parsed.story], game, tiles));
  expect(first.files.get('items.json')).toContain('lighthouse_key'); expect(first.files.get('maps/pier.events.json')).toContain('give_item'); expect(first.files.get('maps/tower.events.json')).toContain('"item": "lighthouse_key"');
  const broken = parseStory(text.replace(/ voice=[^\s]+/g, '').replace('@give lighthouse_key silent', '@take missing 1'), 'main.story.md');
  expect(broken.diagnostics).toEqual([]);
  expect(lintStories([broken.story]).some(d => d.code === 'S043')).toBe(true);
  const badCategory = parseStory(text.replace(/ voice=[^\s]+/g, '').replace('item:lighthouse_key>=1', 'items:other>=3'), 'main.story.md');
  expect(lintStories([badCategory.story]).some(d => d.code === 'S044')).toBe(true);
});
