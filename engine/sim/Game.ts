import type { GameConfig, EventDefinition } from '../data/game';
import type { Characters } from '../data/characters';
import type { Skin } from '../data/skin';
import type { TileMapData } from '../data/loader/tiled';
import type { InputFrame, TextMeasurer } from './ports';
import type { CharacterSnapshot, Dir } from './entity/Character';
import type { CommandHost } from './event/types';
import type { MessageSnapshot } from './ui/MessageState';
import type { ChoiceSnapshot } from './ui/ChoiceState';
import { GameState } from './state/GameState';
import { Player } from './entity/Player';
import { EventObject } from './entity/EventObject';
import { MapState } from './world/MapState';
import { HeadlessTextMeasurer } from './HeadlessTextMeasurer';
import { evaluate } from './event/conditions';
import { Interpreter } from './event/Interpreter';
import { CommandRegistry } from './event/CommandRegistry';
import { TriggerSlot, actionTarget } from './event/triggers';
import { registerBuiltins } from './commands';
import { MessageState } from './ui/MessageState';
import { ChoiceState } from './ui/ChoiceState';
export interface GameSnapshot {
  readonly player: CharacterSnapshot;
  readonly characters: readonly CharacterSnapshot[];
  readonly message: MessageSnapshot | null;
  readonly choice: ChoiceSnapshot | null;
}
export interface GameOptions { skin?: Skin; textMeasurer?: TextMeasurer }
export class Game {
  readonly state: GameState;
  readonly player: Player;
  readonly map: MapState;
  readonly events: readonly EventObject[];
  readonly commands = new CommandRegistry();
  readonly main = new Interpreter(this.commands);
  readonly message: MessageState;
  readonly choice = new ChoiceState();
  private readonly triggers = new TriggerSlot();
  private current: GameSnapshot;
  constructor(config: GameConfig, map: TileMapData, characters: Characters,
    events: readonly EventDefinition[], options: GameOptions = {}) {
    this.state = new GameState(config.state);
    const graphic = characters[config.player];
    if (!graphic) throw new Error(`Unknown player character: ${config.player}`);
    this.player = new Player('player', config.start.x, config.start.y, config.start.dir, config.tileSize, graphic);
    const ids = new Set<string>();
    this.events = events.map(event => {
      if (ids.has(event.id)) throw new Error(`Duplicate event: ${event.id}`);
      ids.add(event.id);
      return new EventObject(event, config.tileSize, characters, this.state, config.start.map);
    });
    this.map = new MapState(config.start.map, map, [this.player, ...this.events]);
    if (!this.map.collision.passable(this.player.x, this.player.y)) throw new Error('Player starts on collision');
    this.message = new MessageState({ width: config.screen.width - 2 * (options.skin?.window.padding ?? 8),
      rows: options.skin?.message.rows ?? 3, charsPerTick: options.skin?.message.charsPerTick ?? 1 },
    options.textMeasurer ?? new HeadlessTextMeasurer(options.skin?.font.size ?? 12));
    registerBuiltins(this.commands);
    this.current = this.capture();
  }
  tick(input: InputFrame): void {
    // §7.1(1): 페이지 재계산은 직전 틱에서 변경된 상태에만 적용.
    if (this.state.dirty) { for (const event of this.events) event.refresh(this.state); this.state.clearDirty(); }
    // (2): 창이 닫힌 틱에도 UI가 소비한 pressed를 action에 재사용하지 않음.
    const consumed = this.message.opened || this.choice.opened;
    if (this.message.opened) this.message.update(input);
    else if (this.choice.opened) this.choice.update(input);
    const logicInput = consumed ? { held: input.held, pressed: new Set<never>() } : input;
    // (3): action은 이전 틱에 등록된 슬롯만 시작. auto/parallel은 M4 범위.
    if (this.main.running) this.main.update();
    else {
      const event = this.triggers.take();
      if (event?.active && event.page?.trigger === 'action') {
        this.main.start(event.page.commands ?? [], this.host(event));
        this.main.update();
      }
    }
    // (4): 이동을 막는 동안에도 새 방향 입력 이력은 유지.
    this.player.observeInput(input);
    if (!this.main.running && !this.message.opened && !this.choice.opened) {
      this.player.handleInput(logicInput, this.map);
      if (logicInput.pressed.has('ok')) {
        const event = actionTarget(this.player, this.events);
        if (event) this.triggers.enqueue(event);
      }
    }
    // (6): 이미 시작한 이동은 메인/UI 대기 중에도 한 칸을 마침.
    this.map.advance();
    this.current = this.capture();
  }
  get snapshot(): GameSnapshot { return this.current; }
  private host(event: EventObject): CommandHost {
    const { message, choice, map, player } = this;
    const scope = { mapId: this.map.id, id: event.id };
    return {
      state: this.state, thisEvent: scope,
      get player() { return { mapId: map.id, x: player.x, y: player.y, dir: player.dir }; },
      evaluate: condition => evaluate(condition, this.state, scope),
      waitFrames: n => {
        if (!Number.isSafeInteger(n) || n < 1) throw new Error('Invalid frame wait');
        return { kind: 'frames', n };
      },
      waitUntil: test => ({ kind: 'until', test }),
      showText: function* (request) {
        message.open(request);
        try { yield { kind: 'until', test: () => !message.opened }; }
        finally { message.close(); }
      },
      showChoice: function* (request) {
        choice.open(request);
        try {
          if (choice.opened) yield { kind: 'until', test: () => !choice.opened };
          return choice.result ?? -1;
        } finally { choice.close(); }
      },
      face: (target, dir) => this.face(event, target, dir),
    };
  }
  private face(event: EventObject, target: string, dir: Dir | 'player'): void {
    const character = target === 'player' ? this.player : target === 'this' ? event : this.events.find(object => object.id === target);
    if (!character) throw new Error(`Unknown face target: ${target}`);
    if (dir !== 'player') { character.dir = dir; return; }
    const dx = this.player.x - character.x, dy = this.player.y - character.y;
    if (dx === 0 && dy === 0) return;
    character.dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  }
  private capture(): GameSnapshot {
    const characters = this.map.characters.map(character => character.snapshot());
    const player = characters[0]!;
    characters.sort((a, b) => a.pixelY - b.pixelY);
    return { player, characters, message: this.message.snapshot, choice: this.choice.snapshot };
  }
}
