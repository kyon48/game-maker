import { beforeAll, expect, it } from 'vitest';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { PluginModule, SceneContext, SceneDefinition } from '../engine/api';
import { API_VERSION } from '../engine/api';
import { MapState } from '../engine/sim/world/MapState';
import { EventObject } from '../engine/sim/entity/EventObject';
import { Random } from '../engine/sim/scenes/Random';
import { Game } from '../engine/sim/Game';
import { Interpreter } from '../engine/sim/event/Interpreter';
import { PluginRuntime } from '../engine/sim/plugins/PluginRuntime';
import { DrawListSchema } from '../engine/data/scenes';
import { GameSession } from '../engine/sim/state/GameSession';
import { loadSave } from '../engine/sim/state/loadSave';
import { validatePack } from '../engine/data/validator/validate';
import type { ValidatedPack } from '../engine/data/validator/types';
import { FsSource } from '../tools/fsSource';
import { builtinCatalog } from '../tools/catalog';
import { nodePluginRuntime } from '../tools/loadPlugins';
import { runScenario } from '../engine/data/scenarios/run';
import type { InputFrame } from '../engine/api';
let base: ValidatedPack;
beforeAll(async () => { base = (await validatePack(new FsSource('tests/fixtures/base'), 'base', { commands: builtinCatalog() })).pack!; });
const input = (key?: import('../engine/api').Action): InputFrame => ({ held: new Set(key ? [key] : []), pressed: new Set(key ? [key] : []) });
function runtime(register: PluginModule['register']) { return new PluginRuntime('0.12.0', [{ name: 'probe', module: { id: 'probe', apiVersion: API_VERSION, register } }]); }
function game(plugins?: PluginRuntime, commands: import('../engine/data/events').Command[] = []) {
  return new Game(base.game, base.maps.get('map')!, base.characters, [{ id: 'probe', x: 4, y: 4, pages: [{ trigger: 'auto', commands: [{ cmd: 'set_self_flag', name: 'started', value: true }, ...commands], when: { self: 'started', is: false } }, { trigger: 'none', when: { self: 'started', is: true } }] }], { plugins });
}
it('API keeps v1 and rejects invalid or duplicate scene names', () => {
  const definition = { args: Type.Object({}), init: () => 0, update: () => ({ done: 1 }), view: () => [] };
  expect(API_VERSION).toBe(1);
  const typed: SceneDefinition<{ n: number }, number> = { args: Type.Object({ n: Type.Integer() }), init: args => args.n, update: s => ({ done: s }), view: () => [] };
  const api = runtime(api => api.scenes.register('x_typed', typed));
  expect(api.scenes.has('x_typed')).toBe(true);
  expect(() => runtime(api => { api.scenes.register('x_probe', definition); api.scenes.register('x_probe', definition); })).toThrow('Duplicate scene');
  expect(() => runtime(api => api.scenes.register('bad' as 'x_bad', definition))).toThrow('registration name');
});
it('scene freezes map movement, parallel, wander and tick hooks; returns a result then resumes the command', () => {
  let hooks = 0;
  const plugins = runtime(api => { api.hooks.on('tick', () => hooks++); api.scenes.register('x_probe', { args: Type.Object({ n: Type.Integer() }), init: args => ({ n: args.n }), update: (s, i) => i.pressed.has('ok') ? { done: s.n } : s, view: () => [] }); });
  const g = game(plugins, [{ cmd: 'scene', name: 'x_probe', args: { n: 7 }, resultVar: 'n' }, { cmd: 'set_flag', flag: 'met', value: true }]);
  const wander = new EventObject({ id: 'wander', x: 2, y: 2, pages: [{ character: base.game.player, trigger: 'action', through: true, wander: ['right', 'left'] }] }, base.game.tileSize, base.characters, g.state, 'map');
  const parallel = new EventObject({ id: 'parallel', x: 3, y: 2, pages: [{ trigger: 'parallel', commands: [{ cmd: 'set_var', var: 'n', op: 'add', value: 1 }] }] }, base.game.tileSize, base.characters, g.state, 'map');
  g.events = [...g.events, wander, parallel]; g.map = new MapState(g.map.id, g.map.data, [...g.map.characters, wander, parallel]);
  g.player.setRoute(['right']); g.tick(input());
  const player = g.player.snapshot(), wandering = wander.snapshot();
  for (let i = 0; i < 30; i++) g.tick(input('right'));
  expect(g.player.snapshot()).toEqual(player); expect(wander.snapshot()).toEqual(wandering); expect(hooks).toBe(0); expect(g.state.getVar('n')).toBe(0);
  expect(g.snapshot.scenes[0]?.state).toEqual({ n: 7 });
  g.tick(input('ok')); expect(g.snapshot.sceneResult).toEqual({ name: 'x_probe', value: 7 });
  g.tick(input()); expect(g.state.getVar('n')).toBe(8); expect(g.state.getFlag('met')).toBe(true);
  expect(hooks).toBe(1);
});
it('stack only updates the top; scene messages pause updates and consume their closing key', () => {
  let updates = 0;
  const plugins = runtime(api => {
    api.scenes.register('x_child', { args: Type.Object({}), init: () => ({ n: 0 }), update: (s, i) => i.pressed.has('ok') ? { done: 4 } : s, view: () => [{ kind: 'rect', x: 0, y: 0, w: 5, h: 5, color: '#fff' }] });
    api.scenes.register('x_parent', { args: Type.Object({}), init: () => ({ opened: false }), update(s, i, ctx) { updates++; if (!s.opened) { ctx.openScene('x_child'); return { opened: true }; } return i.pressed.has('ok') ? { done: 9 } : s; }, view: () => [] });
    api.scenes.register('x_message', { args: Type.Object({}), init(_a, ctx) { ctx.showText({ text: 'test' }); return 0; }, update: () => { updates++; return { done: 2 }; }, view: () => [] });
  });
  const g = game(plugins); g.scenes.open('x_parent'); g.tick(input()); expect(g.snapshot.scenes).toHaveLength(2);
  g.tick(input()); expect(updates).toBe(1);
  g.tick(input('ok')); expect(g.snapshot.scenes).toHaveLength(1);
  g.tick(input('ok')); expect(g.snapshot.sceneResult?.value).toBe(9);
  g.scenes.open('x_message'); const n = updates;
  g.tick(input('ok')); g.tick(input('ok')); expect(updates).toBe(n); expect(g.scenes.opened).toBe(true);
  g.tick(input()); expect(updates).toBe(n + 1); expect(g.scenes.opened).toBe(false);
});
it('ending uses pack labels, only confirms after showing choices and leaves platform restart to the caller', () => {
  const g = game(); g.scenes.open('ending', { title: 'End', lines: ['line'] }); g.tick(input());
  expect(g.snapshot.scenes[0]?.draw.some(c => c.kind === 'text' && c.text.includes(base.game.labels.newGame))).toBe(false);
  g.tick(input('ok'));
  const texts = g.snapshot.scenes[0]!.draw.filter(c => c.kind === 'text').map(c => c.text);
  expect(texts.some(text => text.includes(base.game.labels.newGame))).toBe(true);
  expect(texts.some(text => text.includes(base.game.labels.continue))).toBe(true);
  g.tick(input('down')); g.tick(input('ok')); expect(g.snapshot.sceneResult).toEqual({ name: 'ending', value: 1 });
});
it('rng is deterministic, snapshots expose it and save/reload continues the sequence; old saves default to seed 1', () => {
  let ctx: SceneContext;
  const plugins = runtime(api => api.scenes.register('x_rng', { args: Type.Object({}), init(_a, context) { ctx = context; return { n: Math.floor(context.rng() * 1000) }; }, update: s => s, view: () => [] }));
  const a = game(plugins), b = game(plugins);
  a.scenes.open('x_rng'); b.scenes.open('x_rng'); a.tick(input()); b.tick(input()); expect(a.snapshot).toEqual(b.snapshot);
  expect(new Random(1).next()).not.toBe(new Random(2).next());
  expect(ctx!.rng()).toBeGreaterThanOrEqual(0); expect(a.rng.state).toBe(a.snapshot.rngState);
  const session = new GameSession(base, { plugins }); session.game.rng.next();
  const interpreter = new Interpreter(session.game.commands);
  interpreter.start([{ cmd: 'save' }], session.game['host'](session.game.events[0]!)); interpreter.update();
  const expected = session.game.rng.next(); session.reload(); expect(session.game.rng.next()).toBe(expected);
  expect(session.lastSave?.rngState).toBeDefined();
  const old = { ...session.lastSave! }; delete old.rngState;
  const restored = loadSave(JSON.stringify(old), base.game, base.events, base.maps).state!;
  expect(restored.rngState).toBeUndefined();
  expect(new GameSession(base).game.rng.state).toBe(1);
});
it('save command rejects open scenes and invalid results/draws/images fail deterministically', () => {
  const g = game(); g.scenes.open('ending', { title: 'End', lines: [] });
  const interpreter = new Interpreter(g.commands); interpreter.start([{ cmd: 'save' }], g['host'](g.events[0]!));
  expect(() => interpreter.update()).toThrow('Cannot save');
  expect(Value.Check(DrawListSchema, [{ kind: 'rect', x: 0, y: 0, w: 'bad', h: 1, color: '#fff' }])).toBe(false);
  const plugins = runtime(api => api.scenes.register('x_bad', { args: Type.Object({}), init: () => 0, update: () => ({ done: 0.5 }), view: () => [{ kind: 'image', asset: '../bad.png', x: 0, y: 0 }] }));
  const bad = game(plugins); bad.scenes.open('x_bad');
  expect(() => bad.tick(input())).toThrow('safe integer');
  const image = game(plugins); image.scenes.open('x_bad'); expect(() => image.scenes.snapshot).toThrow('scene image');
});
it('validator catches unknown names, bad args, result vars, image paths and parallel scenes (base + mutations)', async () => {
  const fs = new FsSource('tests/fixtures/base');
  for (const [command, code, suffix] of [
    [{ cmd: 'scene', name: 'unknown' }, 'V1', '/name'],
    [{ cmd: 'scene', name: 'ending', args: { title: 7, lines: [] } }, 'V1', '/args/title'],
    [{ cmd: 'scene', name: 'ending', args: { title: 'a', lines: [] }, resultVar: 'missing' }, 'V3', '/resultVar'],
    [{ cmd: 'scene', name: 'ending', args: { title: 'a', lines: [], image: '../missing.png' } }, 'V4', '/args/image'],
    [{ cmd: 'scene', name: 'x_custom', args: { count: 'bad' } }, 'V1', '/args/count'],
  ] as const) {
    const json = await fs.readJson('maps/map.events.json') as { events: { pages: { commands: unknown[] }[] }[] }; json.events[0]!.pages[0]!.commands = [command];
    const result = await validatePack({ readJson: file => file === 'maps/map.events.json' ? Promise.resolve(json) : fs.readJson(file), exists: file => fs.exists(file) }, 'base', { commands: builtinCatalog(), scenes: new Map([['x_custom', Type.Object({ count: Type.Integer() })]]) });
    expect(result.diagnostics.some(d => d.code === code && d.pointer.endsWith(suffix))).toBe(true);
  }
  const json = await fs.readJson('maps/map.events.json') as { events: { pages: { trigger: string; commands: unknown[] }[] }[] };
  json.events[0]!.pages[0]!.trigger = 'parallel'; json.events[0]!.pages[0]!.commands = [{ cmd: 'scene', name: 'ending', args: { title: 'End', lines: [] } }];
  const result = await validatePack({ readJson: file => file === 'maps/map.events.json' ? Promise.resolve(json) : fs.readJson(file), exists: fs.exists.bind(fs) }, 'base', { commands: builtinCatalog() });
  expect(result.diagnostics.some(d => d.code === 'V7')).toBe(true);
});
it('manor puzzle replay twice gives identical result and state', async () => {
  const fs = new FsSource('packs/manor'), plugin = await nodePluginRuntime(fs, fs.root);
  const pack = (await validatePack(fs, 'manor', plugin.validationOptions)).pack!;
  const scenario = await fs.readJson('tests/lamps.scenario.json'); const snapshots: unknown[] = [];
  for (let i = 0; i < 2; i++) await runScenario(pack, scenario, (p, start, state) => { const session = new GameSession(p, { plugins: plugin }, start, state); const original = session.tick.bind(session); session.tick = input => { original(input); snapshots.push(session.game.snapshot); }; return session; });
  const half = snapshots.length / 2; expect(snapshots.slice(0, half)).toEqual(snapshots.slice(half));
});

it('ending wrapping uses the same pure measurement port and snapshot copies cannot alter scene state', () => {
  const g = game(); const text = '긴 결말 문장은 화면 안에서 여러 줄로 표시되어야 한다. '.repeat(4);
  g.scenes.open('ending', { title: 'End', lines: [text] }); g.tick(input());
  const scene = g.snapshot.scenes[0]!;
  const lines = scene.draw.filter(c => c.kind === 'text' && c.y >= 68);
  expect(lines.length).toBeGreaterThan(1);
  for (const line of lines) if (line.kind === 'text') expect(g['sceneContext']().textMeasurer.width(line.text)).toBeLessThanOrEqual(base.game.screen.width - 48);
  (scene.state as { title: string }).title = 'mutated';
  expect((g.scenes.snapshot[0]!.state as { title: string }).title).toBe('End');
});
