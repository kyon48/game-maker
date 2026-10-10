import type { GameSession } from '../sim/state/GameSession';
import type { Game } from '../sim/Game';
import type { Film } from '../data/schema/film';
import type { FilmAudioOptions } from '../film/audio';
import { FilmSession } from '../film/session';
import { frameOf } from '../film/timeline';
import type { FramedEvent } from '../film/timeline';
export interface RecordedFrame { rgba: string | null; events: FramedEvent[]; frame: number; done: boolean }
export interface Recorder {
  readonly done: boolean; readonly width: number; readonly height: number; readonly fps: 30 | 60;
  next(options?: { capture?: boolean }): Promise<RecordedFrame>;
  frame(): string;
}
declare global {
  interface Window { __recorder?: Recorder; __filmRequest?: { film: Film; fps: 30 | 60 } }
}
export function createRecorder(game: Game, film: Film, fps: 30 | 60, context: CanvasRenderingContext2D, render: (game: Game) => void, saveSession?: GameSession, audio?: FilmAudioOptions): Recorder {
  const session = new FilmSession(game, film, saveSession, audio);
  let frames = 0, advancing = false;
  const pixels = () => {
    render(session.game);
    const data = context.getImageData(0, 0, context.canvas.width, context.canvas.height).data;
    let binary = '';
    for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.subarray(i, i + 8192));
    return btoa(binary);
  };
  return {
    get done() { return session.driver.done; }, width: context.canvas.width, height: context.canvas.height, fps,
    frame: pixels,
    async next(options = {}) {
      if (advancing) throw new Error('Concurrent recorder.next calls');
      advancing = true;
      try {
        let advanced = false;
        for (let i = 0; i < 60 / fps; i++) {
          if (!await session.tick()) break;
          advanced = true;
        }
        const events = session.events().map(event => ({ ...event, frame: event.type === 'chapter' || event.type.startsWith('narration-') || event.type.startsWith('music-') ? Math.floor(event.tick / (60 / fps)) : frameOf(event.tick, fps) }));
        return { rgba: advanced && options.capture !== false ? pixels() : null, events, frame: advanced ? frames++ : frames, done: session.driver.done };
      } finally { advancing = false; }
    },
  };
}
