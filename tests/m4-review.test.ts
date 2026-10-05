import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../engine/sim/Game';
import type { GameOptions } from '../engine/sim/Game';
import type { Command } from '../engine/data/events';
const empty = { held: new Set<never>(), pressed: new Set<never>() };
function create(list: Command[], options: GameOptions = {}) {
  return new Game({ id: 'test', version: '0.1.0', formatVersion: 1, plugins: [], labels: { continue: 'Continue', newGame: 'New' }, title: 'Test', tileSize: 16, screen: { width: 160, height: 160 }, maps: ['map'], start: { map: 'map', x: 1, y: 1, dir: 'right' }, player: 'hero', state: { flags: { visible: true }, vars: { n: 0 } } },
    { width: 8, height: 8, tilewidth: 16, tileheight: 16, layers: [], tilesets: [], tileLookup: new Map() }, { hero: { placeholder: '#fff', moveTicks: 2 } }, [
      { id: 'script', x: 5, y: 5, pages: [{ trigger: 'auto', when: { var: 'n', op: '==', value: 0 }, commands: list }] },
      { id: 'npc', x: 2, y: 1, pages: [{ trigger: 'none', when: { flag: 'visible', is: true }, character: 'hero' }] },
    ], options);
}
it('finishes a route wait if its event becomes inactive, without replaying on reactivation', () => {
  const g = create([{ cmd: 'move', target: 'npc', route: ['down', 'down', 'wait:30'], wait: true }, { cmd: 'set_var', var: 'n', value: 1 }]);
  g.tick(empty); g.state.setFlag('visible', false);
  for (let i = 0; i < 5; i++) g.tick(empty);
  expect(g.state.getVar('n')).toBe(1); expect(g.events[1]?.routed).toBe(false);
  const y = g.events[1]!.y; g.state.setFlag('visible', true); g.tick(empty); expect(g.events[1]?.y).toBe(y);
});
it('rejects an unknown transfer map before fade, leave hook or loading', () => {
  const leave = vi.fn(), load = vi.fn();
  const g = create([{ cmd: 'transfer', map: 'missing', x: 1, y: 1 }], { hooks: { mapLeave: leave }, mapLoader: { load } });
  expect(() => g.tick(empty)).toThrow('Unknown map');
  expect(g.effects.alpha).toBe(0); g.effects.advance(); expect(g.effects.alpha).toBe(0);
  expect(leave).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled();
});
it('decisions references V7 for parallel restrictions and V8 for call cycles', () => {
  const line = readFileSync('docs/decisions.md', 'utf8').split('\n').find(line => line.includes('parallel 금지 커맨드'))!;
  expect(line).toContain('V7·V8');
});
