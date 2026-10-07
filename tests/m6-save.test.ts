import { beforeAll, expect, it, vi } from 'vitest';
import { validatePack } from '../engine/data/validator/validate';
import type { ValidatedPack } from '../engine/data/validator/types';
import { FsSource } from '../tools/fsSource';
import { builtinCatalog, registerBuiltins } from '../engine/sim/commands';
import { CommandRegistry } from '../engine/sim/event/CommandRegistry';
import { loadSave } from '../engine/sim/state/loadSave';
import { migrateSave, saveMigrations } from '../engine/sim/state/saveMigrations';
import { SaveStorage } from '../engine/platform/storage';
import { Game } from '../engine/sim/Game';
let pack: ValidatedPack;
beforeAll(async () => { pack = (await validatePack(new FsSource('tests/fixtures/base'), 'base', { commands: builtinCatalog() })).pack!; });
const saved = (overrides: Record<string, unknown> = {}) => JSON.stringify({ saveVersion: 1, packId: 'base', gameVersion: '0.0.9', engineVersion: '0.1.0', savedAt: '2026-10-07T00:00:00.000Z', map: 'map', x: 3, y: 3, dir: 'left', flags: { met: true }, vars: { n: 8 }, selfFlags: { 'map:npc:opened': true }, ...overrides });
const load = (raw: string | null, options: Parameters<typeof loadSave>[4] = {}) => loadSave(raw, pack.game, pack.events, pack.maps, options);
it('catalog and runtime expose exactly the same command names, including save', () => {
  const registry = new CommandRegistry(); registerBuiltins(registry);
  expect([...registry.catalog.keys()].sort()).toEqual([...builtinCatalog().keys()].sort()); expect(registry.catalog.has('save')).toBe(true);
});
it('step 1 rejects missing/broken JSON and wrong pack before version checks or hooks', () => {
  const hook = vi.fn(state => state);
  for (const raw of [null, '{', 'null', '[]', saved({ packId: 'other', saveVersion: 99 })]) {
    expect(load(raw, { loadSave: hook })).toEqual({ state: null, fromGameVersion: '', warnings: [] });
  }
  expect(hook).not.toHaveBeenCalled();
});
it('step 2 rejects future/invalid versions and warns, without continuing the load', () => {
  const hook = vi.fn(state => state);
  expect(load(saved({ saveVersion: 2 }), { loadSave: hook }).warnings).toContain('Save version is newer than this engine');
  for (const version of ['1', -1, null, 1.5]) expect(load(saved({ saveVersion: version })).state).toBeNull();
  expect(hook).not.toHaveBeenCalled(); expect(saveMigrations).toEqual([]);
});
it('step 2 runs older saves through migrations before merging declarations', () => {
  const migration = { from: 0, to: 1, up: (data: Record<string, unknown>) => ({ ...data, saveVersion: 1, gameVersion: 'migrated', vars: { n: 42 } }) };
  const result = load(saved({ saveVersion: 0 }), { migrations: [migration] });
  expect(result.state?.vars.n).toBe(42); expect(result.fromGameVersion).toBe('0.0.9');
});
it('step 3 restores only declared keys, falls back for invalid types/new declarations and reports removed keys', () => {
  const game = { ...pack.game, state: { flags: { ...pack.game.state.flags, added: true }, vars: { ...pack.game.state.vars, added: 5 } } };
  const result = loadSave(saved({ flags: { met: 'bad', removed: true }, vars: { n: 1.5, removed: 10 } }), game, pack.events, pack.maps);
  expect(result.state?.flags).toEqual({ met: false, added: true }); expect(result.state?.vars).toEqual({ n: 0, added: 5 });
  expect(result.warnings).toEqual(['Dropped undeclared flag: removed', 'Dropped undeclared variable: removed']);
  expect(load(saved({ vars: { n: Number.MAX_SAFE_INTEGER + 1 } })).state?.vars.n).toBe(0);
});
it('step 4 retains only well-formed boolean self flags of existing maps and events', () => {
  const result = load(saved({ selfFlags: { 'map:npc:opened': true, 'map:npc:closed': false, 'other:npc:opened': true, 'map:missing:opened': true, 'map:npc:BAD': true, 'map:npc:bad:extra': true, 'map:npc:wrong': 1 } }));
  expect(result.state?.selfFlags).toEqual({ 'map:npc:opened': true, 'map:npc:closed': false });
});
it.each([{ map: 'missing' }, { x: -1 }, { y: 8 }, { x: 1.5 }])('step 5 falls back to game.start for invalid placement %j', overrides => {
  const state = load(saved(overrides)).state!;
  expect({ map: state.map, x: state.x, y: state.y, dir: state.dir }).toEqual(pack.game.start);
});
it('step 5 falls back on collision and restores valid positions/directions', () => {
  const maps = new Map(pack.maps), map = pack.maps.get('map')!;
  const blocked = { ...map, layers: map.layers.map(layer => layer.type === 'tilelayer' && layer.name === 'collision' ? { ...layer, data: layer.data.map((gid, i) => i === 27 ? 1 : gid) } : layer) };
  maps.set('map', blocked);
  expect(loadSave(saved(), pack.game, pack.events, maps).state?.x).toBe(pack.game.start.x);
  expect(load(saved()).state).toMatchObject({ map: 'map', x: 3, y: 3, dir: 'left' });
});
it('step 6 invokes the injected transform after merging, filtering and position fallback, passing original gameVersion', () => {
  const hook = vi.fn((state, from) => { expect(from).toBe('0.0.9'); expect(state.x).toBe(1); expect(state.flags).toEqual({ met: true }); expect(state.selfFlags).toEqual({ 'map:npc:opened': true }); return { ...state, vars: { n: 20 } }; });
  expect(load(saved({ x: -1 }), { loadSave: hook }).state?.vars.n).toBe(20); expect(hook).toHaveBeenCalledTimes(1);
});
it('migration runner orders fake steps, preserves its input and rejects gaps, duplicates and wrong resulting versions', () => {
  const input = { saveVersion: 0, vars: { old: 7 } };
  const zero = { from: 0, to: 1, up: (data: Record<string, unknown>) => ({ ...data, saveVersion: 1, vars: { n: (data.vars as { old: number }).old } }) };
  const one = { from: 1, to: 2, up: (data: Record<string, unknown>) => ({ ...data, saveVersion: 2, flags: { migrated: true } }) };
  expect(migrateSave(input, 2, [one, zero])).toEqual({ saveVersion: 2, vars: { n: 7 }, flags: { migrated: true } }); expect(input).toEqual({ saveVersion: 0, vars: { old: 7 } });
  expect(() => migrateSave(input, 2, [zero])).toThrow('Missing'); expect(() => migrateSave(input, 1, [zero, zero])).toThrow('ambiguous');
  expect(() => migrateSave(input, 1, [{ ...zero, up: data => data }])).toThrow('advance');
});
it('save executes through registerBuiltins, persists only logical state and reload starts with reset runtime effects/events', () => {
  const savedStates: Parameters<NonNullable<import('../engine/sim/Game').GameOptions['save']>>[0][] = [];
  const events = [{ id: 'point', x: 2, y: 1, pages: [{ trigger: 'action' as const, commands: [{ cmd: 'set_self_flag', name: 'used', value: true }, { cmd: 'save' }, { cmd: 'set_var', var: 'n', value: 99 }] }] }];
  const game = new Game(pack.game, pack.maps.get('map')!, pack.characters, events, { save: state => savedStates.push(state) });
  game.player.dir = 'right'; game.effects.startShake(4, 20);
  game.tick({ held: new Set(), pressed: new Set(['ok']) }); game.tick({ held: new Set(), pressed: new Set() });
  expect(savedStates).toHaveLength(1); expect(savedStates[0]?.vars.n).toBe(0); expect(game.state.getVar('n')).toBe(99);
  expect(Object.keys(savedStates[0]!).sort()).toEqual(['dir', 'flags', 'map', 'selfFlags', 'vars', 'x', 'y']);
  const state = savedStates[0]!;
  const reloaded = new Game({ ...pack.game, state: { flags: state.flags, vars: state.vars } }, pack.maps.get('map')!, pack.characters, events, { selfFlags: state.selfFlags });
  expect(reloaded.state.getSelf('map', 'point', 'used')).toBe(true); expect(reloaded.main.running).toBe(false);
  expect(reloaded.snapshot).toMatchObject({ fade: 0, shake: 0, message: null, choice: null });
});
it('platform writes the exact SaveData header, localStorage key and injected timestamp', () => {
  const data = new Map<string, string>(); const store = new SaveStorage({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, { packId: 'base', gameVersion: '0.1.0', engineVersion: '0.2.0' }, () => '2026-10-07T12:00:00.000Z');
  expect(store.read()).toBeNull(); store.write(load(saved()).state!);
  expect(JSON.parse(data.get('game-maker:base:slot1')!)).toMatchObject({ saveVersion: 1, packId: 'base', gameVersion: '0.1.0', engineVersion: '0.2.0', savedAt: '2026-10-07T12:00:00.000Z', vars: { n: 8 } });
});
