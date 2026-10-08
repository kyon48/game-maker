import type { InputFrame } from '../../engine/api';
import type { FilmView } from './view';
interface TextFields { tick: number; id: number; text: string; speaker?: string }
export type TimelineEvent =
  | (TextFields & { type: 'text-start' })
  | (TextFields & { type: 'text-end' })
  | { tick: number; type: 'choice'; id: number; phase: 'open' | 'close'; labels: string[]; indices: number[]; chosen: number | null; prompt?: string }
  | { tick: number; type: 'map'; mapId: string }
  | { tick: number; type: 'chapter'; title: string };
export type FramedEvent = TimelineEvent & { frame: number };
export class TimelineObserver {
  private previous?: FilmView;
  private sequence = 0;
  private textId = 0;
  private choiceId = 0;
  observe(view: FilmView, tick: number, input?: InputFrame): TimelineEvent[] {
    const events: TimelineEvent[] = [], before = this.previous;
    if (before?.mapId !== view.mapId) events.push({ tick, type: 'map', mapId: view.mapId });
    const old = before?.message, current = view.message;
    const committedClose = old?.fullyShown && old.page === old.pageCount - 1 && (input?.pressed.has('ok') || input?.pressed.has('cancel'));
    const same = old && current && old.text === current.text && old.speaker === current.speaker && !committedClose;
    if (old && !same) events.push({ tick, type: 'text-end', id: this.textId, text: old.text, ...(old.speaker === undefined ? {} : { speaker: old.speaker }) });
    if (current && !same) { this.textId = ++this.sequence; events.push({ tick, type: 'text-start', id: this.textId, text: current.text, ...(current.speaker === undefined ? {} : { speaker: current.speaker }) }); }
    const choice = view.choice, previous = before?.choice;
    const newChoice = choice && (!previous || input?.pressed.has('ok') || input?.pressed.has('cancel'));
    if (previous && (!choice || newChoice)) events.push({ tick, type: 'choice', id: this.choiceId, phase: 'close', prompt: previous.prompt, labels: previous.options.map(o => o.label), indices: previous.options.map(o => o.index), chosen: input?.pressed.has('ok') ? previous.selected : view.choiceResult ?? null });
    if (newChoice) { this.choiceId = ++this.sequence; events.push({ tick, type: 'choice', id: this.choiceId, phase: 'open', prompt: choice.prompt, labels: choice.options.map(o => o.label), indices: choice.options.map(o => o.index), chosen: null }); }
    this.previous = { ...view };
    return events;
  }
  finish(tick: number): TimelineEvent[] {
    const old = this.previous?.message;
    if (!old) return [];
    this.previous = { ...this.previous!, message: null };
    return [{ tick, type: 'text-end', id: this.textId, text: old.text, ...(old.speaker === undefined ? {} : { speaker: old.speaker }) }];
  }
}
export function frameOf(tick: number, fps: 30 | 60): number { return Math.max(0, Math.floor((tick - 1) / (60 / fps))); }
