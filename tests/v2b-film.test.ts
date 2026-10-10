import { expect, it } from 'vitest';
import { FilmDriver } from '../engine/film/driver';
import type { FilmView } from '../engine/film/view';
import type { Film } from '../engine/data/schema/film';
import type { FramedEvent, TimelineEvent } from '../engine/film/timeline';
import { artifacts, croppedEvents } from '../tools/film/artifacts';
import { audioPlan, audioTiming, duckRegions, duckVolumeAt } from '../tools/film/audio-plan';
import { validatePack } from '../engine/data/validator/validate';
import { builtinCatalog } from '../tools/catalog';
import { fixtureSource } from './fixtureSource';
import { voiceKey } from '../engine/data/voice';
import { PluginRuntime } from '../engine/sim/plugins/PluginRuntime';
import { extractFilm } from '../tools/tts/extract';
import { rehearse } from '../tools/film/rehearse';
const key = 'a'.repeat(64);
const view = (): FilmView => ({ mapId: 'map', width: 1, height: 1, blocked: new Uint8Array(1), player: { x: 0, y: 0, dir: 'down', moving: false }, events: [], busy: false, message: null, choice: null });
function run(film: Film, state = view()) {
  const driver = new FilmDriver(film, { narration: text => ({ plainText: text, voiceKey: key, voiceFrames: 3 }) }), events: TimelineEvent[] = [];
  while (driver.next(state, () => true)) events.push(...driver.audio.events());
  events.push(...driver.audio.events()); return { driver, events };
}
it('nonblocking narration lets the next chapter run immediately and queues a second narration', () => {
  const { driver, events } = run({ name: 'queue', steps: [{ narrate: 'first' }, { chapter: 'walking' }, { pause: 0.05 }, { narrate: 'second' }, { waitNarration: true }, { chapter: 'end' }] });
  expect(driver.chapters).toEqual([{ title: 'walking', tick: 0 }, { title: 'end', tick: 12 }]);
  expect(events.map(e => [e.type, e.tick])).toEqual([['narration-start', 0], ['narration-end', 6], ['narration-start', 6], ['narration-end', 12]]);
  expect(driver.ticks).toBe(12);
});
it('wait true blocks, wait false does not, and pending narration finishes before film done', () => {
  const { driver } = run({ name: 'wait', steps: [{ narrate: 'a', wait: true }, { chapter: 'after' }, { narrate: 'b', wait: false }, { chapter: 'immediate' }] });
  expect(driver.chapters).toEqual([{ tick: 6, title: 'after' }, { tick: 6, title: 'immediate' }]); expect(driver.ticks).toBe(12);
  expect(() => new FilmDriver({ name: 'missing', steps: [{ narrate: 'a' }] }).next(view(), () => true)).toThrow('npm run tts');
});
it('warns once per overlapping narration/message instead of rejecting rehearsal', () => {
  const state = view(); state.message = { text: 'dialogue', plainText: 'dialogue', speaker: 'a', lines: ['a'], segments: [[]], fullyShown: true, page: 0, pageCount: 1, voiceAuto: true, voiceFrames: 3, voiceKey: key, messageId: 1 };
  const { driver } = run({ name: 'overlap', steps: [{ narrate: 'a' }, { pause: 0.1 }] }, state);
  expect(driver.audio.warnings).toHaveLength(1);
});
it('music changes and stops keep file, volume, fade, loop in timeline', () => {
  const { events } = run({ name: 'music', steps: [{ music: { file: 'assets/music/a.ogg', volume: 0.3, fadeIn: 1, loop: true } }, { pause: 1 }, { music: null, fadeOut: 2 }] });
  expect(events).toEqual([{ type: 'music-start', tick: 0, id: 1, file: 'assets/music/a.ogg', volume: 0.3, fade: 1, loop: true }, { type: 'music-stop', tick: 60, id: 1, file: 'assets/music/a.ogg', volume: 0.3, fade: 2 }]);
});
const timeline: FramedEvent[] = [
  { type: 'music-start', id: 3, tick: 0, frame: 0, file: 'assets/music/a.ogg', volume: 0.3, fade: 1, loop: true },
  { type: 'narration-start', id: 1, tick: 0, frame: 0, text: 'narration', plainText: 'narration', voiceKey: key, voiceFrames: 90 },
  { type: 'text-start', id: 1, tick: 31, frame: 15, text: 'dialogue', plainText: 'dialogue', speaker: 'Person', voiceKey: key, voiceFrames: 30 },
  { type: 'text-end', id: 1, tick: 91, frame: 45, text: 'dialogue', plainText: 'dialogue' },
  { type: 'narration-end', id: 1, tick: 180, frame: 90, text: 'narration', plainText: 'narration', voiceKey: key, voiceFrames: 90 },
  { type: 'music-stop', id: 3, tick: 240, frame: 120, file: 'assets/music/a.ogg', volume: 0.3, fade: 1 },
];
it('SRT includes separately identified narration and script narration paragraphs', () => {
  const files = artifacts(timeline, 30, 150, 'film');
  expect(files.subtitles).toContain('00:00:00,000 --> 00:00:03,000\n[나레이션] narration');
  expect(files.subtitles).toContain('00:00:00,500 --> 00:00:01,500\nPerson: dialogue');
  expect(files.script).toContain('· 나레이션**\n\nnarration');
});
it('chapter cuts carry active narration/music and trim elapsed sound, including fade tails', () => {
  const clipped = croppedEvents(timeline, 30, 60);
  expect(clipped).toContainEqual(expect.objectContaining({ type: 'narration-start', tick: 0, frame: 0 }));
  const narration = clipped.find((e): e is Extract<FramedEvent, { type: 'narration-start' }> => e.type === 'narration-start')!;
  expect(audioTiming(narration, 30, 30)).toEqual({ offset: 1, duration: 2, delay: 0 });
  expect(audioTiming(narration, 60, 60)).toEqual({ offset: 1, duration: 2, delay: 0 });
  const plan = audioPlan('base', clipped, 30, 30, 30);
  expect(plan.filter).toContain('atrim=start=1'); expect(plan.filter).toContain('aformat=channel_layouts=stereo');
  expect(plan.args).toContain('-stream_loop'); expect(plan.files).toHaveLength(3);
  expect(croppedEvents(timeline, 135, 150)).toContainEqual(expect.objectContaining({ type: 'music-start', frame: 0 }));
  expect(audioPlan('base', croppedEvents(timeline, 135, 150), 30, 15, 135).filter).toContain('5-(t+4.5)');
});
it('ducking has deterministic ramps, merges adjacent/overlapping voice and recovers', () => {
  const regions = duckRegions([{ start: 1, end: 2 }, { start: 1.5, end: 3 }, { start: 3.2, end: 4 }]);
  expect(regions).toEqual([{ start: 1, end: 4, attack: 0.85, release: 4.15 }]);
  expect(duckVolumeAt(regions, 0.8)).toBe(1); expect(duckVolumeAt(regions, 1.5)).toBeCloseTo(10 ** (-12 / 20));
  expect(duckVolumeAt(regions, 0.925)).toBeCloseTo((1 + 10 ** (-12 / 20)) / 2);
  expect(duckVolumeAt(regions, 4.075)).toBeCloseTo((1 + 10 ** (-12 / 20)) / 2); expect(duckVolumeAt(regions, 5)).toBe(1);
});
it.each(['../outside.ogg', '/absolute.wav', 'assets/music/x.png', 'assets/music/missing.ogg'])('film rejects missing/invalid music %s with V3', async file => {
  const source = await fixtureSource([{ op: 'set', file: 'films/main.film.json', pointer: '', value: { name: 'main', steps: [{ music: { file } }] } }]);
  expect((await validatePack(source, 'base', { commands: builtinCatalog() })).diagnostics).toContainEqual(expect.objectContaining({ code: 'V3', file: 'films/main.film.json', pointer: '/steps/0/music/file' }));
});
it('narration text references use existing V1/V3 checks', async () => {
  const source = await fixtureSource([{ op: 'set', file: 'films/main.film.json', pointer: '', value: { name: 'main', steps: [{ narrate: '{var:missing}' }, { narrate: '{wait:no}' }] } }]);
  const result = await validatePack(source, 'base', { commands: builtinCatalog() });
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'V3', pointer: '/steps/0/narrate' }));
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'V1', pointer: '/steps/1/narrate' }));
});
it('TTS bootstrap extracts narration plain text at film state; real rehearsal requires its manifest', async () => {
  const voice = { provider: 'fake', voice: 'a' };
  const source = await fixtureSource([{ op: 'set', file: 'voices.json', pointer: '', value: { narrator: voice } }]);
  const plugins = new PluginRuntime('0.8.0'), pack = (await validatePack(source, 'base', plugins.validationOptions)).pack!;
  const film: Film = { name: 'narration', state: { vars: { n: 3 } }, steps: [{ narrate: '값 {var:n}{wait:2}{speed:2}!' }, { waitNarration: true }] };
  expect(await extractFilm(pack, film, plugins)).toEqual([{ plainText: '값 3!', speaker: 'narrator' }]);
  await expect(rehearse(pack, film, plugins)).rejects.toThrow('npm run tts');
  pack.voiceManifest = { [voiceKey(voice, '값 3!')]: { frames: 4, ...voice } };
  const result = await rehearse(pack, film, plugins); expect(result.ticks).toBe(8); expect(result.events.map(e => e.type)).toEqual(['map', 'narration-start', 'narration-end']);
});

it('does not warn for narration during the silent closing gap after a voice ends', () => {
  const state = view(); state.message = { text: 'a', plainText: 'a', speaker: undefined, lines: ['a'], segments: [[]], fullyShown: true, page: 0, pageCount: 1, voiceAuto: true, voiceFrames: 1, voiceKey: key, messageId: 1 };
  const { driver } = run({ name: 'gap', steps: [{ pause: 0.05 }, { narrate: 'a' }, { waitNarration: true }] }, state);
  expect(driver.audio.warnings).toHaveLength(0);
});
