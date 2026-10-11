import { beforeAll, expect, it, vi } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { readFile } from 'node:fs/promises';
import { namedCommand, packSchemas } from '../engine/data/schema/export';
import { AudioSchema } from '../engine/data/audio';
import type { Audio } from '../engine/data/audio';
import { validatePack } from '../engine/data/validator/validate';
import type { ValidatedPack } from '../engine/data/validator/types';
import { GameSession } from '../engine/sim/state/GameSession';
import { FilmSession } from '../engine/film/session';
import { FilmAudio } from '../engine/film/audio';
import { frameOf } from '../engine/film/timeline';
import type { FramedEvent } from '../engine/film/timeline';
import { audioPlan } from '../tools/film/audio-plan';
import { croppedEvents } from '../tools/film/artifacts';
import { FsSource } from '../tools/fsSource';
import { builtinCatalog } from '../tools/catalog';
import { fixtureSource } from './fixtureSource';
import { parseStory } from '../tools/story/parser';
import { lintStories } from '../tools/story/lint';
import { compileStories } from '../tools/story/compile';
import { GameAudio } from '../engine/platform/audio';
let base: ValidatedPack;
const audio: Audio = { quiet: { file: 'assets/audio/quiet.ogg', loop: true }, mystery: { file: 'assets/audio/mystery.ogg', volume: 0.6 }, get: { file: 'assets/audio/get.wav', volume: 0.8 } };
const empty = () => ({ held: new Set<never>(), pressed: new Set<never>() });
beforeAll(async () => { base = (await validatePack(new FsSource('tests/fixtures/base'), 'base', { commands: builtinCatalog() })).pack!; });
function session() {
  return new GameSession({ ...base, audio, game: { ...base.game, maps: ['map', 'other', 'silent'], mapBgm: { map: 'quiet', other: 'quiet' } }, maps: new Map([...base.maps, ['other', base.maps.get('map')!], ['silent', base.maps.get('map')!]]), events: new Map([...base.events, ['other', base.events.get('map')!], ['silent', base.events.get('map')!]]) });
}
async function commands(runtime: GameSession, list: import('../engine/data/events').Command[]) {
  const g = runtime.game; g.main.start(list, g['host'](g.events[0]!));
  const snapshots = [];
  do { runtime.tick(empty()); snapshots.push(runtime.snapshot.audio); await Promise.resolve(); } while (g.main.running);
  return snapshots;
}
it('same BGM continues, command override lasts to transfer, absent map default stops; requests clear each tick', async () => {
  const s = session(); expect(s.snapshot.audio).toEqual({ bgm: 'quiet', requests: [{ kind: 'bgm', id: 'quiet', fade: 0 }] });
  expect((await commands(s, [{ cmd: 'bgm', id: 'quiet' }]))[0]!.requests).toEqual([]);
  const same = await commands(s, [{ cmd: 'transfer', map: 'other', x: 1, y: 1, fade: false }]); expect(same.flatMap(x => x.requests)).toEqual([]);
  const override = await commands(s, [{ cmd: 'bgm', id: 'mystery', fade: 0.3 }, { cmd: 'sfx', id: 'get' }, { cmd: 'sfx', id: 'get' }]);
  expect(override[0]).toEqual({ bgm: 'mystery', requests: [{ kind: 'bgm', id: 'mystery', fade: 0.3 }, { kind: 'sfx', id: 'get' }, { kind: 'sfx', id: 'get' }] });
  s.tick(empty()); expect(s.snapshot.audio.requests).toEqual([]); expect(s.snapshot.audio.bgm).toBe('mystery');
  await commands(s, [{ cmd: 'transfer', map: 'map', x: 1, y: 1, fade: false }]); expect(s.snapshot.audio.bgm).toBe('quiet');
  await commands(s, [{ cmd: 'transfer', map: 'silent', x: 1, y: 1, fade: false }]); expect(s.snapshot.audio.bgm).toBeNull();
});
it('save keeps version 2 and omits transport; reload restores map default even after command override', async () => {
  const s = session(); await commands(s, [{ cmd: 'bgm', id: 'mystery' }, { cmd: 'save' }]);
  expect(s.lastSave?.saveVersion).toBe(2); expect(s.lastSave).not.toHaveProperty('audio'); expect(s.lastSave).not.toHaveProperty('bgm');
  s.reload(); expect(s.snapshot.audio.bgm).toBe('quiet');
});
it('film observes constructor and per-tick requests once, shared channel is last request wins in both directions', async () => {
  const s = session(), film = new FilmSession(s.game, { name: 'sound', steps: [{ music: { file: 'assets/audio/mystery.ogg' } }, { pause: 0.1 }] }, s);
  s.game.main.start([{ cmd: 'sfx', id: 'get' }, { cmd: 'bgm', stop: true }], s.game['host'](s.game.events[0]!));
  const events = []; while (await film.tick()) events.push(...film.events()); events.push(...film.events());
  expect(events.filter(e => e.type === 'sfx')).toHaveLength(1);
  expect(events.filter(e => /^(bgm|music)-/.test(e.type)).map(e => e.type)).toEqual(['bgm-start', 'music-stop', 'music-start', 'bgm-stop']);
  const channel = new FilmAudio(); channel.setMusic({ file: 'film.ogg' }, 0); channel.gameSound({ bgm: 'quiet', requests: [{ kind: 'bgm', id: 'quiet', fade: 0 }] }, audio, 1);
  expect(channel.events().map(e => e.type)).toEqual(['music-start', 'bgm-stop', 'bgm-start']);
  const boundary = new FilmAudio(); boundary.setMusic({ file: 'old.ogg' }, 0); boundary.gameSound({ bgm: 'quiet', requests: [{ kind: 'bgm', id: 'quiet', fade: 0 }] }, audio, 2);
  const framed = boundary.events().map(e => ({ ...e, frame: e.type.startsWith('bgm-') ? frameOf(e.tick, 30) : Math.floor(e.tick / 2) }));
  expect(audioPlan('pack', framed, 30, 30).files).toEqual(['packs/pack/assets/audio/quiet.ogg']);
});
it('BGM is ducked but SFX is not, loop bounds and chapter source offsets preserve audio phase', () => {
  const a = new FilmAudio(); a.gameSound({ bgm: 'quiet', requests: [{ kind: 'bgm', id: 'quiet', fade: 1 }, { kind: 'sfx', id: 'get' }] }, audio, 0);
  const events: FramedEvent[] = a.events().map(e => ({ ...e, frame: Math.floor(e.tick / 2) }));
  events.push({ type: 'text-start', frame: 0, tick: 1, id: 99, text: 'voice', plainText: 'voice', voiceKey: 'a'.repeat(64), voiceFrames: 60 });
  const plan = audioPlan('pack', events, 30, 90, 0, '.', { 'assets/audio/quiet.ogg': 8 });
  expect(plan.duck).toHaveLength(1); expect(plan.filter).toContain('min(1,'); expect(plan.filter).toContain('volume=0.8,adelay=0');
  expect(plan.args).toContain('-stream_loop');
  const cropped = croppedEvents(events, 30, 90), cut = audioPlan('pack', cropped, 30, 60, 30, '.', { 'assets/audio/quiet.ogg': 8 });
  expect(cropped.some(e => e.type === 'bgm-start')).toBe(true); expect(cropped.some(e => e.type === 'sfx')).toBe(true);
  expect(cut.filter).toContain('atrim=start=1'); expect(frameOf(61, 30)).toBe(30);
});
it('schema/reference/file diagnostics use V1/V3/V4 and one shared audio format list', async () => {
  expect(Value.Check(AudioSchema, audio)).toBe(true); expect(Value.Check(AudioSchema, { a: { file: 'a.wav', volume: 2 } })).toBe(false);
  for (const [change, code] of [
    [{ op: 'set', file: 'game.json', pointer: '/mapBgm', value: { map: 'missing' } }, 'V3'],
    [{ op: 'set', file: 'audio.json', pointer: '', value: { a: { file: 'a.wav', volume: 2 } } }, 'V1'],
    [{ op: 'set', file: 'maps/map.events.json', pointer: '/events/0/pages/0/commands', value: [{ cmd: 'bgm', id: 'a', stop: true }] }, 'V1'],
    [{ op: 'set', file: 'audio.json', pointer: '', value: { a: { file: '../a.wav' } } }, 'V4'],
    [{ op: 'set', file: 'audio.json', pointer: '', value: { a: { file: 'missing.ogg' } } }, 'V4'],
    [{ op: 'set', file: 'audio.json', pointer: '', value: { a: { file: 'assets/characters/hero.png' } } }, 'V4'],
    [{ op: 'set', file: 'maps/map.events.json', pointer: '/events/0/pages/0/commands', value: [{ cmd: 'sfx', id: 'unknown' }] }, 'V3'],
  ] as const) {
    const result = await validatePack(await fixtureSource([change]), 'base', { commands: builtinCatalog() }); expect(result.diagnostics.some(d => d.code === code && d.level === 'error')).toBe(true);
  }
});
it('story audio declarations, map defaults and commands compile deterministically; unknown references fail lint', async () => {
  const original = (await readFile('tests/fixtures/story/valid.story.md', 'utf8')).replace(/ voice=\w+/g, '');
  const text = original.replace('@location ', '@audio quiet file=assets/audio/quiet.ogg volume=0.8 loop\n@audio get file=assets/audio/get.wav\n@location ').replace(/(@location \w+ "[^"]+")/, '$1 bgm=quiet').replace(/(@event[^\n]+\n)/, '$1  @bgm quiet fade=0.5\n  @sfx get\n  @bgm stop fade=1\n');
  const parsed = parseStory(text); expect(parsed.diagnostics).toEqual([]); expect(lintStories([parsed.story]).filter(d => d.level === 'error')).toEqual([]);
  const compile = () => compileStories([parsed.story], base.game, { wall: 1, floor: 2, door: 3, tileset: 'assets/tiles/test.tsj' });
  const first = compile(), second = compile(); expect([...first.files]).toEqual([...second.files]);
  expect(JSON.parse(first.files.get('audio.json')!)).toEqual({ quiet: { file: 'assets/audio/quiet.ogg', volume: 0.8, loop: true }, get: { file: 'assets/audio/get.wav' } });
  expect(JSON.parse(first.files.get('game.json')!).mapBgm).toBeDefined(); expect([...first.files.values()].join('')).toContain('"cmd": "sfx"');
  for (const changed of [text.replace('@sfx get', '@sfx missing'), text.replace('bgm=quiet', 'bgm=missing'), text.replace('@bgm quiet', '@bgm missing')]) expect(lintStories([parseStory(changed).story]).some(d => d.code === 'S045')).toBe(true);
  for (const changed of [text.replace('volume=0.8', 'volume=2'), text.replace('fade=0.5', 'fade=-1')]) expect(parseStory(changed).diagnostics.some(d => d.code === 'S001')).toBe(true);
});
it('Web Audio decodes once, unlocks/resumes on input, suspends hidden tabs, fades and disposes every source', async () => {
  const sources: { stop: ReturnType<typeof vi.fn>; loop: boolean }[] = [], gains: { gain: { linearRampToValueAtTime: ReturnType<typeof vi.fn> } }[] = [];
  const context = { currentTime: 1, destination: {}, resume: vi.fn(async () => {}), suspend: vi.fn(async () => {}), close: vi.fn(async () => {}), decodeAudioData: vi.fn(async () => ({})), createBufferSource: () => { const s = { start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), loop: false }; sources.push(s); return s; }, createGain: () => { const g = { gain: { setValueAtTime: vi.fn(), cancelAndHoldAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; gains.push(g); return g; } };
  const target = new EventTarget(), visibility = Object.assign(new EventTarget(), { hidden: false });
  const transport = new GameAudio({ ...audio, alias: audio.quiet! }, context as unknown as AudioContext, target, visibility as unknown as Document);
  await transport.preload(async () => new Uint8Array([1])); expect(context.decodeAudioData).toHaveBeenCalledTimes(3);
  expect(context.resume).not.toHaveBeenCalled(); target.dispatchEvent(new Event('keydown')); expect(context.resume).toHaveBeenCalledOnce();
  transport.apply({ bgm: 'quiet', requests: [{ kind: 'bgm', id: 'quiet', fade: 0.2 }, { kind: 'sfx', id: 'get' }] });
  expect(sources.map(s => s.loop)).toEqual([true, false]); expect(gains[0]!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 1.2);
  transport.apply({ bgm: null, requests: [{ kind: 'bgm', id: null, fade: 0.3 }] }); expect(sources[0]!.stop).toHaveBeenCalledWith(1.3);
  visibility.hidden = true; visibility.dispatchEvent(new Event('visibilitychange')); expect(context.suspend).toHaveBeenCalledTimes(2);
  transport.dispose(); transport.dispose(); expect(context.close).toHaveBeenCalledOnce(); sources.forEach(s => expect(s.stop).toHaveBeenCalled());
  target.dispatchEvent(new Event('keydown')); expect(context.resume).toHaveBeenCalledOnce();
});

it('exported strict union command branches include cmd and reject conflicting id/stop variants', () => {
  const catalog = builtinCatalog(), schema = namedCommand('bgm', catalog.get('bgm')!.args);
  expect(Value.Check(schema, { cmd: 'bgm', id: 'quiet' })).toBe(true);
  expect(Value.Check(schema, { cmd: 'bgm', stop: true, fade: 1 })).toBe(true);
  expect(Value.Check(schema, { cmd: 'bgm', id: 'quiet', stop: true })).toBe(false);
  expect(Value.Check(schema, { cmd: 'sfx', id: 'quiet' })).toBe(false);
  const output = packSchemas(catalog).get('events.schema.json') as { $defs: { Command: { anyOf: unknown[] } } };
  for (const branch of schema.anyOf) expect(output.$defs.Command.anyOf).toContainEqual(JSON.parse(JSON.stringify(branch)));
});
