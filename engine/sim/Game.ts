import type { PluginRuntime } from './plugins/PluginRuntime';
import { stateAccess } from './plugins/context';
import type { HookContext } from '@engine/api';
import type { PersistentState } from './state/loadSave';
import type { GameConfig, EventDefinition } from '../data/game';
import type { Characters } from '../data/characters';
import type { Skin } from '../data/skin';
import { markers } from '../data/loader/tiled';
import type { TileMapData } from '../data/loader/tiled';
import type { MapLoader, LoadedMap } from './world/MapLoader';
import { Effects } from './world/Effects';
import type { Command } from '../data/events';
import type { CommandGen, TransferRequest } from './event/types';
import type { Character } from './entity/Character';
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
  readonly mapId: string;
  readonly fade: number;
  readonly shake: number;
  readonly player: CharacterSnapshot;
  readonly characters: readonly CharacterSnapshot[];
  readonly message: MessageSnapshot | null;
  readonly choice: ChoiceSnapshot | null;
}
export interface GameOptions {
  plugins?: PluginRuntime;
  save?: (state: PersistentState) => void; selfFlags?: Readonly<Record<string, boolean>>;
  skin?: Skin; textMeasurer?: TextMeasurer; mapLoader?: MapLoader;
  commonEvents?: Readonly<Record<string, { commands: readonly Command[] }>>;
  hooks?: { mapLeave?: (id: string) => void; mapEnter?: (id: string) => void; tick?: () => void };
}
export class Game {
  readonly state: GameState;
  readonly player: Player;
  map: MapState;
  events: readonly EventObject[];
  readonly effects = new Effects();
  private readonly parallels = new Map<EventObject, Interpreter>();
  private leaving = false;
  readonly commands: CommandRegistry;
  readonly main: Interpreter;
  readonly message: MessageState;
  readonly choice = new ChoiceState();
  private readonly triggers = new TriggerSlot();
  private current: GameSnapshot;
  constructor(private readonly config: GameConfig, map: TileMapData, private readonly characters: Characters,
    events: readonly EventDefinition[], private readonly options: GameOptions = {}) {
    this.commands = options.plugins?.commands ?? new CommandRegistry();
    if (!options.plugins) registerBuiltins(this.commands);
    this.main = new Interpreter(this.commands);
    this.state = new GameState(config.state);
    for (const [key, value] of Object.entries(options.selfFlags ?? {})) {
      const [map, event, name] = key.split(':'); this.state.setSelf(map!, event!, name!, value);
    }
    this.state.clearDirty();
    const graphic = characters[config.player];
    this.player = new Player('player', config.start.x, config.start.y, config.start.dir, config.tileSize, graphic);
    this.events = events.map(event => {
      return new EventObject(event, config.tileSize, characters, this.state, config.start.map, options.plugins ? this.pluginCondition : undefined);
    });
    this.map = new MapState(config.start.map, map, [this.player, ...this.events]);
    this.message = new MessageState({ width: config.screen.width - 2 * (options.skin?.window.padding ?? 8),
      rows: options.skin?.message.rows ?? 3, charsPerTick: options.skin?.message.charsPerTick ?? 1 },
    options.textMeasurer ?? new HeadlessTextMeasurer(options.skin?.font.size ?? 12));
    this.options.plugins?.mapEnter(this.hookContext());
    this.current = this.capture();
  }
  tick(input: InputFrame): void {
    // §7.1(1): 페이지 재계산은 직전 틱에서 변경된 상태에만 적용.
    if (this.state.dirty) {
      for (const event of this.events) {
        const previous = event.pageIndex; event.refresh(this.state);
        if (previous !== event.pageIndex) { this.parallels.get(event)?.abort(); this.parallels.delete(event); }
      }
      this.state.clearDirty();
    }
    // (2): 창이 닫힌 틱에도 UI가 소비한 pressed를 action에 재사용하지 않음.
    const consumed = this.message.opened || this.choice.opened;
    if (this.message.opened) this.message.update(input);
    else if (this.choice.opened) this.choice.update(input);
    const logicInput = consumed ? { held: input.held, pressed: new Set<never>() } : input;
    // (3): 이전 슬롯이 auto보다 우선.
    if (this.main.running) this.main.update();
    else {
      const pending = this.triggers.take();
      const event = pending?.active && ['action', 'touch'].includes(pending.page?.trigger ?? '') ? pending
        : this.events.find(object => object.active && object.page?.trigger === 'auto');
      if (event) {
        this.main.start(event.page?.commands ?? [], this.host(event));
        this.main.update();
      }
    }
    // (4): 이동을 막는 동안에도 새 방향 입력 이력은 유지.
    this.player.observeInput(input);
    if (!this.main.running && !this.message.opened && !this.choice.opened) {
      const direction = this.player.inputDirection;
      const idle = !this.player.moving && !this.player.routed;
      if (!this.player.routed) this.player.moveFromInput(this.map);
      if (idle && direction && !this.player.moving) {
        const target = this.player.target(direction);
        const event = this.events.find(object => object.active && !object.through && object.page?.trigger === 'touch' && object.x === target.x && object.y === target.y);
        if (event) this.triggers.enqueue(event);
      }
      if (!this.player.moving && logicInput.pressed.has('ok')) {
        const event = actionTarget(this.player, this.events);
        if (event) this.triggers.enqueue(event);
      }
    }
    // (5): 완료된 parallel은 다음 틱에 다시 시작.
    if (!this.leaving) for (const event of this.events) {
      if (!event.active || event.page?.trigger !== 'parallel') continue;
      let interpreter = this.parallels.get(event);
      if (!interpreter) { interpreter = new Interpreter(this.commands); this.parallels.set(event, interpreter); }
      if (!interpreter.running) interpreter.start(event.page?.commands ?? [], this.host(event, true));
      interpreter.update();
    }
    // (6): 메인/UI 대기 중에도 시작한 이동은 마침. 배치·정지는 touch 미발동.
    for (const character of this.map.characters) {
      const completed = character.advance();
      if (character === this.player && completed) {
        const event = this.events.find(object => object.active && object.through && object.page?.trigger === 'touch' && object.x === this.player.x && object.y === this.player.y);
        if (event) this.triggers.enqueue(event);
      }
      character.advanceRoute(this.map);
    }
    this.effects.advance(); // (7)
    this.options.plugins?.tick(this.hookContext());
    this.options.hooks?.tick?.(); // (8), registration is M7.
    this.current = this.capture();
  }
  get snapshot(): GameSnapshot { return this.current; }
  private readonly pluginCondition = (name: string, args: unknown, state: GameState): boolean => {
    if (!this.options.plugins) throw new Error(`Unknown plugin condition: ${name}`);
    return this.options.plugins.evaluate(name, args, state);
  };
  evaluate(condition: import('../data/events').Condition, scope: import('./event/conditions').EventScope | null): boolean {
    return evaluate(condition, this.state, scope, this.options.plugins ? this.pluginCondition : undefined);
  }
  private hookContext(): HookContext {
    return Object.freeze({ state: stateAccess(this.state), player: Object.freeze({ mapId: this.map.id, x: this.player.x, y: this.player.y, dir: this.player.dir }), mapId: this.map.id });
  }
  private host(event: EventObject, parallel = false): CommandHost {
    const { message, choice, player } = this;
    const mapId = () => this.map.id;
    const scope = { mapId: this.map.id, id: event.id };
    return {
      save: () => {
        if (!this.options.save) throw new Error('Save port unavailable');
        this.options.save({ map: this.map.id, x: this.player.x, y: this.player.y, dir: this.player.dir, ...this.state.snapshot() });
      },
      state: this.state, thisEvent: scope,
      get player() { return { mapId: mapId(), x: player.x, y: player.y, dir: player.dir }; },
      evaluate: condition => evaluate(condition, this.state, scope, this.pluginCondition),
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
      face: (target, dir) => this.face(event, target, dir), parallel,
      transfer: request => this.transfer(request),
      move: (target, route) => this.target(event, target)?.setRoute(route) ?? { done: true },
      fade: (to, frames) => this.effects.startFade(to, frames),
      shake: (power, frames) => this.effects.startShake(power, frames),
      showCharacter: (target, visible) => {
        if (target === 'player') throw new Error('show_character requires an event');
        const object = this.target(event, target); if (object) object.visible = visible;
      },
      common: id => {
        const common = this.options.commonEvents?.[id];
        if (!common) throw new Error(`Unknown common event: ${id}`);
        return common.commands;
      },
    };
  }
  private face(event: EventObject, target: string, dir: Dir | 'player'): void {
    const character = this.target(event, target);
    if (!character) return;
    if (dir !== 'player') { character.dir = dir; return; }
    const dx = this.player.x - character.x, dy = this.player.y - character.y;
    if (dx === 0 && dy === 0) return;
    character.dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  }
  private target(event: EventObject, target: string): Character | undefined {
    if (target === 'this') return this.events.includes(event) ? event : undefined;
    const character = target === 'player' ? this.player : this.events.find(object => object.id === target);
    if (!character) throw new Error(`Unknown character target: ${target}`);
    return character;
  }
  private *transfer(request: TransferRequest): CommandGen {
    if (!this.config.maps.includes(request.map) || !this.options.mapLoader) throw new Error(`Unknown map or missing loader: ${request.map}`);
    // §7.5(1)
    if (request.fade !== false) { const fade = this.effects.startFade('black', 15); yield { kind: 'until', test: () => fade.done }; }
    // (2)
    for (const interpreter of this.parallels.values()) interpreter.abort();
    this.parallels.clear(); this.leaving = true;
    this.options.plugins?.mapLeave(this.hookContext());
    this.options.hooks?.mapLeave?.(this.map.id);
    // (3): The platform resolves the port only after all new images are decoded.
    let loaded: LoadedMap | undefined;
    let failed = false, failure: unknown;
    void this.options.mapLoader.load(request.map).then(value => { loaded = value; }, error => { failed = true; failure = error; });
    yield { kind: 'until', test: () => loaded !== undefined || failed };
    if (failed) throw failure;
    const next = loaded!;
    const position = request.marker === undefined ? { x: request.x!, y: request.y! } : markers(next.data).get(request.marker);
    if (!position) throw new Error(`Unknown transfer marker: ${request.marker}`);
    // (4)
    this.player.place(position.x, position.y, request.dir);
    this.events = next.events.map(definition => {
      return new EventObject(definition, this.config.tileSize, this.characters, this.state, request.map, this.options.plugins ? this.pluginCondition : undefined);
    });
    this.map = new MapState(request.map, next.data, [this.player, ...this.events]);
    if (!this.map.collision.passable(position.x, position.y)) throw new Error('Transfer arrives on collision');
    this.triggers.take(); this.leaving = false;
    this.options.plugins?.mapEnter(this.hookContext());
    this.options.hooks?.mapEnter?.(this.map.id);
    // (5); the generator resumes its original caller and command list in (6).
    if (request.fade !== false) { const fade = this.effects.startFade('clear', 15); yield { kind: 'until', test: () => fade.done }; }
  }
  private capture(): GameSnapshot {
    const characters = this.map.characters.map(character => character.snapshot());
    const player = characters[0]!;
    characters.sort((a, b) => a.pixelY - b.pixelY);
    return { mapId: this.map.id, fade: this.effects.alpha, shake: this.effects.offset, player, characters, message: this.message.snapshot, choice: this.choice.snapshot };
  }
}
