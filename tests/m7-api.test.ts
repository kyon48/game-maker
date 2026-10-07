import { expect, it } from 'vitest';
import { Type } from '@sinclair/typebox';
import type { CommandContext, GameStateAccess, PluginModule, EngineApi } from '../engine/api';
import { API_VERSION } from '../engine/api';
import { PluginRuntime } from '../engine/sim/plugins/PluginRuntime';
import { Game } from '../engine/sim/Game';
import { GameState } from '../engine/sim/state/GameState';
import { loadSave } from '../engine/sim/state/loadSave';
import type { GameConfig, EventDefinition } from '../engine/data/game';
import type { TileMapData } from '../engine/data/loader/tiled';
import { ESLint } from 'eslint';
type Assert<T extends true> = T;
export type NoInternalContext = Assert<Extract<keyof CommandContext, 'face' | 'evaluate' | 'save' | 'common' | 'transfer' | 'move' | 'call'> extends never ? true : false>;
export type NoInternalState = Assert<Extract<keyof GameStateAccess, 'dirty' | 'clearDirty' | 'snapshot'> extends never ? true : false>;
export type ApiKeys = Assert<keyof EngineApi extends 'engineVersion' | 'commands' | 'conditions' | 'hooks' ? true : false>;
const empty = { held: new Set<never>(), pressed: new Set<never>() };
const config: GameConfig = { id: 'test', title: 'Test', version: '1.0.0', formatVersion: 1, plugins: [], labels: { continue: 'Continue', newGame: 'New' }, tileSize: 16, screen: { width: 160, height: 160 }, maps: ['a', 'b'], start: { map: 'a', x: 1, y: 1, dir: 'right' }, player: 'hero', state: { flags: { met: false }, vars: { n: 0 } } };
const map: TileMapData = { width: 8, height: 8, tilewidth: 16, tileheight: 16, layers: [], tilesets: [], tileLookup: new Map() };
const point = (commands: import('../engine/data/events').Command[]): EventDefinition => ({ id: 'point', x: 2, y: 1, pages: [{ trigger: 'action', commands }] });
function create(plugin: PluginModule, events: EventDefinition[] = []) {
  const runtime = new PluginRuntime('0.3.0', [{ name: plugin.id, module: plugin }]);
  return { runtime, game: new Game(config, map, { hero: { placeholder: '#fff' } }, events, { plugins: runtime, mapLoader: { load: async () => ({ data: map, events: [] }) } }) };
}
it('wraps command context and state, preserving nested generators, self scope and stop semantics', () => {
  let context: CommandContext | undefined;
  const plugin: PluginModule = { apiVersion: API_VERSION, id: 'probe', register(api) {
    api.commands.register('x_probe', { args: Type.Object({}), *run(_args, ctx) {
      context = ctx; ctx.state.setSelf(ctx.thisEvent!.mapId, ctx.thisEvent!.id, 'used', true);
      yield* ctx.runCommands([{ cmd: 'set_var', var: 'n', value: 7 }, { cmd: 'wait', frames: 1 }]); ctx.stop();
    } });
  } };
  const { game } = create(plugin, [point([{ cmd: 'x_probe' }, { cmd: 'set_var', var: 'n', value: 99 }])]);
  game.tick({ held: new Set(), pressed: new Set(['ok']) }); game.tick(empty);
  expect(Object.keys(context!).sort()).toEqual(['player', 'runCommands', 'showChoice', 'showText', 'state', 'stop', 'stopped', 'thisEvent', 'waitFrames', 'waitUntil']);
  expect(Object.keys(context!.state).sort()).toEqual(['getFlag', 'getSelf', 'getVar', 'setFlag', 'setSelf', 'setVar']);
  expect(context!.state).not.toBeInstanceOf(GameState); expect(Object.isFrozen(context!.state)).toBe(true);
  expect(() => context!.state.getVar('unknown')).toThrow('Undeclared');
  expect(game.state.getSelf('a', 'point', 'used')).toBe(true); game.tick(empty); expect(game.state.getVar('n')).toBe(7); expect(game.main.running).toBe(false);
});
it('evaluates plugin conditions with readonly state in pages and boolean composition', () => {
  let keys: string[] = [];
  const plugin: PluginModule = { apiVersion: API_VERSION, id: 'condition', register(api) {
    api.conditions.register('x_positive', { args: Type.Object({ minimum: Type.Integer() }), test(args, state) { keys = Object.keys(state); return state.getVar('n') >= args.minimum; } });
  } };
  const { runtime, game } = create(plugin, [{ id: 'npc', x: 4, y: 4, pages: [{ trigger: 'none', when: { all: [{ plugin: 'x_positive', args: { minimum: 1 } }] } }] }]);
  expect(game.events[0]?.active).toBe(false); game.state.setVar('n', 2); game.tick(empty); expect(game.events[0]?.active).toBe(true);
  expect(keys.sort()).toEqual(['getFlag', 'getSelf', 'getVar']);
  expect(() => runtime.evaluate('x_positive', { minimum: 'bad' }, game.state)).toThrow('Invalid condition arguments');
});
it('rejects duplicate command/condition registration and mismatching plugin versions/filenames', () => {
  const duplicate: PluginModule = { apiVersion: API_VERSION, id: 'duplicate', register(api) { api.commands.register('x_one', { args: Type.Object({}), run() {} }); api.commands.register('x_one', { args: Type.Object({}), run() {} }); } };
  expect(() => new PluginRuntime('1', [{ name: duplicate.id, module: duplicate }])).toThrow('Duplicate command');
  duplicate.register = api => { const definition = { args: Type.Object({}), test: () => true }; api.conditions.register('x_one', definition); api.conditions.register('x_one', definition); };
  expect(() => new PluginRuntime('1', [{ name: duplicate.id, module: duplicate }])).toThrow('Duplicate condition');
  const mismatched = new PluginRuntime('1', [{ name: 'other', module: duplicate }, { name: 'future', module: { ...duplicate, id: 'future', apiVersion: 2 } as unknown as PluginModule }]);
  expect(mismatched.diagnostics.map(item => [item.code, item.pointer])).toEqual([['V2', '/id'], ['V2', '/apiVersion']]);
});
it('emits map/tick hooks at transfer boundaries and loadSave after normalization with full save metadata', async () => {
  const order: string[] = [];
  const plugin: PluginModule = { apiVersion: API_VERSION, id: 'hooks', register(api) {
    api.hooks.on('mapEnter', (ctx, id) => { expect(ctx.mapId).toBe(id); order.push(`enter:${id}:${ctx.player.x}`); });
    api.hooks.on('mapLeave', (ctx, id) => { expect(ctx.mapId).toBe(id); order.push(`leave:${id}`); });
    api.hooks.on('tick', ctx => { order.push(`tick:${ctx.mapId}`); });
    api.hooks.on('loadSave', (save, from) => { expect(save.packId).toBe('test'); expect(save.saveVersion).toBe(1); expect(from).toBe('0.9.0'); expect(save.x).toBe(1); save.vars.n = 12; });
  } };
  const { runtime, game } = create(plugin, [point([{ cmd: 'transfer', map: 'b', x: 3, y: 3, fade: false }])]);
  expect(order).toEqual(['enter:a:1']); game.tick({ held: new Set(), pressed: new Set(['ok']) }); game.tick(empty); await Promise.resolve(); game.tick(empty);
  expect(order).toEqual(['enter:a:1', 'tick:a', 'leave:a', 'tick:a', 'enter:b:3', 'tick:b']);
  const raw = { saveVersion: 1, packId: 'test', gameVersion: '0.9.0', engineVersion: '0.2.0', savedAt: '', map: 'a', x: -1, y: 1, dir: 'left', flags: {}, vars: {}, selfFlags: {} };
  const result = loadSave(JSON.stringify(raw), config, new Map([['a', []]]), new Map([['a', map]]), { loadSave: (state, from) => runtime.loadSave(state, raw, from) });
  expect(result.state?.vars.n).toBe(12);
});
it.each(['promise', 'generator'] as const)('rejects %s returned from a hook', kind => {
  const plugin: PluginModule = { apiVersion: API_VERSION, id: 'waiting', register(api) {
    if (kind === 'promise') api.hooks.on('tick', () => Promise.resolve());
    else api.hooks.on('tick', () => (function* () { yield 1; })());
  } };
  const { game } = create(plugin); expect(() => game.tick(empty)).toThrow('Hook cannot wait');
});
it('ESLint rejects direct sim imports from a pack plugin while allowing the public API and TypeBox', async () => {
  const eslint = new ESLint();
  const results = await eslint.lintText("import { Game } from '../../../engine/sim/Game'; export default Game;", { filePath: 'packs/demo/plugins/probe.ts' });
  expect(results[0]?.messages.some(message => message.ruleId === 'architecture/boundary')).toBe(true);
  const allowed = await eslint.lintText("import { API_VERSION } from '@engine/api'; import { Type } from '@sinclair/typebox'; export default {API_VERSION, Type};", { filePath: 'packs/demo/plugins/probe.ts' });
  expect(allowed[0]?.errorCount).toBe(0);
});
