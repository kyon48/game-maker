import { expect, it, vi } from 'vitest';
import { Game } from '../engine/sim/Game';
import type { Action } from '../engine/sim/ports';
const input = (...keys: Action[]) => ({ held: new Set(keys), pressed: new Set(keys) });
function game() {
  return new Game({ id: 'test', version: '0.1.0', formatVersion: 1, plugins: [], labels: { continue: 'Continue', newGame: 'New' }, title: 'Test', tileSize: 16, screen: { width: 160, height: 160 }, maps: ['map'], start: { map: 'map', x: 1, y: 1, dir: 'right' }, player: 'hero', state: { flags: {}, vars: { n: 0 } } },
    { width: 8, height: 8, tilewidth: 16, tileheight: 16, layers: [], tilesets: [], tileLookup: new Map() }, { hero: { placeholder: '#fff', moveTicks: 4 } },
    [{ id: 'npc', x: 2, y: 1, pages: [{ trigger: 'action', through: true, commands: [{ cmd: 'set_var', var: 'n', value: 1 }] }] }]);
}
it('discards action during movement, including its completion tick', () => {
  const g = game(); g.tick(input('right'));
  for (let i = 0; i < 3; i++) g.tick(input('ok'));
  g.tick(input()); expect(g.state.getVar('n')).toBe(0);
  g.tick(input('ok')); g.tick(input()); expect(g.state.getVar('n')).toBe(1);
});
it('observes direction history exactly once per tick', () => {
  const g = game(), observe = vi.spyOn(g.player, 'observeInput');
  g.tick(input('right')); expect(observe).toHaveBeenCalledTimes(1);
});
it('test-only hidden choices preserve original indexes and nested stop skips trailing commands', () => {
  const g = new Game({ id: 'test', version: '0.1.0', formatVersion: 1, plugins: [], labels: { continue: 'Continue', newGame: 'New' }, title: 'Test', tileSize: 16, screen: { width: 160, height: 160 }, maps: ['map'], start: { map: 'map', x: 1, y: 1, dir: 'right' }, player: 'hero', state: { flags: {}, vars: { n: 0 } } },
    { width: 8, height: 8, tilewidth: 16, tileheight: 16, layers: [], tilesets: [], tileLookup: new Map() }, { hero: { placeholder: '#fff' } },
    [{ id: 'npc', x: 2, y: 1, pages: [{ trigger: 'action', commands: [
      { cmd: 'choice', options: [
        { label: 'hidden', when: { any: [] }, commands: [{ cmd: 'set_var', var: 'n', value: 999 }] },
        { label: 'visible', commands: [{ cmd: 'set_var', var: 'n', value: 10 }, { cmd: 'wait', frames: 1 }, { cmd: 'if', cond: { var: 'n', op: '==', value: 10 }, then: [{ cmd: 'stop' }] }] },
      ] }, { cmd: 'set_var', var: 'n', value: 999 },
    ] }] }]);
  g.tick(input('ok')); g.tick(input()); expect(g.choice.snapshot?.selected).toBe(1);
  g.tick(input('ok')); expect(g.state.getVar('n')).toBe(10); g.tick(input());
  expect(g.main.running).toBe(false); expect(g.state.getVar('n')).toBe(10);
});
