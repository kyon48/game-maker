import { expect, it } from 'vitest';
import { FilmDriver } from '../engine/film/driver';
import { pathTo } from '../engine/film/path';
import type { FilmView } from '../engine/film/view';
import { TimelineObserver, frameOf } from '../engine/film/timeline';
import { artifacts, croppedEvents } from '../tools/film/artifacts';
import type { FramedEvent } from '../engine/film/timeline';
import { createRecorder } from '../engine/platform/recorder';
import { Game } from '../engine/sim/Game';
import { videoFilter } from '../tools/film/video';
import { validatePack } from '../engine/data/validator/validate';
import { builtinCatalog } from '../engine/sim/commands';
import { fixtureSource } from './fixtureSource';
import { prepareFilm, rehearse } from '../tools/film/rehearse';
const view = (): FilmView => ({ mapId: 'map', width: 5, height: 5, blocked: new Uint8Array(25), player: { x: 1, y: 2, dir: 'right', moving: false }, events: [], busy: false, message: null, choice: null });
it('BFS avoids both occupied and reserved cells and accepts only a correctly oriented adjacent goal', () => {
  const v = view(); v.events = [{ id: 'npc', x: 2, y: 2, active: true, through: false, destination: { x: 2, y: 1 } }];
  expect(pathTo(v, [{ x: 3, y: 2 }])).toEqual(['down', 'right', 'right', 'up']);
  expect(pathTo(v, [{ x: 3, y: 2, facing: 'left' }])).toEqual(['down', 'right', 'right', 'up', 'right', 'left']);
  v.blocked = new Uint8Array(25).fill(1); expect(pathTo(v, [{ x: 3, y: 2 }])).toBeNull();
});
it('walkTo replans after a tile when an NPC changes occupancy', () => {
  const v = view(), driver = new FilmDriver({ name: 'replan', steps: [{ walkTo: { x: 3, y: 2 } }] });
  expect([...driver.next(v, () => true)!.held]).toEqual(['right']);
  v.player.x = 2; v.events = [{ id: 'npc', x: 3, y: 2, active: true, through: false }];
  expect(() => driver.next(v, () => true)).toThrow('No path');
  const v2 = view(), other = new FilmDriver({ name: 'detour', steps: [{ walkTo: { x: 3, y: 2 } }] });
  other.next(v2, () => true); v2.player.x = 2; v2.events = [{ id: 'npc', x: 2, y: 1, active: true, through: false, destination: { x: 3, y: 1 } }];
  expect([...other.next(v2, () => true)!.held]).toEqual(['right']);
});
it('walkTo of a through event approaches facing it rather than turning by stepping into it', () => {
  const v = view(); v.player = { x: 2, y: 2, dir: 'left', moving: false };
  v.events = [{ id: 'target', x: 3, y: 2, active: true, through: true }];
  const driver = new FilmDriver({ name: 'through', steps: [{ walkTo: { event: 'target' } }] });
  const first = driver.next(v, () => true)!;
  expect([...first.held]).toEqual(['left']); v.player.x = 1;
  const second = driver.next(v, () => true)!;
  expect([...second.held]).toEqual(['right']); v.player.x = 2; v.player.dir = 'right';
  expect(driver.next(v, () => true)).toBeNull(); expect(v.player.x).toBe(2);
});
it('walkTo reports a stuck movement with the film step and map in its error', () => {
  const v = view(), driver = new FilmDriver({ name: 'stuck', steps: [{ walkTo: { x: 3, y: 2 } }] });
  driver.next(v, () => true); v.player.moving = true;
  for (let i = 0; i < 119; i++) driver.next(v, () => true);
  expect(() => driver.next(v, () => true)).toThrow(/step 0.*map map.*timed out/);
});
it('auto waits for fully shown text plus the configured reading duration, page by page', () => {
  const v = view(); v.message = { text: '한글', speaker: '화자', lines: [''], page: 0, pageCount: 1, fullyShown: false };
  const driver = new FilmDriver({ name: 'reading', steps: [{ advanceText: 'auto' }] });
  for (let i = 0; i < 3; i++) expect(driver.next(v, () => true)!.pressed.size).toBe(0);
  v.message = { ...v.message, lines: ['한글'], fullyShown: true };
  for (let i = 0; i < 45; i++) expect(driver.next(v, () => true)!.pressed.size).toBe(0);
  expect(driver.next(v, () => true)!.pressed.has('ok')).toBe(true);
  const fast = new FilmDriver({ name: 'fast', readingSpeed: { base: 0, perCharacter: 0 }, steps: [{ advanceText: 'auto' }] });
  expect(fast.next(v, () => true)!.pressed.has('ok')).toBe(true);
});
it('expect and chapter do not advance any ticks, and hidden choices are errors', () => {
  const v = view(), driver = new FilmDriver({ name: 'zero', steps: [{ chapter: '시작' }, { expect: { flag: 'met', is: true } }] });
  expect(driver.next(v, () => true)).toBeNull(); expect(driver.ticks).toBe(0); expect(driver.chapters).toEqual([{ tick: 0, title: '시작' }]);
  expect(() => new FilmDriver({ name: 'bad', steps: [{ expect: { flag: 'met', is: true } }] }).next(v, () => false)).toThrow('expectation');
  v.choice = { prompt: undefined, options: [{ index: 1, label: 'one' }, { index: 3, label: 'three' }], selected: 1 };
  expect(() => new FilmDriver({ name: 'hidden', steps: [{ choose: 0 }] }).next(v, () => true)).toThrow('hidden');
  const choice = new FilmDriver({ name: 'visible', steps: [{ choose: 3, dwell: 0.1 }] });
  for (let i = 0; i < 6; i++) expect(choice.next(v, () => true)!.pressed.size).toBe(0);
  expect(choice.next(v, () => true)!.pressed.has('down')).toBe(true);
});
it('observes consecutive identical messages, page changes, chosen options and map changes', () => {
  const v = view(), observer = new TimelineObserver();
  expect(observer.observe(v, 0)).toEqual([{ tick: 0, type: 'map', mapId: 'map' }]);
  v.message = { text: '같은 대사', speaker: '화자', lines: ['같은 대사'], fullyShown: true, page: 0, pageCount: 2 };
  expect(observer.observe(v, 1)[0]?.type).toBe('text-start');
  v.message = { ...v.message, page: 1, fullyShown: false };
  expect(observer.observe(v, 2, { held: new Set(), pressed: new Set(['ok']) })).toEqual([]);
  v.message = { ...v.message, fullyShown: true }; observer.observe(v, 3);
  v.message = { ...v.message, page: 0, fullyShown: false };
  const identical = observer.observe(v, 4, { held: new Set(), pressed: new Set(['ok']) });
  expect(identical.map(e => e.type)).toEqual(['text-end', 'text-start']);
  expect('id' in identical[0]! && 'id' in identical[1]! && identical[0].id !== identical[1].id).toBe(true);
  v.message = null; v.choice = { prompt: undefined, options: [{ index: 2, label: '선택' }], selected: 2 }; observer.observe(v, 5);
  v.choice = null; v.choiceResult = 2; v.mapId = 'other';
  expect(observer.observe(v, 6)).toContainEqual(expect.objectContaining({ type: 'choice', phase: 'close', chosen: 2 }));
});
it.each([
  [{ steps: [{ walkTo: { event: 'missing' } }] }, 'V3', '/steps/0/walkTo/event'],
  [{ start: { map: 'missing', x: 1, y: 1, dir: 'up' }, steps: [] }, 'V3', '/start/map'],
  [{ steps: [{ expect: { flag: 'missing', is: true } }] }, 'V3', '/steps/0/expect/flag'],
  [{ state: { flags: { missing: true } }, steps: [] }, 'V3', '/state/flags/missing'],
  [{ steps: [{ pause: -1 }] }, 'V1', '/steps/0'],
  [{ steps: [{ walkTo: { x: 99, y: 99 } }] }, 'V6', '/steps/0/walkTo'],
  [{ steps: [{ chapter: 'same' }, { chapter: 'same' }] }, 'V9', '/steps/1/chapter'],
] as const)('film validation reports code/file/pointer for %j', async (changes, code, pointer) => {
  const source = await fixtureSource([{ op: 'set', file: 'films/invalid.film.json', pointer: '', value: { name: 'invalid', ...changes } }]);
  const result = await validatePack(source, 'base', { commands: builtinCatalog() });
  expect(result.pack).toBeUndefined();
  expect(result.diagnostics.some(d => d.code === code && d.file === 'films/invalid.film.json' && d.pointer.startsWith(pointer))).toBe(true);
});
it('generates subtitles, chapters and script, rebasing a message spanning a chapter boundary', () => {
  const events: FramedEvent[] = [{ type: 'chapter', title: '도착', tick: 0, frame: 0 }, { type: 'text-start', id: 1, text: '안녕\n하세요', speaker: '화자', tick: 1, frame: 0 }, { type: 'chapter', title: '기록', tick: 120, frame: 60 }, { type: 'text-end', id: 1, text: '안녕\n하세요', speaker: '화자', tick: 240, frame: 119 }];
  const files = artifacts(events, 30, 120, '촬영');
  expect(files.subtitles).toContain('00:00:00,000 --> 00:00:03,966'); expect(files.subtitles).toContain('화자: 안녕\n하세요');
  expect(files.chapters).toBe('00:00 도착\n00:02 기록\n'); expect(files.script).toContain('## 00:02 기록');
  const cropped = croppedEvents(events, 60, 90);
  expect(cropped[0]).toMatchObject({ type: 'text-start', frame: 0 });
  expect(cropped.at(-1)).toMatchObject({ type: 'text-end', frame: 30 });
  expect(frameOf(2, 30)).toBe(0); expect(frameOf(3, 30)).toBe(1); expect(frameOf(3, 60)).toBe(2);
});
it('video filters use maximum integer neighbor scaling then centered black padding', () => {
  expect(videoFilter(480, 270)).toContain('scale=1920:1080:flags=neighbor');
  expect(videoFilter(320, 240)).toContain('scale=1280:960:flags=neighbor,pad=1920:1080');
  expect(() => videoFilter(2000, 1200)).toThrow('exceeds');
});
it.each([['demo', 'visit'], ['manor', 'truth']])('rehearses %s/%s through real Game and expectations', async (id, name) => {
  const { pack, film, plugins } = await prepareFilm(id!, name!);
  const result = await rehearse(pack, film, plugins);
  expect(result.ticks).toBeGreaterThan(0); expect(result.events.some(e => e.type === 'text-start')).toBe(true);
  if (id === 'manor') expect(result.game.state.getFlag('ending_truth')).toBe(true);
});

it('crop carries the active map and choice, and closes a choice cut before confirmation', () => {
  const events: FramedEvent[] = [{ type: 'map', mapId: 'map', tick: 0, frame: 0 }, { type: 'choice', id: 4, phase: 'open', labels: ['a', 'b'], indices: [0, 3], chosen: null, tick: 1, frame: 1 }, { type: 'chapter', title: 'cut', tick: 10, frame: 10 }];
  const cropped = croppedEvents(events, 10, 20);
  expect(cropped[0]).toMatchObject({ type: 'map', frame: 0 });
  expect(cropped[1]).toMatchObject({ type: 'choice', phase: 'open', frame: 0 });
  expect(cropped.at(-1)).toMatchObject({ type: 'choice', phase: 'close', chosen: null, frame: 10 });
});
it('recorder advances two ticks at 30fps or one at 60fps and skip-capture never reads pixels', async () => {
  const source = await fixtureSource([]);
  const pack = (await validatePack(source, 'base', { commands: builtinCatalog() })).pack!;
  const makeGame = () => new Game(pack.game, pack.maps.get('map')!, pack.characters, pack.events.get('map')!);
  let renders = 0, reads = 0;
  const context = { canvas: { width: 1, height: 1 }, getImageData: () => { reads++; return { data: new Uint8ClampedArray([1, 2, 3, 255]) }; } } as unknown as CanvasRenderingContext2D;
  const recorder = createRecorder(makeGame(), { name: 'frames', steps: [{ wait: 3 }] }, 30, context, () => { renders++; });
  const first = recorder.next({ capture: false });
  await expect(recorder.next()).rejects.toThrow('Concurrent');
  expect(await first).toMatchObject({ frame: 0, rgba: null, done: false });
  expect(renders).toBe(0); expect(reads).toBe(0);
  expect(await recorder.next()).toMatchObject({ frame: 1, rgba: 'AQID/w==', done: true });
  expect(reads).toBe(1);
  expect(await recorder.next()).toMatchObject({ frame: 2, rgba: null, done: true });
  const sixty = createRecorder(makeGame(), { name: 'sixty', steps: [{ wait: 3 }] }, 60, context, () => {});
  for (let i = 0; i < 3; i++) expect((await sixty.next()).frame).toBe(i);
  expect((await sixty.next()).rgba).toBeNull(); expect(sixty.done).toBe(true);
});
it('crop does not carry a message or choice that already closes on its first frame', () => {
  const events: FramedEvent[] = [
    { type: 'text-start', id: 1, text: '이전 대사', tick: 1, frame: 0 },
    { type: 'choice', id: 2, phase: 'open', labels: ['이전 선택'], indices: [0], chosen: null, tick: 2, frame: 1 },
    { type: 'text-end', id: 1, text: '이전 대사', tick: 20, frame: 10 },
    { type: 'choice', id: 2, phase: 'close', labels: ['이전 선택'], indices: [0], chosen: 0, tick: 20, frame: 10 },
    { type: 'chapter', title: '새 챕터', tick: 20, frame: 10 },
    { type: 'text-start', id: 3, text: '새 대사', tick: 21, frame: 10 },
  ];
  const cropped = croppedEvents(events, 10, 20);
  expect(cropped.some(e => e.type === 'text-start' && e.id === 1)).toBe(false);
  expect(cropped.some(e => e.type === 'choice' && e.id === 2 && e.phase === 'open')).toBe(false);
  expect(artifacts(cropped, 30, 10, '새 챕터').subtitles).not.toContain('이전 대사');
});
it('a confirmed choice keeps its selected original index when another choice opens in the same tick', () => {
  const v = view(), observer = new TimelineObserver();
  v.choice = { prompt: '첫 선택', options: [{ index: 3, label: '계속' }], selected: 3 };
  observer.observe(v, 1);
  v.choice = { prompt: '다음 선택', options: [{ index: 0, label: '다음' }], selected: 0 }; v.choiceResult = undefined;
  const events = observer.observe(v, 2, { held: new Set(['ok']), pressed: new Set(['ok']) });
  expect(events).toContainEqual(expect.objectContaining({ type: 'choice', phase: 'close', chosen: 3 }));
});
it('walkTo rechecks an event that moves away during the final facing input', () => {
  const v = view(); v.player = { x: 2, y: 2, dir: 'right', moving: false };
  v.events = [{ id: 'target', x: 2, y: 1, active: true, through: false }];
  const driver = new FilmDriver({ name: 'moving target', steps: [{ walkTo: { event: 'target' } }] });
  expect(driver.next(v, () => true)!.pressed.has('up')).toBe(true);
  v.player.dir = 'up'; v.events = [{ id: 'target', x: 4, y: 2, active: true, through: false }];
  driver.next(v, () => true);
  expect(driver.next(v, () => true)?.held.has('right')).toBe(true);
});
