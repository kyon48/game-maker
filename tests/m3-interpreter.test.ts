import { describe, expect, it } from 'vitest';
import { Type } from '@sinclair/typebox';
import { CommandRegistry } from '../engine/sim/event/CommandRegistry';
import { Interpreter, InterpreterLoopError } from '../engine/sim/event/Interpreter';
import { registerBuiltins } from '../engine/sim/commands';
import { GameState } from '../engine/sim/state/GameState';
import { evaluate } from '../engine/sim/event/conditions';
import type { CommandHost } from '../engine/sim/event/types';

function fixture() {
  const registry = new CommandRegistry(); registerBuiltins(registry);
  const state = new GameState({ flags: { met: false }, vars: { gold: 0 } });
  const host: CommandHost = {
    save: () => {}, transfer: function* () {}, move: () => ({ done: true }), fade: () => ({ done: true }), shake: () => ({ done: true }), showCharacter: () => {}, common: () => [],
    state, thisEvent: { mapId: 'map', id: 'event' }, player: { mapId: 'map', x: 0, y: 0, dir: 'down' },
    waitFrames: n => ({ kind: 'frames', n }), waitUntil: test => ({ kind: 'until', test }),
    evaluate: condition => evaluate(condition, state, { mapId: 'map', id: 'event' }), face: () => {},
    showText: function* () { yield { kind: 'frames', n: 1 }; },
    showChoice: function* () { yield { kind: 'frames', n: 1 }; return 0; },
  };
  return { registry, state, host, interpreter: new Interpreter(registry) };
}
describe('M3 generator interpreter', () => {
  it('runs synchronous commands immediately and resumes after exactly n updates', () => {
    const { state, interpreter, host } = fixture();
    interpreter.start([{ cmd: 'set_flag', flag: 'met', value: true }, { cmd: 'wait', frames: 2 }, { cmd: 'set_var', var: 'gold', value: 5 }], host);
    interpreter.update(); expect(state.getFlag('met')).toBe(true); expect(state.getVar('gold')).toBe(0);
    interpreter.update(); expect(state.getVar('gold')).toBe(0);
    interpreter.update(); expect(state.getVar('gold')).toBe(5); expect(interpreter.running).toBe(false);
  });
  it('supports waitUntil without advancing later commands while false', () => {
    const { registry, interpreter, host, state } = fixture(); let ready = false;
    registry.register('x_until', { args: Type.Object({}), *run(_args, ctx) { yield ctx.waitUntil(() => ready); } });
    interpreter.start([{ cmd: 'x_until' }, { cmd: 'set_var', var: 'gold', value: 9 }], host);
    interpreter.update(); interpreter.update(); expect(state.getVar('gold')).toBe(0);
    ready = true; interpreter.update(); expect(state.getVar('gold')).toBe(9);
  });
  it('nested if observes immediate state changes and stop ends all enclosing lists', () => {
    const { interpreter, host, state } = fixture();
    interpreter.start([
      { cmd: 'set_flag', flag: 'met', value: true },
      { cmd: 'if', cond: { flag: 'met', is: true }, then: [
        { cmd: 'set_var', var: 'gold', value: 10 }, { cmd: 'if', cond: { all: [] }, then: [{ cmd: 'stop' }, { cmd: 'set_var', var: 'gold', value: 99 }] },
        { cmd: 'set_var', var: 'gold', value: 88 },
      ] }, { cmd: 'set_var', var: 'gold', value: 77 },
    ], host);
    interpreter.update(); expect(state.getVar('gold')).toBe(10); expect(interpreter.running).toBe(false);
  });
  it('abort propagates return through yield* and runs finally without running trailing commands', () => {
    const { registry, interpreter, host, state } = fixture(); let cleaned = 0;
    registry.register('x_cleanup', { args: Type.Object({}), *run(_args, ctx) {
      try { yield ctx.waitFrames(20); state.setVar('gold', 99); } finally { cleaned++; }
    } });
    interpreter.start([{ cmd: 'if', cond: { all: [] }, then: [{ cmd: 'x_cleanup' }] }, { cmd: 'set_var', var: 'gold', value: 8 }], host);
    interpreter.update(); interpreter.abort(); interpreter.abort(); interpreter.update();
    expect(cleaned).toBe(1); expect(state.getVar('gold')).toBe(0); expect(interpreter.running).toBe(false);
    interpreter.start([{ cmd: 'set_var', var: 'gold', value: 4 }], host); interpreter.update(); expect(state.getVar('gold')).toBe(4);
  });
  it('rejects more than 10000 commands per update, including nested lists, then resets across waits', () => {
    const { interpreter, host, state } = fixture();
    const commands = Array.from({ length: 10000 }, () => ({ cmd: 'set_var', var: 'gold', op: 'add', value: 1 }));
    interpreter.start([{ cmd: 'if', cond: { all: [] }, then: commands }], host);
    expect(() => interpreter.update()).toThrow(InterpreterLoopError); expect(interpreter.running).toBe(false);
    const slice = commands.slice(0, 5000);
    interpreter.start([...slice, { cmd: 'wait', frames: 1 }, ...slice], host);
    interpreter.update(); const value = state.getVar('gold'); interpreter.update(); expect(state.getVar('gold')).toBe(value + 5000);
  });
  it('rejects unknown commands, extra fields, invalid waits and duplicate registration', () => {
    const { registry, interpreter, host } = fixture();
    expect(() => registry.register('wait', { args: Type.Object({}), run() {} })).toThrow('Duplicate');
    for (const command of [{ cmd: 'missing' }, { cmd: 'wait', frames: 0 }, { cmd: 'wait', frames: 1, extra: true }]) {
      interpreter.start([command], host); expect(() => interpreter.update()).toThrow(); expect(interpreter.running).toBe(false);
    }
  });
  it('set_var enforces safe operands and results; self commands require event context', () => {
    const { interpreter, host, state } = fixture();
    state.setVar('gold', Number.MAX_SAFE_INTEGER);
    interpreter.start([{ cmd: 'set_var', var: 'gold', op: 'add', value: 1 }], host); expect(() => interpreter.update()).toThrow('Unsafe');
    interpreter.start([{ cmd: 'set_self_flag', name: 'opened', value: true }], { ...host, thisEvent: null });
    expect(() => interpreter.update()).toThrow('requires an event');
    interpreter.start([{ cmd: 'set_var', var: 'gold', op: 'sub', value: 10 }], host); interpreter.update();
    expect(state.getVar('gold')).toBe(Number.MAX_SAFE_INTEGER - 10);
  });
});
