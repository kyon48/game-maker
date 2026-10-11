import { afterEach, expect, it, vi } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { PortraitsSchema, portraitFiles, portraitSlot, pngSize } from '../engine/data/portraits';
import { SkinSchema } from '../engine/data/schema/skin';
import { validatePack } from '../engine/data/validator/validate';
import { fixtureSource } from './fixtureSource';
import type { FixtureChange } from './fixtureSource';
import { builtinCatalog } from '../tools/catalog';
import { FsSource } from '../tools/fsSource';
import { MessageState } from '../engine/sim/ui/MessageState';
import { HeadlessTextMeasurer } from '../engine/sim/HeadlessTextMeasurer';
import { Game } from '../engine/sim/Game';
import { Presentation } from '../engine/platform/presentation';
import { drawPortrait } from '../engine/platform/renderer/portraits';
import type { Action, PluginModule } from '../engine/api';
import { PluginRuntime } from '../engine/sim/plugins/PluginRuntime';
import { Type } from '@sinclair/typebox';
const path = 'assets/portraits/hero/neutral.png';
const portraits = { hero: { neutral: path } };
const input = (key?: Action) => ({ held: new Set<Action>(), pressed: new Set<Action>(key ? [key] : []) });
const imageBytes = () => new FsSource('packs/demo').readBytes('assets/portraits/elder/neutral.png');
async function variant(command: object = { cmd: 'text', text: 'Hello', portrait: 'hero', expression: 'neutral' }, changes: FixtureChange[] = [], image: 'valid' | 'missing' | 'broken' = 'valid') {
  const base = await fixtureSource([
    { op: 'set', file: 'portraits.json', pointer: '', value: portraits },
    { op: 'set', file: 'common-events.json', pointer: '/hello/commands', value: [command] }, ...changes,
  ]);
  return validatePack({ ...base, exists: file => file === path ? Promise.resolve(image !== 'missing') : base.exists(file), readBytes: async () => image === 'broken' ? new Uint8Array([1, 2]) : imageBytes() }, 'base', { commands: builtinCatalog() });
}
it('accepts optional portrait schema and rejects invalid character IDs, paths and skin geometry', async () => {
  expect(Value.Check(PortraitsSchema, portraits)).toBe(true);
  expect(Value.Check(PortraitsSchema, { 'Bad ID': { neutral: path } })).toBe(false);
  expect(Value.Check(PortraitsSchema, { hero: { neutral: 'https://outside/face.png' } })).toBe(false);
  const skin = await new FsSource('tests/fixtures/base').readJson('skin.json') as object;
  expect(Value.Check(SkinSchema, { ...skin, portrait: { width: 56, gap: 4 } })).toBe(true);
  expect(Value.Check(SkinSchema, { ...skin, portrait: { width: 0 } })).toBe(false);
  expect(portraitSlot()).toEqual({ width: 56, gap: 4 });
  expect((await variant()).pack).toBeDefined();
});
it.each([
  [{ cmd: 'text', text: 'x', portrait: 'hero' }, 'V1'],
  [{ cmd: 'text', text: 'x', expression: 'neutral' }, 'V1'],
  [{ cmd: 'text', text: 'x', portrait: 'hero', expression: 'missing' }, 'V3'],
  [{ cmd: 'text', text: 'x', portrait: 'missing', expression: 'neutral' }, 'V3'],
] as const)('reports paired fields and unknown combinations: %j', async (command, code) => {
  const result = await variant(command); expect(result.pack).toBeUndefined();
  expect(result.diagnostics.some(d => d.code === code && d.file === 'common-events.json' && d.pointer.startsWith('/hello/commands/0'))).toBe(true);
});
it.each(['missing', 'broken'] as const)('rejects %s portrait files with V4 and exact pointer', async image => {
  const result = await variant(undefined, [], image);
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'V4', file: 'portraits.json', pointer: '/hero/neutral' }));
});
it('validates portrait character references and positive remaining message width', async () => {
  const unknown = await variant(undefined, [{ op: 'set', file: 'portraits.json', pointer: '', value: { stranger: { neutral: path } } }]);
  expect(unknown.diagnostics.some(d => d.code === 'V3' && d.pointer === '/stranger')).toBe(true);
  const wide = await variant(undefined, [{ op: 'set', file: 'skin.json', pointer: '/portrait', value: { width: 160 } }]);
  expect(wide.diagnostics.some(d => d.code === 'V9' && d.pointer === '/portrait')).toBe(true);
});
it('reads PNG dimensions without DOM, including offset buffers and invalid IHDR', async () => {
  const data = await imageBytes(); expect(pngSize(data)).toEqual({ width: 185, height: 191 });
  const offset = new Uint8Array(data.length + 3); offset.set(data, 3); expect(pngSize(offset.subarray(3))).toEqual(pngSize(data));
  const broken = data.slice(); broken[19] = broken[18] = broken[17] = broken[16] = 0;
  expect(() => pngSize(broken)).toThrow('dimensions'); expect(() => pngSize(data.subarray(0, 24))).toThrow();
});
it('keeps face-free wrapping and snapshots byte identical; faces only subtract slot and gap', () => {
  const create = (portrait?: { width: number; gap: number }) => new MessageState({ width: 100, rows: 3, charsPerTick: 999, portrait }, new HeadlessTextMeasurer(10));
  const plain = create(), configured = create({ width: 30, gap: 10 }), face = create({ width: 30, gap: 10 });
  const request = { text: '가나다라마바사아자차카타파하가나다라마', speaker: 'Hero' };
  plain.open(request); configured.open(request); face.open({ ...request, portrait: 'hero', expression: 'neutral' });
  plain.update(input()); configured.update(input()); face.update(input());
  expect(JSON.stringify(configured.snapshot)).toBe(JSON.stringify(plain.snapshot));
  expect(plain.snapshot).not.toHaveProperty('portrait');
  expect(face.snapshot).toMatchObject({ portrait: 'hero', expression: 'neutral', plainText: request.text });
  expect(face.snapshot!.lines[0]!.length).toBeLessThan(plain.snapshot!.lines[0]!.length);
  expect(face.snapshot!.pageCount).toBeGreaterThan(plain.snapshot!.pageCount);
  const replay = create({ width: 30, gap: 10 }); replay.open({ ...request, portrait: 'hero', expression: 'neutral' }); replay.update(input());
  expect(replay.snapshot).toEqual(face.snapshot);
});
it('plugin showText and headless Game retain portrait fields through the public API', async () => {
  const result = await variant({ cmd: 'x_portrait' });
  // Plugin args are validated with the registered catalog, then the same runtime registers handlers.
  const module: PluginModule = { id: 'portrait', apiVersion: 1, register(api) { api.commands.register('x_portrait', { args: Type.Object({}), parallelSafe: false, *run(_args, ctx) { yield* ctx.showText({ text: 'Hello', portrait: 'hero', expression: 'neutral' }); } }); } };
  const plugins = new PluginRuntime('0.10.0', [{ name: 'portrait', module }]);
  const source = await fixtureSource([{ op: 'set', file: 'maps/map.events.json', pointer: '/events/0/pages/0/commands', value: [{ cmd: 'x_portrait' }] }]);
  const pack = (await validatePack(source, 'base', plugins.validationOptions)).pack!;
  expect(result.pack).toBeUndefined(); // Unknown plugin commands remain validation errors without registration.
  const game = new Game(pack.game, pack.maps.get('map')!, pack.characters, pack.events.get('map')!, { plugins, skin: pack.skin });
  // Open via an actual action event in the base fixture.
  const event = game.events[0]!; game.player.place(event.x - 1, event.y, 'right');
  game.tick(input('ok')); game.tick(input());
  expect(game.snapshot.message).toMatchObject({ portrait: 'hero', expression: 'neutral', textOrigin: 'plugin' });
});
it('preload inventory is sorted and deduplicates shared expressions and characters', () => {
  expect(portraitFiles({ hero: { neutral: 'a', smile: 'b' }, other: { neutral: 'a' } })).toEqual(['a', 'b']);
});
afterEach(() => vi.unstubAllGlobals());
it('composes pixel and HD canvases in-browser at 1080p with integer scaling and centered padding', () => {
  const calls: unknown[][] = [];
  const context = { canvas: { width: 1920, height: 1080 }, fillRect: (...args: unknown[]) => calls.push(['fill', ...args]), drawImage: (...args: unknown[]) => calls.push(['draw', ...args]) };
  const hdContext = {};
  vi.stubGlobal('document', { createElement: (tag: string) => tag === 'div' ? { append() {}, style: {} } : { getContext: () => hdContext } });
  const pixel = { width: 320, height: 240 } as HTMLCanvasElement;
  const presentation = new Presentation(pixel);
  presentation.composite(context as unknown as CanvasRenderingContext2D);
  expect(calls).toEqual([['fill', 0, 0, 1920, 1080], ['draw', pixel, 320, 60, 1280, 960], ['draw', presentation.hd, 320, 60, 1280, 960]]);
  expect(context).toMatchObject({ imageSmoothingEnabled: true });
  expect(() => presentation.composite({ ...context, canvas: { width: 100, height: 100 } } as unknown as CanvasRenderingContext2D)).toThrow('exceeds');
});
it('HD draws the original image smoothly within the left slot and clears absent portraits', async () => {
  const skin = await new FsSource('packs/demo').readJson('skin.json') as import('../engine/data/skin').Skin;
  const calls: unknown[][] = [];
  const context = { canvas: { width: 1280, height: 960 }, clearRect: vi.fn(), save() {}, restore() {}, scale: vi.fn(), drawImage: (...args: unknown[]) => calls.push(args) } as unknown as CanvasRenderingContext2D;
  const image = { naturalWidth: 185, naturalHeight: 191 } as HTMLImageElement;
  const state = new MessageState({ width: 300, rows: 3, charsPerTick: 1 }, new HeadlessTextMeasurer(12));
  state.open({ text: 'Hello', speaker: 'Hero', portrait: 'hero', expression: 'neutral' });
  drawPortrait(context, state.snapshot, skin, portraits, new Map([[path, image]]), 320, 240);
  expect(context.scale).toHaveBeenCalledWith(4, 4); expect(context.imageSmoothingEnabled).toBe(true);
  expect(calls[0]![0]).toBe(image); expect(calls[0]![3]).toBe(56);
  drawPortrait(context, null, skin, portraits, new Map(), 320, 240);
  expect(calls).toHaveLength(1); expect(context.clearRect).toHaveBeenCalledTimes(2);
});
