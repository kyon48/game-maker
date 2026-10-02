import type { GameConfig, EventDefinition } from '../data/game';
import type { Characters } from '../data/characters';
import type { TileMapData } from '../data/loader/tiled';
import type { InputFrame } from './ports';
import type { CharacterSnapshot } from './entity/Character';
import { GameState } from './state/GameState';
import { Player } from './entity/Player';
import { EventObject } from './entity/EventObject';
import { MapState } from './world/MapState';
export interface GameSnapshot {
  readonly player: CharacterSnapshot;
  readonly characters: readonly CharacterSnapshot[];
}
export class Game {
  readonly state: GameState;
  readonly player: Player;
  readonly map: MapState;
  private current: GameSnapshot;
  constructor(config: GameConfig, map: TileMapData, characters: Characters, events: readonly EventDefinition[]) {
    this.state = new GameState(config.state);
    const graphic = characters[config.player];
    if (!graphic) throw new Error(`Unknown player character: ${config.player}`);
    this.player = new Player('player', config.start.x, config.start.y, config.start.dir, config.tileSize, graphic);
    const ids = new Set<string>();
    const objects = events.map(event => {
      if (ids.has(event.id)) throw new Error(`Duplicate event: ${event.id}`);
      ids.add(event.id);
      return new EventObject(event, config.tileSize, characters);
    });
    this.map = new MapState(config.start.map, map, [this.player, ...objects]);
    if (!this.map.collision.passable(this.player.x, this.player.y)) throw new Error('Player starts on collision');
    this.current = this.capture();
  }
  tick(input: InputFrame): void {
    // §7.1: M2에는 플레이어 입력(4)과 이동 진행(6)만 존재.
    this.player.handleInput(input, this.map);
    this.map.advance();
    this.current = this.capture();
  }
  get snapshot(): GameSnapshot { return this.current; }
  private capture(): GameSnapshot {
    const characters = this.map.characters.map(character => character.snapshot());
    const player = characters[0]!;
    // 안정 정렬: 같은 y에서는 입력 배열의 플레이어 → 이벤트 순서 유지.
    characters.sort((a, b) => a.pixelY - b.pixelY);
    return { player, characters };
  }
}
