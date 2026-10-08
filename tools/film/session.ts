import type { Game } from '../../engine/sim/Game';
import type { Film } from '../../engine/data/schema/film';
import { FilmDriver } from './driver';
import { observeGame, checkExpect } from './view';
import { TimelineObserver } from './timeline';
import type { TimelineEvent } from './timeline';
export class FilmSession {
  readonly driver: FilmDriver;
  private readonly observer = new TimelineObserver();
  private readonly pending: TimelineEvent[];
  private chapterIndex = 0;
  private closed = false;
  constructor(readonly game: Game, film: Film) {
    this.driver = new FilmDriver(film);
    this.pending = this.observer.observe(observeGame(game), 0);
  }
  async tick(): Promise<boolean> {
    const frame = this.driver.next(observeGame(this.game), e => checkExpect(this.game, e));
    for (const mark of this.driver.chapters.slice(this.chapterIndex)) this.pending.push({ type: 'chapter', ...mark });
    this.chapterIndex = this.driver.chapters.length;
    if (!frame) {
      if (!this.closed) { this.pending.push(...this.observer.finish(this.driver.ticks)); this.closed = true; }
      return false;
    }
    this.game.tick(frame);
    await Promise.resolve();
    this.pending.push(...this.observer.observe(observeGame(this.game), this.driver.ticks, frame));
    return true;
  }
  events(): TimelineEvent[] { return this.pending.splice(0); }
}
