import { expect, it } from 'vitest';
import { Player } from '../engine/sim/entity/Player';
import { MapState } from '../engine/sim/world/MapState';
import { Keyboard } from '../engine/platform/keyboard';
import type { Action, InputFrame } from '../engine/sim/ports';
const frame = (held: Action[], pressed: Action[] = []): InputFrame => ({ held: new Set(held), pressed: new Set(pressed) });
function world() {
  const player = new Player('p', 2, 2, 'down', 16, { placeholder: '#fff', moveTicks: 1 });
  const map = new MapState('map', { width: 5, height: 5, tilewidth: 16, tileheight: 16, tilesets: [], tileLookup: new Map(), layers: [] }, [player]);
  return { player, map };
}
it('uses press history then falls back to the most recent still-held direction', () => {
  const { player, map } = world();
  player.handleInput(frame(['up'], ['up']), map); map.advance();
  player.handleInput(frame(['up', 'right'], ['right']), map); map.advance(); expect(player.dir).toBe('right');
  player.handleInput(frame(['up', 'right', 'down'], ['down']), map); map.advance(); expect(player.dir).toBe('down');
  player.handleInput(frame(['up', 'right']), map); map.advance(); expect(player.dir).toBe('right');
  player.handleInput(frame(['up']), map); expect(player.dir).toBe('up');
});
it('records new presses during movement for the next tile', () => {
  const { map } = world();
  const player = new Player('p', 2, 2, 'down', 16, { placeholder: '#fff', moveTicks: 2 });
  player.handleInput(frame(['up'], ['up']), map); player.advance();
  player.handleInput(frame(['up', 'right'], ['right']), map); player.advance();
  player.handleInput(frame(['up', 'right']), map); expect(player.dir).toBe('right');
});
it('keyboard buffers a re-press as the latest action even within one tick', () => {
  const target = new EventTarget(), keyboard = new Keyboard(target);
  const key = (type: string, code: string) => { const event = new Event(type); Object.assign(event, { code, repeat: false }); target.dispatchEvent(event); };
  key('keydown', 'ArrowUp'); key('keydown', 'ArrowRight'); key('keyup', 'ArrowUp'); key('keydown', 'ArrowUp');
  expect([...keyboard.consume().pressed]).toEqual(['right', 'up']); keyboard.dispose();
});
