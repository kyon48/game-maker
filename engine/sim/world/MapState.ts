import type { TileMapData } from '../../data/loader/tiled';
import type { Character, Dir } from '../entity/Character';
import { Collision } from './Collision';
export class MapState {
  readonly collision: Collision;
  readonly characters: readonly Character[];
  constructor(readonly id: string, readonly data: TileMapData, characters: readonly Character[]) {
    this.collision = new Collision(data);
    this.characters = [...characters];
    for (const character of characters) {
      if (!this.collision.inBounds(character.x, character.y)) throw new Error(`Invalid character spawn: ${character.id}`);
    }
  }
  canEnter(character: Character, x: number, y: number): boolean {
    if (!this.collision.passable(x, y)) return false;
    if (character.through) return true;
    for (const other of this.characters) {
      if (other === character || !other.active || other.through) continue;
      if (other.x === x && other.y === y) return false;
      if (other.destination?.x === x && other.destination.y === y) return false;
    }
    return true;
  }
  tryMove(character: Character, dir: Dir): boolean {
    if (character.moving || !character.active) return false;
    character.dir = dir;
    const target = character.target(dir);
    if (!this.canEnter(character, target.x, target.y)) return false;
    character.beginMove(target.x, target.y);
    return true;
  }
  advance(): void { for (const character of this.characters) character.advance(); }
}
