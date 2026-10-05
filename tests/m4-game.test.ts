import { expect, it, vi } from 'vitest';
import { Game } from '../engine/sim/Game';
import type { GameOptions } from '../engine/sim/Game';
import type { EventDefinition, GameConfig } from '../engine/data/game';
import type { Command } from '../engine/data/events';
import type { TileMapData } from '../engine/data/loader/tiled';
import type { Action } from '../engine/sim/ports';
import type { LoadedMap } from '../engine/sim/world/MapLoader';
const empty = { held: new Set<Action>(), pressed: new Set<Action>() };
const input = (...keys: Action[]) => ({ held: new Set(keys), pressed: new Set(keys) });
const data = (): TileMapData => ({ width: 8, height: 8, tilewidth: 16, tileheight: 16, layers: [], tilesets: [], tileLookup: new Map() });
const commands = (n: number): Command[] => [{ cmd: 'set_var', var: 'n', op: 'add', value: n }];
const event = (id: string, trigger: 'auto' | 'parallel' | 'touch' | 'action' | 'none', list: Command[], x = 2, y = 1, through = true): EventDefinition => ({ id, x, y, pages: [{ trigger, through, character: 'hero', commands: list }] });
function create(events: EventDefinition[], options: GameOptions = {}, override: Partial<GameConfig> = {}) {
  return new Game({ id: 'test', version: '0.1.0', formatVersion: 1, plugins: [], labels: { continue: 'Continue', newGame: 'New' }, title: 'Test', tileSize: 16, screen: { width: 160, height: 160 }, maps: ['a', 'b'], start: { map: 'a', x: 1, y: 1, dir: 'right' }, player: 'hero', state: { flags: { done: false }, vars: { n: 0 } }, ...override }, data(), { hero: { placeholder: '#fff', moveTicks: 2 } }, events, options);
}
const ticks = (game: Game, n: number) => { for (let i = 0; i < n; i++) game.tick(empty); };
async function until(game: Game, test: () => boolean, max = 100) {
  for (let i = 0; i < max && !test(); i++) { await Promise.resolve(); game.tick(empty); }
  expect(test()).toBe(true);
}
it('touch only queues on completion, runs next tick once and waits for reentry', () => {
  const g = create([event('door', 'touch', commands(1))]);
  g.tick(input('right')); expect(g.state.getVar('n')).toBe(0);
  g.tick(empty); expect(g.state.getVar('n')).toBe(0);
  g.tick(empty); expect(g.state.getVar('n')).toBe(1);
  ticks(g, 5); expect(g.state.getVar('n')).toBe(1);
  g.tick(input('left')); ticks(g, 2); g.tick(input('right')); ticks(g, 2);
  expect(g.state.getVar('n')).toBe(2);
});
it('blocked non-through touch queues, respects array order and a full action slot', () => {
  const g = create([event('touch_first', 'touch', commands(1), 2, 1, false), event('touch_second', 'touch', commands(10), 2, 1, false), event('under', 'action', commands(100), 1, 1)]);
  g.tick(input('right', 'ok')); expect(g.player.moving).toBe(false); expect(g.state.getVar('n')).toBe(0);
  g.tick(empty); expect(g.state.getVar('n')).toBe(1);
});
it('slot wins over auto and auto picks first array event, then repeats while active', () => {
  const g = create([event('auto_first', 'auto', commands(10), 5, 5), event('auto_second', 'auto', commands(100), 6, 5), event('action', 'action', commands(1))]);
  g.tick(input('ok')); expect(g.state.getVar('n')).toBe(10);
  g.tick(empty); expect(g.state.getVar('n')).toBe(11);
  g.tick(empty); expect(g.state.getVar('n')).toBe(21);
});
it('parallel finishes then restarts next tick; page change aborts nested coroutine and starts new page', () => {
  const g = create([{ id: 'npc', x: 4, y: 4, pages: [
    { trigger: 'parallel', commands: [{ cmd: 'wait', frames: 2 }, ...commands(1)] },
    { when: { flag: 'done', is: true }, trigger: 'parallel', commands: commands(10) },
  ] }]);
  g.tick(empty); g.tick(empty); expect(g.state.getVar('n')).toBe(0);
  g.tick(empty); expect(g.state.getVar('n')).toBe(1);
  g.tick(empty); expect(g.state.getVar('n')).toBe(1);
  g.state.setFlag('done', true); g.tick(empty); expect(g.state.getVar('n')).toBe(11);
  g.tick(empty); expect(g.state.getVar('n')).toBe(21);
});
it('parallel rejects forbidden commands through common and nested if', () => {
  const g = create([event('npc', 'parallel', [{ cmd: 'call', common: 'dialogue' }])], { commonEvents: { dialogue: { commands: [{ cmd: 'if', cond: { all: [] }, then: [{ cmd: 'text', text: 'no' }] }] } } });
  expect(() => g.tick(empty)).toThrow('forbidden in parallel');
});
it('routes block input, skip blocked tokens, turn, wait, and finish a current step before replacement', () => {
  const g = create([event('wall', 'none', [], 2, 1, false)]);
  const route = g.player.setRoute(['right', 'face:up', 'wait:2', 'down']);
  g.tick(input('left')); expect(g.player.x).toBe(1); expect(g.player.dir).toBe('up');
  g.tick(empty); expect(g.player.moving).toBe(false);
  g.tick(empty); expect(g.player.moving).toBe(true);
  const replacement = g.player.setRoute(['left']); expect(route.done).toBe(true);
  g.tick(empty); expect(g.player.y).toBe(1);
  g.tick(empty); expect(g.player.y).toBe(2); expect(g.player.moving).toBe(true);
  ticks(g, 2); expect([g.player.x, g.player.y]).toEqual([0, 2]); expect(replacement.done).toBe(true);
});
it('move wait resumes only after route completion; invisible events still block', () => {
  const g = create([event('npc', 'action', [{ cmd: 'show_character', target: 'this', visible: false }, { cmd: 'move', target: 'this', route: ['down'], wait: true }, ...commands(1)], 2, 1, false)]);
  g.tick(input('ok')); g.tick(empty); expect(g.events[0]?.visible).toBe(false);
  expect(g.map.canEnter(g.player, 2, 1)).toBe(false); expect(g.map.canEnter(g.player, 2, 2)).toBe(false);
  ticks(g, 2); expect(g.state.getVar('n')).toBe(0);
  g.tick(empty); expect(g.state.getVar('n')).toBe(1);
});
it('common preserves caller this/self, stop unwinds entire call tree and depth 17 fails', () => {
  const g = create([event('npc', 'action', [{ cmd: 'call', common: 'outer' }, ...commands(999)])], { commonEvents: {
    outer: { commands: [{ cmd: 'call', common: 'inner' }, ...commands(999)] },
    inner: { commands: [{ cmd: 'face', target: 'this', dir: 'up' }, { cmd: 'set_self_flag', name: 'seen', value: true }, ...commands(1), { cmd: 'stop' }] },
  } });
  g.tick(input('ok')); g.tick(empty); expect(g.state.getVar('n')).toBe(1);
  expect(g.state.getSelf('a', 'npc', 'seen')).toBe(true); expect(g.events[0]?.dir).toBe('up');
  const recursive = create([event('npc', 'auto', [{ cmd: 'call', common: 'loop' }])], { commonEvents: { loop: { commands: [{ cmd: 'call', common: 'loop' }] } } });
  expect(() => recursive.tick(empty)).toThrow('depth exceeds 16');
});
it('effects progress after movement, use deterministic sine and replacement finishes old waits', () => {
  const g = create([]), fade = g.effects.startFade('black', 2), shake = g.effects.startShake(4, 3);
  g.tick(empty); expect(g.snapshot.fade).toBe(0.5); expect(g.snapshot.shake).toBe(4 * Math.sin(1.3));
  g.tick(empty); expect(fade.done).toBe(true); expect(g.snapshot.fade).toBe(1);
  const previous = g.effects.startFade('clear', 5); g.effects.startFade('black', 1); expect(previous.done).toBe(true);
  g.tick(empty); expect(shake.done).toBe(true); expect(g.snapshot.shake).toBe(0);
});
it('transfer executes six phases, awaits platform readiness, resumes on new map with old self scope and no landing touch', async () => {
  const order: string[] = []; let ready: (map: LoadedMap) => void = () => {};
  const load = vi.fn((id: string) => { order.push(`load:${id}`); return new Promise<LoadedMap>(resolve => { ready = resolve; }); });
  const g = create([event('door', 'action', [{ cmd: 'transfer', map: 'b', marker: 'entry', dir: 'up' }, { cmd: 'set_self_flag', name: 'used', value: true }, { cmd: 'face', target: 'this', dir: 'down' }, { cmd: 'move', target: 'this', route: ['right'], wait: true }, { cmd: 'move', target: 'resident', route: ['down'], wait: true }, ...commands(1)]), event('wander', 'parallel', commands(10), 6, 6)], {
    mapLoader: { load }, hooks: { mapLeave: id => order.push(`leave:${id}`), mapEnter: id => order.push(`enter:${id}`) },
  });
  g.tick(input('ok')); g.tick(empty); ticks(g, 14);
  expect(g.snapshot.fade).toBe(1); expect(order).toEqual([]); expect(load).not.toHaveBeenCalled();
  g.tick(empty); expect(order).toEqual(['leave:a', 'load:b']); const before = g.state.getVar('n');
  ticks(g, 5); expect(g.state.getVar('n')).toBe(before); expect(g.map.id).toBe('a'); expect(g.main.running).toBe(true);
  const next = data(); next.layers.push({ type: 'objectgroup', name: 'markers', objects: [{ name: 'entry', point: true, x: 16, y: 16 }] });
  ready({ data: next, events: [event('landing', 'touch', commands(999), 1, 1), event('resident', 'none', [], 4, 4)] });
  await Promise.resolve(); g.tick(empty);
  expect(order).toEqual(['leave:a', 'load:b', 'enter:b']); expect(g.map.id).toBe('b'); expect(g.player.dir).toBe('up');
  expect(g.state.getSelf('a', 'door', 'used')).toBe(false);
  ticks(g, 14); expect(g.snapshot.fade).toBe(0);
  g.tick(empty); expect(g.state.getSelf('a', 'door', 'used')).toBe(true); expect(g.state.getSelf('b', 'door', 'used')).toBe(false);
  await until(g, () => !g.main.running); expect(g.state.getVar('n')).toBe(before + 1); expect(g.events[1]?.y).toBe(5);
  ticks(g, 3); expect(g.state.getVar('n')).toBe(before + 1);
});
it('reentry recreates event placement, direction, visibility and route but retains self flags and effects', async () => {
  const original = [event('door', 'action', [{ cmd: 'transfer', map: 'b', x: 1, y: 1, fade: false }]), event('npc', 'none', [], 4, 4)];
  const g = create(original, { mapLoader: { load: async id => ({ data: data(), events: id === 'a' ? original : [event('back', 'auto', [{ cmd: 'transfer', map: 'a', x: 1, y: 1, fade: false }], 5, 5)] }) } });
  const npc = g.events[1]!; npc.visible = false; npc.dir = 'up'; npc.setRoute(['right', 'wait:100']);
  g.state.setSelf('a', 'npc', 'seen', true); g.effects.startFade('black', 1);
  g.tick(input('ok')); g.tick(empty); await until(g, () => g.map.id === 'b'); await until(g, () => g.map.id === 'a');
  expect(g.events[1]).not.toBe(npc); expect([g.events[1]?.x, g.events[1]?.y, g.events[1]?.dir, g.events[1]?.visible, g.events[1]?.routed]).toEqual([4, 4, 'down', true, false]);
  expect(g.state.getSelf('a', 'npc', 'seen')).toBe(true); expect(g.snapshot.fade).toBe(1);
});
it('transfer cancels player movement and route and reports loader failures as fatal', async () => {
  const g = create([event('auto', 'auto', [{ cmd: 'transfer', map: 'b', x: 3, y: 3, fade: false }])], { mapLoader: { load: async () => ({ data: data(), events: [] }) } });
  g.player.beginMove(2, 1); const route = g.player.setRoute(['down']);
  g.tick(empty); await until(g, () => g.map.id === 'b');
  expect([g.player.x, g.player.y, g.player.moving, route.done]).toEqual([3, 3, false, true]);
  const broken = create([event('auto', 'auto', [{ cmd: 'transfer', map: 'b', x: 1, y: 1, fade: false }])], { mapLoader: { load: async () => { throw new Error('image failed'); } } });
  broken.tick(empty); await Promise.resolve(); expect(() => broken.tick(empty)).toThrow('image failed');
});
it('sixteen nested common calls are allowed and default fade/shake waits follow their command defaults', () => {
  const commonEvents: NonNullable<GameOptions['commonEvents']> = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`c${i}`, { commands: i === 15 ? commands(1) : [{ cmd: 'call', common: `c${i + 1}` }] }]));
  const g = create([event('npc', 'action', [{ cmd: 'call', common: 'c0' }, { cmd: 'shake' }, { cmd: 'fade', to: 'black' }, ...commands(1)])], { commonEvents });
  g.tick(input('ok')); g.tick(empty); expect(g.state.getVar('n')).toBe(1);
  expect(g.snapshot.fade).toBeCloseTo(1 / 30); expect(g.snapshot.shake).toBe(4 * Math.sin(1.3));
  ticks(g, 29); expect(g.state.getVar('n')).toBe(1); expect(g.snapshot.fade).toBe(1);
  g.tick(empty); expect(g.state.getVar('n')).toBe(2);
});
it('touch landing can fire again only after the transferred player leaves and completes reentry', async () => {
  const g = create([event('door', 'auto', [{ cmd: 'transfer', map: 'b', x: 1, y: 1, fade: false }])], { mapLoader: { load: async () => ({ data: data(), events: [event('landing', 'touch', commands(1), 1, 1)] }) } });
  g.tick(empty); await until(g, () => g.map.id === 'b'); ticks(g, 3); expect(g.state.getVar('n')).toBe(0);
  g.tick(input('right')); ticks(g, 2); g.tick(input('left')); g.tick(empty); expect(g.state.getVar('n')).toBe(0);
  g.tick(empty); expect(g.state.getVar('n')).toBe(1);
});
