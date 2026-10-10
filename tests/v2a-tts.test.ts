import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sha256, voiceKey } from '../engine/data/voice';
import { fake, silentWav } from '../tools/tts/provider';
import { cacheVoices } from '../tools/tts/cache';
import { MessageState } from '../engine/sim/ui/MessageState';
import { HeadlessTextMeasurer } from '../engine/sim/HeadlessTextMeasurer';
import { FilmDriver } from '../engine/film/driver';
import type { FilmView } from '../engine/film/view';
import { fixtureSource } from './fixtureSource';
import { validatePack } from '../engine/data/validator/validate';
import { builtinCatalog } from '../tools/catalog';
import { GameSession } from '../engine/sim/state/GameSession';
import { PluginRuntime } from '../engine/sim/plugins/PluginRuntime';
import { rehearse } from '../tools/film/rehearse';
import { extractFilm } from '../tools/tts/extract';
import { TimelineObserver } from '../engine/film/timeline';
import { observeGame } from '../engine/film/view';
it.each(['', 'abc', '한글 😀', 'long '.repeat(150)])('shared SHA-256 matches Node for %s', text => {
  expect(sha256(text)).toBe(createHash('sha256').update(text).digest('hex'));
});
it('cache keys include sentence/provider/voice/speed and normalize default speed', () => {
  const voice = { provider: 'fake', voice: 'first' };
  expect(voiceKey(voice, '안녕')).toBe(voiceKey({ ...voice, speed: 1 }, '안녕'));
  for (const value of [{ ...voice, voice: 'second' }, { ...voice, provider: 'macos-say' }, { ...voice, speed: 1.2 }]) expect(voiceKey(value, '안녕')).not.toBe(voiceKey(voice, '안녕'));
  expect(voiceKey(voice, '안녕!')).not.toBe(voiceKey(voice, '안녕'));
});
it('fake caching changes only an edited utterance, retains manifest durations and prunes only explicitly', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'v2a-cache-'));
  try {
    await mkdir(path.join(root, 'packs/base'), { recursive: true });
    let calls = 0;
    const provider = { ...fake, synthesize: async (text: string, voice: string, speed: number) => { calls++; return fake.synthesize(text, voice, speed); } };
    const voices = { narrator: { provider: 'fake', voice: 'a' } }, providers = new Map([['fake', provider]]);
    const messages = [{ plainText: '첫 문장' }, { plainText: '다른 문장' }];
    const first = await cacheVoices('base', messages, voices, providers, { root }); expect(calls).toBe(2);
    const file = path.join(root, 'packs/base/voice-manifest.json'), before = await readFile(file, 'utf8');
    expect((await cacheVoices('base', messages, voices, providers, { root })).generated).toBe(0); expect(await readFile(file, 'utf8')).toBe(before);
    const edited = [{ plainText: '첫 문장을 고침' }, messages[1]!];
    expect((await cacheVoices('base', edited, voices, providers, { root })).generated).toBe(1); expect(calls).toBe(3);
    expect(Object.keys(JSON.parse(await readFile(file, 'utf8')) as object)).toHaveLength(3);
    const key = voiceKey(voices.narrator, messages[1]!.plainText), originalFrames = first.manifest[key]!.frames;
    await rm(path.join(root, '.cache/voice/base', key + '.wav'));
    const warnings: string[] = [];
    const longer = new Map([['fake', { ...fake, synthesize: async () => ({ wav: silentWav(48000) }) }]]);
    const result = await cacheVoices('base', edited, voices, longer, { root, warn: text => warnings.push(text), prune: true });
    expect(result.manifest[key]?.frames).toBe(originalFrames); expect(warnings.join(' ')).toContain('length changed'); expect(Object.keys(result.manifest)).toHaveLength(2);
    expect(await readFile(file, 'utf8')).not.toContain('generatedAt');
  } finally { await rm(root, { recursive: true, force: true }); }
});
const empty = { held: new Set<never>(), pressed: new Set<never>() };
it('auto closes at max typing/voice plus gap, advances pages, and normal mode remains manual', () => {
  const create = (auto: boolean, frames = 2, gapTicks = 3) => new MessageState({ width: 6, rows: 1, charsPerTick: 1 }, new HeadlessTextMeasurer(12), undefined, () => ({ voiceKey: 'key', voiceFrames: frames, auto, gapTicks }));
  const message = create(true); message.open({ text: 'ABC' });
  for (let i = 1; i < 7; i++) { message.update(empty); expect(message.opened).toBe(true); }
  message.update(empty); expect(message.opened).toBe(false);
  const slow = new MessageState({ width: 60, rows: 1, charsPerTick: 1 }, new HeadlessTextMeasurer(12), undefined, () => ({ voiceKey: 'key', voiceFrames: 0, auto: true, gapTicks: 2 }));
  slow.open({ text: 'ABCDE' }); for (let i = 0; i < 6; i++) slow.update(empty); expect(slow.opened).toBe(true); slow.update(empty); expect(slow.opened).toBe(false);
  const normal = create(false); normal.open({ text: 'ABC' }); for (let i = 0; i < 30; i++) normal.update(empty); expect(normal.opened).toBe(true);
});
function view(): FilmView { return { mapId: 'map', width: 1, height: 1, blocked: new Uint8Array(1), player: { x: 0, y: 0, dir: 'down', moving: false }, events: [], busy: false, message: null, choice: null }; }
it('waitFor waits without input, accepts messages/choices and bounds the wait', () => {
  const state = view(), driver = new FilmDriver({ name: 'wait', steps: [{ waitFor: 'message' }] });
  expect(driver.next(state, () => true)?.pressed.size).toBe(0);
  state.choice = { prompt: undefined, options: [{ index: 0, label: 'one' }], selected: 0 }; expect(driver.next(state, () => true)).toBeNull();
  const timeout = new FilmDriver({ name: 'timeout', steps: [{ waitFor: 'message' }] });
  for (let i = 0; i < 36000; i++) timeout.next(view(), () => true);
  expect(() => timeout.next(view(), () => true)).toThrow('timed out');
});
it('voice driver waits without ok and reports missing length before proceeding', () => {
  const state = view(); state.message = { text: 'a', plainText: 'a', speaker: undefined, lines: ['a'], segments: [[]], page: 0, pageCount: 1, fullyShown: true, voiceKey: 'key', voiceFrames: 2, voiceAuto: true };
  const driver = new FilmDriver({ name: 'voice', steps: [{ advanceText: 'voice' }] });
  expect(driver.next(state, () => true)?.pressed.size).toBe(0); state.message = null; expect(driver.next(state, () => true)).toBeNull();
  state.message = { text: 'a', plainText: 'a', speaker: undefined, lines: ['a'], segments: [[]], page: 0, pageCount: 1, fullyShown: true };
  expect(() => new FilmDriver({ name: 'missing', steps: [{ advanceText: 'voice' }] }).next(state, () => true)).toThrow('npm run tts');
});
it('voices validate provider errors and missing speakers as warnings', async () => {
  const source = await fixtureSource([{ op: 'set', file: 'voices.json', pointer: '', value: { narrator: { provider: 'unknown', voice: 'x' } } }]);
  expect((await validatePack(source, 'base', { commands: builtinCatalog() })).diagnostics).toContainEqual(expect.objectContaining({ code: 'V1', file: 'voices.json', pointer: '/narrator/provider' }));
  const missing = await fixtureSource([{ op: 'set', file: 'voices.json', pointer: '', value: {} }, { op: 'set', file: 'common-events.json', pointer: '/hello/commands/-', value: { cmd: 'text', text: 'No voice' } }]);
  expect((await validatePack(missing, 'base', { commands: builtinCatalog() })).diagnostics).toContainEqual(expect.objectContaining({ code: 'VOICE', level: 'warning' }));
});
it('rehearsal resolves var text for extraction and requires a manifest for voice films', async () => {
  const voice = { provider: 'fake', voice: 'a' };
  const source = await fixtureSource([{ op: 'set', file: 'maps/map.events.json', pointer: '/events/0/y', value: 1 }, { op: 'set', file: 'voices.json', pointer: '', value: { narrator: voice } }, { op: 'set', file: 'maps/map.events.json', pointer: '/events/0/pages/0/commands', value: [{ cmd: 'text', text: '값 {var:n}' }] }]);
  const pack = (await validatePack(source, 'base', { commands: builtinCatalog() })).pack!;
  const film = { name: 'voice', steps: [{ press: 'ok' as const }, { waitFor: 'message' as const }, { advanceText: 'voice' as const }] };
  const runtime = new PluginRuntime('0.7.0');
  expect(await extractFilm(pack, film, runtime)).toEqual([{ plainText: '값 0', speaker: undefined }]);
  await expect(rehearse(pack, film, runtime)).rejects.toThrow('npm run tts');
  pack.voiceManifest = { [voiceKey(voice, '값 0')]: { frames: 5, provider: 'fake', voice: 'a' } };
  const result = await rehearse(pack, film, runtime); expect(result.events).toContainEqual(expect.objectContaining({ type: 'text-start', voiceFrames: 5, voiceKey: voiceKey(voice, '값 0') }));
});
it('auto consecutive identical messages produce separate voice timeline entries', async () => {
  const voice = { provider: 'fake', voice: 'a' }, key = voiceKey(voice, 'same');
  const source = await fixtureSource([{ op: 'set', file: 'maps/map.events.json', pointer: '/events/0/y', value: 1 }, { op: 'set', file: 'maps/map.events.json', pointer: '/events/0/pages/0/commands', value: [{ cmd: 'text', text: 'same' }, { cmd: 'text', text: 'same' }] }]);
  const pack = (await validatePack(source, 'base', { commands: builtinCatalog() })).pack!;
  const runtime = new GameSession(pack, { voices: { narrator: voice }, voiceLengths: { [key]: 2 }, recording: true });
  const observer = new TimelineObserver(), events = [];
  runtime.tick({ held: new Set(['ok']), pressed: new Set(['ok']) });
  for (let i = 0; i < 100; i++) { events.push(...observer.observe(observeGame(runtime.game), i)); runtime.tick(empty); }
  expect(events.filter(e => e.type === 'text-start')).toHaveLength(2);
});

import { Type } from '@sinclair/typebox';
it('plugin showText is extracted and warned even when it matches a static command', async () => {
  const plugins = new PluginRuntime('0.7.0', [{ name: 'speech', module: { id: 'speech', apiVersion: 1, register(api) {
    api.commands.register('x_speech', { args: Type.Object({}), *run(_args, ctx) { yield* ctx.showText({ text: 'same' }); } });
  } } }]);
  const source = await fixtureSource([{ op: 'set', file: 'maps/map.events.json', pointer: '/events/0/y', value: 1 }, { op: 'set', file: 'maps/map.events.json', pointer: '/events/0/pages/0/commands', value: [{ cmd: 'x_speech' }, { cmd: 'text', text: 'same' }] }]);
  const pack = (await validatePack(source, 'base', plugins.validationOptions)).pack!, warnings: string[] = [];
  expect(await extractFilm(pack, { name: 'plugin', steps: [{ press: 'ok' }, { advanceText: 'auto' }] }, plugins, text => warnings.push(text))).toHaveLength(2);
  expect(warnings).toHaveLength(1); expect(warnings[0]).toContain('ctx.showText');
});
it('rejects empty audio for a nonempty utterance instead of caching a zero-length manifest', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'v2a-empty-'));
  try {
    await mkdir(path.join(root, 'packs/base'), { recursive: true });
    const provider = { ...fake, synthesize: async () => ({ wav: silentWav(0) }) };
    await expect(cacheVoices('base', [{ plainText: 'speech' }], { narrator: { provider: 'fake', voice: 'a' } }, new Map([['fake', provider]]), { root })).rejects.toThrow('empty audio');
    await expect(readFile(path.join(root, 'packs/base/voice-manifest.json'))).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('voice wait has an explicit timeout and waitFor accepts an opened message', () => {
  const state = view(); state.message = { text: 'a', plainText: 'a', speaker: undefined, lines: ['a'], segments: [[]], page: 0, pageCount: 1, fullyShown: true, voiceKey: 'key', voiceFrames: 2, voiceAuto: true };
  expect(new FilmDriver({ name: 'ready', steps: [{ waitFor: 'message' }] }).next(state, () => true)).toBeNull();
  const driver = new FilmDriver({ name: 'timeout', steps: [{ advanceText: 'voice' }] });
  for (let i = 0; i < 108000; i++) driver.next(state, () => true);
  expect(() => driver.next(state, () => true)).toThrow('timed out');
});

import { dialogueTiming } from '../tools/film/audio';
it('partial chapters trim already-played voice using original ticks and keep 30fps manifest units at 60fps', () => {
  const event = { type: 'text-start' as const, id: 1, tick: 1, frame: 0, text: 'a', plainText: 'a', voiceFrames: 60 };
  expect(dialogueTiming(event, 30, 30)).toEqual({ offset: 1, duration: 1, delay: 0 });
  expect(dialogueTiming(event, 60, 60)).toEqual({ offset: 1, duration: 1, delay: 0 });
  expect(dialogueTiming({ ...event, tick: 121, frame: 30 }, 30, 30)).toEqual({ offset: 0, duration: 2, delay: 1000 });
});
