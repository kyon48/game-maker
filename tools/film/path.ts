import type { Dir } from '../../engine/api';
import type { FilmView } from './view';
export const directions: readonly [Dir, number, number][] = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
export interface Point { x: number; y: number; facing?: Dir }
export function pathTo(view: FilmView, goals: readonly Point[]): Dir[] | null {
  const { width, height, player } = view;
  const occupied = new Set<number>();
  for (const event of view.events) if (event.active && !event.through) {
    occupied.add(event.y * width + event.x);
    if (event.destination) occupied.add(event.destination.y * width + event.destination.x);
  }
  const valid = ({ x, y }: Point) => x >= 0 && y >= 0 && x < width && y < height && !view.blocked[y * width + x] && !occupied.has(y * width + x);
  const targets = goals.filter(valid);
  const goal = (cell: number, dir: Dir) => targets.some(p => p.y * width + p.x === cell && (p.facing === undefined || p.facing === dir));
  const encode = (cell: number, dir: Dir) => cell * 4 + directions.findIndex(d => d[0] === dir);
  const startCell = player.y * width + player.x, start = encode(startCell, player.dir);
  if (goal(startCell, player.dir)) return [];
  const parent = new Map<number, { previous: number; dir: Dir }>();
  const queue = [start], seen = new Set([start]);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!, cell = Math.floor(current / 4), x = cell % width, y = Math.floor(cell / width);
    for (const [dir, dx, dy] of directions) {
      const next = { x: x + dx, y: y + dy }, nextCell = next.y * width + next.x, key = encode(nextCell, dir);
      if (!valid(next) || seen.has(key)) continue;
      seen.add(key); parent.set(key, { previous: current, dir });
      if (goal(nextCell, dir)) {
        const result: Dir[] = []; let cursor = key;
        while (cursor !== start) { const edge = parent.get(cursor)!; result.push(edge.dir); cursor = edge.previous; }
        return result.reverse();
      }
      queue.push(key);
    }
  }
  return null;
}
