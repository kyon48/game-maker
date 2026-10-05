import { describe, expect, it } from 'vitest';
import { Game } from '../engine/sim/Game';
import { evaluate } from '../engine/sim/event/conditions';
import { GameState } from '../engine/sim/state/GameState';
import { TriggerSlot, actionTarget } from '../engine/sim/event/triggers';
import type { EventDefinition, GameConfig } from '../engine/data/game';
import type { Command, Condition } from '../engine/data/events';
import type { Action } from '../engine/sim/ports';
const input = (...pressed: Action[]) => ({ held: new Set<Action>(), pressed: new Set(pressed) });
function create(events: EventDefinition[], override: Partial<GameConfig> = {}) {
  const config: GameConfig = { id: 'test', version: '0.1.0', formatVersion: 1, plugins: [], labels: { continue: 'Continue', newGame: 'New' }, title: 'Test', tileSize: 16, screen: { width: 320, height: 240 }, maps: ['map'], start: { map: 'map', x: 1, y: 1, dir: 'right' }, player: 'hero', state: { flags: { met: false }, vars: { gold: 0 } }, ...override };
  return new Game(config, { width: 8, height: 8, tilewidth: 16, tileheight: 16, layers: [], tilesets: [], tileLookup: new Map() }, { hero: { placeholder: '#fff' }, a: { placeholder: '#123456' }, b: { placeholder: '#654321' } }, events);
}
const event = (id: string, x: number, y: number, commands: Command[] = [], through = false): EventDefinition => ({ id, x, y, pages: [{ trigger: 'action', character: 'a', commands, through }] });
describe('M3 conditions', () => {
  it.each([['==', true], ['!=', false], ['>', false], ['>=', true], ['<', false], ['<=', true]] as const)('evaluates %s', (op, expected) => {
    const state = new GameState({ flags: {}, vars: { n: 5 } }); expect(evaluate({ var: 'n', op, value: 5 }, state, null)).toBe(expected);
  });
  it('evaluates boolean composition, empty collections, scoped self flags and errors', () => {
    const state = new GameState({ flags: { met: false }, vars: { n: 5 } });
    state.setSelf('map', 'event', 'opened', true);
    const condition: Condition = { all: [{ not: { flag: 'met', is: true } }, { any: [{ var: 'n', op: '>', value: 4 }, { self: 'opened', is: false }] }] };
    expect(evaluate(condition, state, { mapId: 'map', id: 'event' })).toBe(true);
    expect(evaluate({ all: [] }, state, null)).toBe(true); expect(evaluate({ any: [] }, state, null)).toBe(false);
    expect(evaluate({ self: 'opened', is: true }, state, { mapId: 'map', id: 'event' })).toBe(true);
    expect(() => evaluate({ self: 'opened', is: true }, state, null)).toThrow('requires an event');
    expect(() => evaluate({ flag: 'unknown', is: true }, state, null)).toThrow('Undeclared');
    expect(() => evaluate({ plugin: 'x_missing', args: {} }, state, null)).toThrow('Unsupported');
  });
});
it('uses last true page, leaves unchanged page direction intact and makes unmatched events inactive/nonblocking', () => {
  const game = create([{ id: 'npc', x: 2, y: 1, pages: [
    { trigger: 'action', character: 'a', dir: 'left' },
    { trigger: 'none', character: 'b', dir: 'up', when: { flag: 'met', is: true } },
  ] }, { id: 'inactive', x: 3, y: 1, pages: [{ trigger: 'action', when: { flag: 'met', is: true } }] }]);
  expect(game.events[0]?.graphic?.placeholder).toBe('#123456'); expect(game.events[1]?.active).toBe(false);
  expect(game.map.canEnter(game.player, 3, 1)).toBe(true);
  game.events[0]!.dir = 'down'; game.state.setVar('gold', 1); game.tick(input()); expect(game.events[0]?.dir).toBe('down');
  game.state.setFlag('met', true); expect(game.events[0]?.dir).toBe('down'); game.tick(input());
  expect(game.events[0]?.dir).toBe('up'); expect(game.events[0]?.graphic?.placeholder).toBe('#654321'); expect(game.events[1]?.active).toBe(true);
});
it('action prioritizes front over same-cell through events and array order; slot keeps only the first', () => {
  const game = create([event('under', 1, 1, [], true), event('front_first', 2, 1), event('front_second', 2, 1)]);
  expect(actionTarget(game.player, game.events)?.id).toBe('front_first');
  game.events[1]!.active = false; game.events[2]!.active = false; expect(actionTarget(game.player, game.events)?.id).toBe('under');
  const slot = new TriggerSlot(); slot.enqueue(game.events[0]!); slot.enqueue(game.events[1]!);
  expect(slot.take()?.id).toBe('under'); expect(slot.take()).toBeUndefined();
});
it('defers action one tick and keeps the original command list after a page change', () => {
  const game = create([{ id: 'npc', x: 2, y: 1, pages: [
    { trigger: 'action', commands: [{ cmd: 'set_flag', flag: 'met', value: true }, { cmd: 'wait', frames: 1 }, { cmd: 'set_var', var: 'gold', value: 1 }] },
    { trigger: 'action', when: { flag: 'met', is: true }, commands: [{ cmd: 'set_var', var: 'gold', value: 99 }] },
  ] }]);
  game.tick(input('ok')); expect(game.state.getFlag('met')).toBe(false);
  game.tick(input()); expect(game.state.getFlag('met')).toBe(true); expect(game.state.getVar('gold')).toBe(0);
  game.tick(input()); expect(game.state.getVar('gold')).toBe(1); expect(game.main.running).toBe(false);
});
it('consumes closing UI key presses, locks movement while open and cleans up on abort', () => {
  const game = create([event('npc', 2, 1, [{ cmd: 'text', text: 'abcdef' }])]);
  game.tick(input('ok')); game.tick(input()); expect(game.message.opened).toBe(true);
  game.tick({ held: new Set(['down'] as const), pressed: new Set(['down'] as const) }); expect(game.player.moving).toBe(false);
  game.tick(input('ok')); game.tick(input('ok')); expect(game.message.opened).toBe(false); expect(game.main.running).toBe(false);
  game.tick(input()); expect(game.message.opened).toBe(false);
  game.tick(input('ok')); game.tick(input()); game.main.abort(); expect(game.message.opened).toBe(false);
});
it('all-hidden choices run no commands and do not block the interpreter', () => {
  const game = create([event('npc', 2, 1, [{ cmd: 'choice', options: [{ label: 'hidden', when: { any: [] }, commands: [{ cmd: 'set_var', var: 'gold', value: 99 }] }] }, { cmd: 'set_var', var: 'gold', value: 5 }])]);
  game.tick(input('ok')); game.tick(input()); expect(game.choice.opened).toBe(false); expect(game.state.getVar('gold')).toBe(5);
});
it('face can address this, player and named events and choose player direction deterministically', () => {
  const game = create([event('npc', 2, 1, [{ cmd: 'face', target: 'this', dir: 'player' }, { cmd: 'face', target: 'other', dir: 'up' }, { cmd: 'face', target: 'player', dir: 'down' }]), event('other', 4, 3)]);
  game.tick(input('ok')); game.tick(input()); expect(game.events[0]?.dir).toBe('left'); expect(game.events[1]?.dir).toBe('up'); expect(game.player.dir).toBe('down');
});
