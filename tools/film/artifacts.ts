import type { FramedEvent } from '../../engine/film/timeline';
export function timestamp(frame: number, fps: number, milliseconds = false): string {
  const ms = Math.floor(frame * 1000 / fps), seconds = Math.floor(ms / 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
  return milliseconds ? `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}` : h ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
export function artifacts(events: readonly FramedEvent[], fps: number, frames: number, title: string) {
  const ends = new Map(events.filter(e => e.type === 'text-end').map(e => [e.id, e.frame]));
  const starts = events.filter(e => e.type === 'text-start');
  const subtitles = starts.map((event, index) => {
    const end = Math.min(frames, Math.max(event.frame + 1, ends.get(event.id) ?? frames));
    return `${index + 1}\n${timestamp(event.frame, fps, true)} --> ${timestamp(end, fps, true)}\n${event.speaker ? event.speaker + ': ' : ''}${event.text}\n`;
  }).join('\n');
  const chapters = events.filter(e => e.type === 'chapter').map(e => `${timestamp(e.frame, fps)} ${e.title}`).join('\n');
  const script = ['# ' + title, ''];
  for (const event of events) {
    const at = timestamp(event.frame, fps);
    if (event.type === 'chapter') script.push(`## ${at} ${event.title}`, '');
    if (event.type === 'text-start') script.push(`**${at} · ${event.speaker ?? '내레이션'}**`, '', event.text, '');
    if (event.type === 'choice' && event.phase === 'open') script.push(`**${at} · 선택지${event.prompt ? ': ' + event.prompt : ''}**`, '', ...event.labels.map((label, i) => `- ${event.indices[i]}: ${label}`), '');
    if (event.type === 'choice' && event.phase === 'close') script.push(`선택 (${at}): ${event.chosen ?? '미확정'}${event.chosen === null ? '' : ' — ' + (event.labels[event.indices.indexOf(event.chosen)] ?? '')}`, '');
    if (event.type === 'map') script.push(`맵 (${at}): ${event.mapId}`, '');
  }
  return { subtitles, chapters: chapters + (chapters ? '\n' : ''), script: script.join('\n') + '\n' };
}
export function croppedEvents(events: readonly FramedEvent[], from: number, to: number): FramedEvent[] {
  const result = events.filter(e => e.frame >= from && e.frame < to).map(e => ({ ...e, frame: e.frame - from }));
  // Carry a message already open at the crop boundary; close an unfinished one at the cut.
  const open = new Map<number, Extract<FramedEvent, { type: 'text-start' | 'text-end' }>>();
  const choices = new Map<number, Extract<FramedEvent, { type: 'choice' }>>();
  let map: Extract<FramedEvent, { type: 'map' }> | undefined;
  for (const e of events) {
    if (e.frame >= from) break;
    if (e.type === 'text-start') open.set(e.id, e);
    if (e.type === 'text-end') open.delete(e.id);
    if (e.type === 'choice' && e.phase === 'open') choices.set(e.id, e);
    if (e.type === 'choice' && e.phase === 'close') choices.delete(e.id);
    if (e.type === 'map') map = e;
  }
  for (const e of result) if (e.frame === 0) {
    if (e.type === 'text-end') open.delete(e.id);
    if (e.type === 'choice' && e.phase === 'close') choices.delete(e.id);
  }
  result.unshift(...[...open.values(), ...choices.values()].map(e => ({ ...e, frame: 0 })));
  if (map && !result.some(e => e.type === 'map' && e.frame === 0)) result.unshift({ ...map, frame: 0 });
  const ended = new Set(result.filter(e => e.type === 'text-end').map(e => e.id));
  for (const e of [...result]) if (e.type === 'text-start' && !ended.has(e.id)) result.push({ ...e, type: 'text-end', frame: to - from });
  const closedChoices = new Set(result.flatMap(e => e.type === 'choice' && e.phase === 'close' ? [e.id] : []));
  for (const e of [...result]) if (e.type === 'choice' && e.phase === 'open' && !closedChoices.has(e.id)) result.push({ ...e, phase: 'close', chosen: null, frame: to - from });
  return result;
}
