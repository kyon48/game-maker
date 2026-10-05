import { Character, directions } from './Character';
import type { Dir } from './Character';
import type { InputFrame } from '../ports';
import type { MapState } from '../world/MapState';
export class Player extends Character {
  private readonly recent: Dir[] = [];
  get inputDirection(): Dir | undefined { return this.recent.at(-1); }
  observeInput(input: InputFrame): void {
    for (let i = this.recent.length - 1; i >= 0; i--) if (!input.held.has(this.recent[i]!)) this.recent.splice(i, 1);
    for (const action of input.pressed) {
      if (!directions.includes(action as Dir) || !input.held.has(action)) continue;
      const dir = action as Dir, index = this.recent.indexOf(dir);
      if (index !== -1) this.recent.splice(index, 1);
      this.recent.push(dir);
    }
  }
  handleInput(input: InputFrame, map: MapState): void {
    this.observeInput(input); this.moveFromInput(map);
  }
  moveFromInput(map: MapState): void {
    if (this.moving) return;
    const direction = this.recent.at(-1);
    if (direction) { if (!map.tryMove(this, direction)) this.stand(); }
    else this.stand();
  }
}
