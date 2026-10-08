import { Game } from '../Game';
import type { GameOptions } from '../Game';
import { GameState } from './GameState';
import { loadSave } from './loadSave';
import { SAVE_VERSION } from './saveMigrations';
import { evaluate } from '../event/conditions';
import { Collision } from '../world/Collision';
import type { ValidatedPack } from '../../data/validator/types';
import type { SaveData, Condition, InputFrame } from '@engine/api';
import type { SaveExpect } from '../../data/schema/scenario';
/** In-memory save/reload controller shared by scenario rehearsal and recording. No IO or clocks. */
export class GameSession {
  game: Game;
  private saved: SaveData | null = null;
  constructor(private readonly pack: ValidatedPack, private readonly options: GameOptions = {}, start = pack.game.start, state = pack.game.state) {
    this.game = this.create(start, state);
  }
  private create(start: ValidatedPack['game']['start'], state: ValidatedPack['game']['state'], selfFlags?: Record<string, boolean>): Game {
    const data = this.pack.maps.get(start.map), events = this.pack.events.get(start.map);
    if (!data || !events || !new Collision(data).passable(start.x, start.y)) throw new Error('Invalid session start');
    return new Game({ ...this.pack.game, start, state }, data, this.pack.characters, events, {
      skin: this.pack.skin, commonEvents: this.pack.common, ...this.options, selfFlags,
      mapLoader: this.options.mapLoader ?? { load: id => { const data = this.pack.maps.get(id), events = this.pack.events.get(id); return data && events ? Promise.resolve({ data, events }) : Promise.reject(new Error(`Unknown map: ${id}`)); } },
      save: value => {
        this.saved = { ...value, flags: { ...value.flags }, vars: { ...value.vars }, selfFlags: { ...value.selfFlags }, saveVersion: SAVE_VERSION, packId: this.pack.game.id, gameVersion: this.pack.game.version, engineVersion: this.options.plugins?.engineVersion ?? '', savedAt: '1970-01-01T00:00:00.000Z' };
        this.options.save?.(value);
      },
    });
  }
  get lastSave(): SaveData | null { return this.saved ? JSON.parse(JSON.stringify(this.saved)) as SaveData : null; }
  reload(): void {
    if (!this.saved) throw new Error('Cannot reload without a save');
    const raw = this.saved;
    const restored = loadSave(JSON.stringify(raw), this.pack.game, this.pack.events, this.pack.maps, {
      loadSave: this.options.plugins ? (state, from) => this.options.plugins!.loadSave(state, raw as unknown as Record<string, unknown>, from) : undefined,
    }).state;
    if (!restored) throw new Error('Saved data cannot be loaded');
    this.game.main.abort();
    this.game = this.create({ map: restored.map, x: restored.x, y: restored.y, dir: restored.dir }, { flags: restored.flags, vars: restored.vars }, restored.selfFlags);
  }
  expectSave(condition: SaveExpect): boolean {
    if (!this.saved) throw new Error('No saved data');
    const state = new GameState({ flags: { ...this.pack.game.state.flags, ...this.saved.flags }, vars: { ...this.pack.game.state.vars, ...this.saved.vars } });
    for (const [key, value] of Object.entries(this.saved.selfFlags)) { const [map, event, name] = key.split(':'); state.setSelf(map!, event!, name!, value); }
    return evaluate(condition as Condition, state, 'self' in condition && 'map' in condition ? { mapId: condition.map, id: condition.event } : null, this.options.plugins ? (name, args, state) => this.options.plugins!.evaluate(name, args, state) : undefined);
  }
  get player() { return this.game.player; }
  get map() { return this.game.map; }
  get main() { return this.game.main; }
  get message() { return this.game.message; }
  get choice() { return this.game.choice; }
  get snapshot() { return this.game.snapshot; }
  tick(input: InputFrame): void { this.game.tick(input); }
  evaluate(condition: Condition, scope: { mapId: string; id: string } | null): boolean { return this.game.evaluate(condition, scope); }
}
