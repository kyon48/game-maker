import type { FilmCueGate } from './cues';
import type { Game } from '../sim/Game';
import type { GameSession } from '../sim/state/GameSession';
import type { Film } from '../data/schema/film';
import type { FilmAudioOptions } from './audio';
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
  get game(): Game { return this.saveSession?.game ?? this.initial; }
  constructor(private readonly initial: Game, film: Film, private readonly saveSession?: GameSession, audio?: FilmAudioOptions, cues?: FilmCueGate) {
    this.driver = new FilmDriver(film, audio, cues);
    this.pending = this.observer.observe(observeGame(this.game), 0);
  }
  async tick(): Promise<boolean> {
    const frame = this.driver.next(observeGame(this.game), e => checkExpect(this.game, e), this.saveSession ? { reload: () => { this.saveSession!.reload(); return observeGame(this.game); }, expectSave: e => this.saveSession!.expectSave(e) } : undefined);
    this.pending.push(...this.driver.audio.events());
    for (const mark of this.driver.chapters.slice(this.chapterIndex)) this.pending.push({ type: 'chapter', ...mark });
    this.chapterIndex = this.driver.chapters.length;
    if (!frame) {
      if (!this.closed) { this.pending.push(...this.observer.observe(observeGame(this.game), this.driver.ticks), ...this.observer.finish(this.driver.ticks)); this.closed = true; }
      return false;
    }
    this.game.tick(frame);
    await Promise.resolve();
    this.pending.push(...this.observer.observe(observeGame(this.game), this.driver.ticks, frame));
    return true;
  }
  events(): TimelineEvent[] { return this.pending.splice(0); }
}
