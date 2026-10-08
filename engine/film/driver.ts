import type { Action, InputFrame, Dir } from '../api';
import type { Film, FilmStep, FilmExpect } from '../data/schema/film';
import type { FilmView } from './view';
import { directions, pathTo } from './path';
export interface ChapterMark { tick: number; title: string }
const empty = (): InputFrame => ({ held: new Set(), pressed: new Set() });
const input = (action: Action, pressed = true): InputFrame => ({ held: new Set([action]), pressed: new Set(pressed ? [action] : []) });
/** Deterministic input state machine. No IO, DOM, clocks, random numbers or sim mutations. */
export class FilmDriver {
  ticks = 0; done = false; stepIndex = 0;
  readonly chapters: ChapterMark[] = [];
  private view!: FilmView;
  private evaluate!: (e: FilmExpect) => boolean;
  private readonly program: Generator<InputFrame, void, void>;
  constructor(readonly film: Film) { this.program = this.run(); }
  next(view: FilmView, evaluate: (e: FilmExpect) => boolean): InputFrame | null {
    if (this.done) return null;
    this.view = view; this.evaluate = evaluate;
    try {
      const result = this.program.next();
      if (result.done) { this.done = true; return null; }
      if (++this.ticks > 60 * 60 * 60 * 2) throw new Error('Film exceeds two hours');
      return result.value;
    } catch (error) {
      throw new Error(`${this.film.name}, step ${this.stepIndex}, tick ${this.ticks}, map ${view.mapId} (${view.player.x},${view.player.y}): ${String(error)}`);
    }
  }
  private *wait(ticks: number): Generator<InputFrame> { for (let i = 0; i < ticks; i++) yield empty(); }
  private *press(action: Action): Generator<InputFrame> { yield input(action); yield empty(); }
  private *walk(direction: Dir): Generator<InputFrame> {
    const initial = { ...this.view.player }; let count = 0;
    do {
      if (++count > 120) throw new Error('walk exceeded 120 ticks');
      yield input(direction, count === 1);
    } while (this.view.player.x === initial.x && this.view.player.y === initial.y);
  }
  private *walkTo(step: Extract<FilmStep, { walkTo: unknown }>): Generator<InputFrame> {
    const originalMap = this.view.mapId; let elapsed = 0;
    while (true) {
      if (++elapsed > 6000) throw new Error('walkTo timed out');
      const view = this.view;
      if (view.mapId !== originalMap) throw new Error('Map changed before walkTo completed');
      if (view.player.moving || view.busy) { if (view.message || view.choice) throw new Error('walkTo blocked by UI'); yield empty(); continue; }
      let route: Dir[] | null;
      if ('event' in step.walkTo) {
        const name = step.walkTo.event;
        const event = view.events.find(event => event.id === name && event.active);
        if (!event) throw new Error(`Missing/inactive walkTo event: ${step.walkTo.event}`);
        const goals = directions.map(([dir, dx, dy]) => ({ x: event.x - dx, y: event.y - dy, facing: dir }));
        // Blocking events allow turning toward them without movement. Through events need a correctly oriented approach.
        const adjacent = goals.find(p => p.x === view.player.x && p.y === view.player.y);
        if (adjacent && !event.through) {
          if (view.player.dir !== adjacent.facing) { yield* this.press(adjacent.facing!); continue; }
          return;
        }
        route = pathTo(view, goals);
      } else route = pathTo(view, [step.walkTo]);
      if (!route) throw new Error('No path for walkTo');
      if (!route.length) return;
      // Recompute after EACH completed tile; moving NPC occupancy/reservations can change.
      const start = { ...view.player }; let count = 0;
      do { if (++count > 120) break; yield input(route[0]!, count === 1); elapsed++; if (!this.view.player.moving && this.view.player.x === start.x && this.view.player.y === start.y) break; }
      while (this.view.player.x === start.x && this.view.player.y === start.y);
      if (count > 120) throw new Error('walkTo tile movement timed out');
    }
  }
  private *advance(mode: true | 'press' | 'auto'): Generator<InputFrame> {
    let elapsed = 0;
    while (this.view.message && !this.view.choice) {
      if (++elapsed > 108000) throw new Error('advanceText timed out');
      if (mode !== 'auto') { yield* this.press('ok'); continue; }
      if (!this.view.message.fullyShown) { yield empty(); continue; }
      const count = [...this.view.message.lines.join('')].length;
      // V2 will replace this reading-duration policy with voice duration, without changing sim.
      const seconds = (this.film.readingSpeed?.base ?? 0.6) + count * (this.film.readingSpeed?.perCharacter ?? 0.07);
      yield* this.wait(Math.ceil(seconds * 60));
      yield* this.press('ok');
    }
  }
  private *run(): Generator<InputFrame> {
    for (const [index, step] of this.film.steps.entries()) {
      this.stepIndex = index;
      if ('chapter' in step) this.chapters.push({ tick: this.ticks, title: step.chapter });
      else if ('expect' in step) { if (!this.evaluate(step.expect)) throw new Error('Film expectation failed'); }
      else if ('pause' in step) yield* this.wait(Math.ceil(step.pause * 60));
      else if ('wait' in step) yield* this.wait(step.wait);
      else if ('press' in step) yield* this.press(step.press);
      else if ('hold' in step) for (let i = 0; i < step.frames; i++) yield input(step.hold, i === 0);
      else if ('walk' in step) for (const dir of step.walk) yield* this.walk(dir);
      else if ('walkTo' in step) yield* this.walkTo(step);
      else if ('advanceText' in step) yield* this.advance(step.advanceText);
      else if ('choose' in step) {
        if (!this.view.choice?.options.some(option => option.index === step.choose)) throw new Error('Choice closed or index hidden');
        const dwell = Math.ceil(('dwell' in step ? step.dwell ?? 0 : 0) * 60);
        yield* this.wait(dwell);
        let count = 0;
        while (this.view.choice?.selected !== step.choose) {
          if (++count > 6) throw new Error('Choice navigation failed');
          yield* this.press('down'); yield* this.wait(dwell);
        }
        yield* this.press('ok');
      } else {
        // At least one empty tick activates a pending touch/action slot before checking idle.
        yield empty(); let count = 0;
        while (this.view.busy || this.view.message || this.view.choice || this.view.player.moving) {
          if (++count > 600) throw new Error('settle exceeded 600 ticks'); yield empty();
        }
      }
    }
  }
}
