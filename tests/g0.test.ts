import { expect, it, vi } from 'vitest';
import { Game } from '../engine/sim/Game';
import type { EventDefinition } from '../engine/data/game';
import { MapNameState } from '../engine/sim/ui/MapNameState';
import { GameSession } from '../engine/sim/state/GameSession';
import { validatePack } from '../engine/data/validator/validate';
import { fixtureSource } from './fixtureSource';
import { FsSource } from '../tools/fsSource';
import { builtinCatalog } from '../tools/catalog';
import { runScenario } from '../engine/data/scenarios/run';
import { scenarioGame } from '../tools/scenarioGame';
import { FilmSession } from '../engine/film/session';
import { drawMapName } from '../engine/platform/renderer/mapName';
const empty = { held: new Set<never>(), pressed: new Set<never>() };
const map = { width: 8, height: 8, tilewidth: 16, tileheight: 16, layers: [], tilesets: [], tileLookup: new Map() };
function create(pages: EventDefinition['pages']) {
  return new Game({ id: 'test', version: '0.1.0', formatVersion: 1, plugins: [], labels: { continue: 'Continue', newGame: 'New' }, title: 'Test', tileSize: 16, screen: { width: 160, height: 160 }, maps: ['map'], mapNames: { map: '서재' }, start: { map: 'map', x: 1, y: 1, dir: 'right' }, player: 'hero', state: { flags: { met: false }, vars: { n: 0 } } }, map, { hero: { placeholder: '#fff', moveTicks: 2 } }, [{ id: 'npc', x: 3, y: 3, pages }]);
}
function ticks(game: Game, count: number) { for (let i = 0; i < count; i++) game.tick(empty); }
it('wander repeats and finishes its current tile before pausing for the main interpreter', () => {
  const g = create([{ trigger: 'action', character: 'hero', wander: ['right', 'down', 'left', 'up'], commands: [] }]);
  const npc = g.events[0]!;
  g.tick(empty); expect(npc.destination).toMatchObject({ x: 4, y: 3 });
  g.main.start([{ cmd: 'text', text: '대화' }], g['host'](npc));
  ticks(g, 6); expect([npc.x, npc.y, npc.moving]).toEqual([4, 3, false]);
  g.main.abort(); ticks(g, 12); expect(npc.y).not.toBe(3);
});
it('a command route takes precedence over wander and wander resumes at its saved token', () => {
  const g = create([{ trigger: 'action', character: 'hero', wander: ['wait:3', 'right', 'wait:100'], commands: [] }]);
  const npc = g.events[0]!; g.tick(empty);
  g.main.start([{ cmd: 'move', target: 'npc', route: ['up'], wait: true }], g['host'](npc));
  ticks(g, 4); expect(npc.y).toBe(2); expect(npc.x).toBe(3);
  ticks(g, 8); expect(npc.x).toBe(4); expect(npc.y).toBe(2);
});
it('wander wait counters pause, page changes reset routes and empty/blocked loops stay bounded', () => {
  const g = create([
    { trigger: 'action', character: 'hero', wander: ['wait:3', 'right'], commands: [] },
    { trigger: 'action', character: 'hero', when: { flag: 'met', is: true }, wander: ['left'], commands: [] },
  ]);
  const npc = g.events[0]!; g.tick(empty);
  g.main.start([{ cmd: 'wait', frames: 20 }], g['host'](npc)); ticks(g, 10); expect(npc.moving).toBe(false);
  g.main.abort(); g.tick(empty); expect(npc.moving).toBe(false);
  ticks(g, 2); expect(npc.destination).toMatchObject({ x: 4, y: 3 }); ticks(g, 2);
  g.state.setFlag('met', true); g.tick(empty); expect(npc.destination).toMatchObject({ x: 3, y: 3 });
  const idle = create([{ trigger: 'action', character: 'hero', wander: [], commands: [] }]); ticks(idle, 100); expect(idle.events[0]!.moving).toBe(false);
  const blocked = create([{ trigger: 'action', character: 'hero', wander: ['face:up', 'up'], commands: [] }]);
  ticks(blocked, 50); expect(blocked.events[0]!.y).toBe(0); expect(blocked.events[0]!.moving).toBe(false);
});
it('map names last 90 ticks, fade over the last 20, clear on unnamed maps and can be replayed', () => {
  const state = new MapNameState(); state.show('온실');
  expect(state.snapshot).toEqual({ text: '온실', ticksRemaining: 90, alpha: 1 });
  for (let i = 0; i < 71; i++) state.update(); expect(state.snapshot?.alpha).toBe(0.95);
  for (let i = 0; i < 18; i++) state.update(); expect(state.snapshot?.alpha).toBe(0.05);
  state.update(); expect(state.snapshot).toBeNull(); state.show(); expect(state.snapshot).toBeNull();
  const g = create([{ trigger: 'none', commands: [] }]); ticks(g, 90); expect(g.snapshot.mapName).toBeNull();
  g.main.start([{ cmd: 'show_map_name' }], g['host'](g.events[0]!)); g.tick(empty);
  expect(g.snapshot.mapName).toEqual({ text: '서재', ticksRemaining: 90, alpha: 1 });
});
it('the banner renderer applies skin colors and restores canvas state', async () => {
  const skin = await new FsSource('tests/fixtures/base').readJson('skin.json') as import('../engine/data/skin').Skin;
  const context = { save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), globalAlpha: 1, fillStyle: '', font: '', textAlign: '', textBaseline: '', canvas: { width: 480 } };
  drawMapName(context as unknown as CanvasRenderingContext2D, { text: '방', ticksRemaining: 10, alpha: 0.5 }, { ...skin, colors: { ...skin.colors, mapNameText: '#123456', mapNameBackground: '#abcdef' } });
  expect(context.fillRect).toHaveBeenCalledWith(0, 0, 480, skin.font.lineHeight + skin.window.padding * 2);
  expect(context.fillText).toHaveBeenCalledWith('방', 240, skin.window.padding); expect(context.globalAlpha).toBe(0.5); expect(context.fillStyle).toBe('#123456'); expect(context.restore).toHaveBeenCalledOnce();
});
it.each(['diagonal', 'wait:0', 'wait:99999999999999999999'])('rejects invalid wander token %s as V9 with its location', async token => {
  const source = await fixtureSource([{ op: 'set', file: 'maps/map.events.json', pointer: '/events/0/pages/0/wander', value: [token] }]);
  const { diagnostics } = await validatePack(source, 'base', { commands: builtinCatalog() });
  expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'V9', file: 'maps/map.events.json', pointer: '/events/0/pages/0/wander/0' }));
});
it('validates map name references and permits action dialogue on a wandering page without V7', async () => {
  const source = await fixtureSource([
    { op: 'set', file: 'game.json', pointer: '/mapNames', value: { missing: '방' } },
    { op: 'set', file: 'maps/map.events.json', pointer: '/events/0/pages/0/wander', value: ['left', 'wait:60', 'right'] },
  ]);
  const { diagnostics } = await validatePack(source, 'base', { commands: builtinCatalog() });
  expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'V3', pointer: '/mapNames/missing' })); expect(diagnostics.some(d => d.code === 'V7')).toBe(false);
});
async function pack() { return (await validatePack(new FsSource('tests/fixtures/base'), 'base', { commands: builtinCatalog() })).pack!; }
it('reload restores a distinct Game, saved flags/vars/self flags/position and evaluates the save rather than live state', async () => {
  const runtime = new GameSession(await pack()); const original = runtime.game;
  original.state.setFlag('met', true); original.state.setVar('n', 42); original.state.setSelf('map', 'npc', 'done', true);
  original.main.start([{ cmd: 'save' }], original['host'](original.events[0]!)); original.tick(empty);
  original.state.setFlag('met', false); original.state.setVar('n', 1); original.player.place(0, 0, 'up');
  expect(runtime.expectSave({ flag: 'met', is: true })).toBe(true);
  expect(runtime.expectSave({ var: 'n', op: '==', value: 42 })).toBe(true);
  expect(runtime.expectSave({ self: 'done', map: 'map', event: 'npc', is: true })).toBe(true);
  const copy = runtime.lastSave!; copy.flags.met = false; expect(runtime.expectSave({ flag: 'met', is: true })).toBe(true);
  runtime.reload(); expect(runtime.game).not.toBe(original); expect(runtime.game.state.getFlag('met')).toBe(true);
  expect(runtime.game.state.getVar('n')).toBe(42); expect([runtime.player.x, runtime.player.y, runtime.player.dir]).toEqual([1, 1, 'right']);
  expect(runtime.game.main.running).toBe(false); expect(runtime.game.state.getSelf('map', 'npc', 'done')).toBe(true);
});
it('scenario JSON and film use the same saved snapshot and fail explicitly without a save', async () => {
  const data = await pack();
  const session = new GameSession(data); expect(() => session.reload()).toThrow('without a save'); expect(() => session.expectSave({ flag: 'met', is: false })).toThrow('No saved data');
  await runScenario(data, { name: 'No save', steps: [{ reload: true }] }, scenarioGame).then(() => { throw new Error('Expected failure'); }, error => expect(String(error)).toContain('without a save'));
  session.game.state.setFlag('met', true); session.game.main.start([{ cmd: 'save' }], session.game['host'](session.game.events[0]!)); session.tick(empty); session.game.state.setFlag('met', false);
  const film = new FilmSession(session.game, { name: 'Reload', steps: [{ expectSave: { flag: 'met', is: true } }, { reload: true }, { expect: { flag: 'met', is: true } }] }, session);
  await film.tick(); expect(film.game).toBe(session.game); expect(film.game.state.getFlag('met')).toBe(true); expect(film.driver.done).toBe(true);
});
it('transfer shows the destination name and reentry resets wander position while keeping self flags', async () => {
  const g = new Game({ id: 'test', version: '0.1.0', formatVersion: 1, plugins: [], labels: { continue: 'Continue', newGame: 'New' }, title: 'Test', tileSize: 16, screen: { width: 160, height: 160 }, maps: ['map', 'other'], mapNames: { map: '서재', other: '온실' }, start: { map: 'map', x: 1, y: 1, dir: 'right' }, player: 'hero', state: { flags: {}, vars: {} } }, map, { hero: { placeholder: '#fff', moveTicks: 2 } }, [{ id: 'npc', x: 3, y: 3, pages: [{ trigger: 'action', character: 'hero', wander: ['right', 'wait:100'], commands: [] }] }], {
    mapLoader: { load: async id => ({ data: map, events: id === 'map' ? [{ id: 'npc', x: 3, y: 3, pages: [{ trigger: 'action', character: 'hero', wander: ['right', 'wait:100'], commands: [] }] }] : [] }) },
  });
  ticks(g, 3); expect(g.events[0]!.x).toBe(4); g.state.setSelf('map', 'npc', 'known', true);
  const old = g.events[0]!;
  g.main.start([{ cmd: 'transfer', map: 'other', x: 1, y: 1, fade: false }], g['host'](old));
  g.tick(empty); await Promise.resolve(); g.tick(empty);
  expect(g.snapshot.mapName).toEqual({ text: '온실', ticksRemaining: 90, alpha: 1 });
  g.main.start([{ cmd: 'transfer', map: 'map', x: 1, y: 1, fade: false }], g['host'](old));
  g.tick(empty); await Promise.resolve(); g.tick(empty);
  expect(g.events[0]).not.toBe(old); expect(g.events[0]!.x).toBe(3); expect(g.events[0]!.destination).toMatchObject({ x: 4, y: 3 });
  expect(g.state.getSelf('map', 'npc', 'known')).toBe(true); expect(g.snapshot.mapName?.text).toBe('서재');
});
it('a scenario save survives subsequent live flag changes before reload', async () => {
  const base = await pack(); const events = new Map(base.events); const data = { ...base, events }; events.set('map', [{ id: 'saving', x: 2, y: 1, pages: [{ trigger: 'action', through: true, commands: [
    { cmd: 'set_flag', flag: 'met', value: true }, { cmd: 'save' }, { cmd: 'set_flag', flag: 'met', value: false },
  ] }] }]);
  await runScenario(data, { name: 'Saved state isolation', steps: [{ press: 'ok' }, { settle: true }, { expect: { flag: 'met', is: false } }, { expectSave: { flag: 'met', is: true } }, { reload: true }, { expect: { flag: 'met', is: true } }] }, scenarioGame);
});
it('reload invokes the loadSave hook once then reapplies declaration and position checks', async () => {
  const { PluginRuntime } = await import('../engine/sim/plugins/PluginRuntime');
  const { API_VERSION } = await import('../engine/api');
  const hook = vi.fn((save: import('../engine/api').SaveData) => { save.flags.extra = true; save.vars.n = 9; save.x = -1; });
  const plugins = new PluginRuntime('0.5.0', [{ name: 'probe', module: { id: 'probe', apiVersion: API_VERSION, register(api) { api.hooks.on('loadSave', hook); } } }]);
  const runtime = new GameSession(await pack(), { plugins });
  runtime.game.main.start([{ cmd: 'save' }], runtime.game['host'](runtime.game.events[0]!)); runtime.tick(empty); runtime.reload();
  expect(hook).toHaveBeenCalledOnce(); expect(runtime.game.state.snapshot().flags).toEqual({ met: false });
  expect(runtime.game.state.getVar('n')).toBe(9); expect(runtime.player.x).toBe(1);
});
