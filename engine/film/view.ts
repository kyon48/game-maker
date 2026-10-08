import type { Game } from '../sim/Game';
import type { MessageSnapshot } from '../sim/ui/MessageState';
import type { ChoiceSnapshot } from '../sim/ui/ChoiceState';
import type { Dir } from '../api';
import type { FilmExpect } from '../data/schema/film';
import type { Condition } from '../data/events';
export interface FilmView {
  mapId: string; width: number; height: number; blocked: Readonly<Uint8Array>;
  player: { x: number; y: number; dir: Dir; moving: boolean };
  events: readonly { id: string; x: number; y: number; active: boolean; through: boolean; destination?: { x: number; y: number } }[];
  choiceResult?: number | null; busy: boolean; message: MessageSnapshot | null; choice: ChoiceSnapshot | null;
}
const grids = new WeakMap<object, Uint8Array>();
/** Copies existing public read-only state; never drives or modifies sim here. */
export function observeGame(game: Game): FilmView {
  const data = game.map.data;
  let blocked = grids.get(data);
  if (!blocked) {
    blocked = new Uint8Array(data.width * data.height);
    for (let y = 0; y < data.height; y++) for (let x = 0; x < data.width; x++) blocked[y * data.width + x] = game.map.collision.passable(x, y) ? 0 : 1;
    grids.set(data, blocked);
  }
  const snapshot = game.snapshot;
  return { mapId: snapshot.mapId, width: data.width, height: data.height, blocked,
    player: { x: game.player.x, y: game.player.y, dir: game.player.dir, moving: game.player.moving },
    events: game.events.map(event => ({ id: event.id, x: event.x, y: event.y, active: event.active, through: event.through, destination: event.destination && { x: event.destination.x, y: event.destination.y } })),
    choiceResult: game.choice.result, busy: game.main.running, message: snapshot.message, choice: snapshot.choice };
}
export function checkExpect(game: Game, e: FilmExpect): boolean {
  if ('textContains' in e) return !!game.snapshot.message?.text.includes(e.textContains);
  if ('map' in e && !('self' in e)) return game.map.id === e.map && (e.x === undefined || game.player.x === e.x) && (e.y === undefined || game.player.y === e.y) && (e.dir === undefined || game.player.dir === e.dir);
  return game.evaluate(e as Condition, 'self' in e && 'map' in e ? { mapId: e.map, id: e.event } : null);
}
