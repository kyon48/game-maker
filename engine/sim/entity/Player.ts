import { Character, directions } from './Character';
import type { InputFrame } from '../ports';
import type { MapState } from '../world/MapState';
export class Player extends Character {
  handleInput(input: InputFrame, map: MapState): void {
    if (this.moving) return;
    const direction = directions.find(dir => input.held.has(dir));
    if (direction) { if (!map.tryMove(this, direction)) this.stand(); }
    else this.stand();
  }
}
