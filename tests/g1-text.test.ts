import { describe, expect, it } from 'vitest';
import { Type } from '@sinclair/typebox';
import { parseText, resolveText, plainText, TextSyntaxError } from '../engine/data/text';
import { MessageState } from '../engine/sim/ui/MessageState';
import { ChoiceState } from '../engine/sim/ui/ChoiceState';
import { HeadlessTextMeasurer } from '../engine/sim/HeadlessTextMeasurer';
import { PluginRuntime } from '../engine/sim/plugins/PluginRuntime';
import { GameState } from '../engine/sim/state/GameState';
import type { PluginModule, Action } from '../engine/api';
import { fixtureSource } from './fixtureSource';
import { validatePack } from '../engine/data/validator/validate';
import { builtinCatalog } from '../tools/catalog';
import { parseStory } from '../tools/story/parser';
import { lintStories } from '../tools/story/lint';
import { compileStories } from '../tools/story/compile';
import { readFile } from 'node:fs/promises';
import { FsSource } from '../tools/fsSource';
import { nodePluginRuntime } from '../tools/loadPlugins';
import { asFilm, rehearse } from '../tools/film/rehearse';
const empty = (pressed?: Action) => ({ held: new Set<Action>(), pressed: new Set<Action>(pressed ? [pressed] : []) });
const resolver = { variable: () => '12', plugin: () => '단서', color: (name: string) => name === 'accent' };
const create = (text: string, rate = 1, width = 120, rows = 2) => {
  const state = new MessageState({ width, rows, charsPerTick: rate }, new HeadlessTextMeasurer(12), resolver);
  state.open({ text }); return state;
};
describe('G1 text syntax and fixed-tick reveal', () => {
  it('resolves all syntax, escapes, style and plain TTS text in one path', () => {
    const text = '{{{var:n}}} {plugin:x_test}{color:accent}가{wait:3}{speed:2}나{color}끝';
    const result = resolveText(text, resolver);
    expect(result.plainText).toBe('{12} 단서가나끝');
    expect(plainText(text, resolver)).toBe(result.plainText);
    expect(result.segments.find(s => s.text === '가')).toMatchObject({ color: 'accent', speed: 1, wait: 0 });
    expect(result.segments.find(s => s.text === '나')).toMatchObject({ color: 'accent', speed: 2, wait: 3 });
    expect(result.segments.at(-1)).toMatchObject({ color: undefined, speed: 2 });
    expect(resolveText('{var:n}', { variable: () => '{wait:99}', plugin: () => '' }).plainText).toBe('{wait:99}');
  });
  it.each(['{bad:x}', '{var:}', '{plugin:plain}', '{wait:-1}', '{wait:1.5}', '{wait:9007199254740992}', '{speed:0}', '{speed:NaN}', '{speed:Infinity}', '{color:}', '{oops', '}'])('rejects %s with the original offset', token => {
    try { parseText(`😀a${token}`); throw new Error('expected syntax error'); }
    catch (error) { expect(error).toBeInstanceOf(TextSyntaxError); expect((error as TextSyntaxError).offset).toBe(3); }
  });
  it('excludes controls from wrap width, including long words and page boundaries', () => {
    const state = create('{color:accent}가{wait:2}😀{speed:2}나다', 1, 24, 1);
    state.update(empty('ok')); expect(state.snapshot?.lines).toEqual(['가😀']);
    expect(state.snapshot?.pageCount).toBe(2);
    state.update(empty('ok')); state.update(empty('ok')); expect(state.snapshot?.lines).toEqual(['나다']);
    expect(state.snapshot?.segments[0]?.[0]?.color).toBe('accent');
  });
  it('wait blocks exactly its ticks; fractional and changed speeds use deterministic tick budgets', () => {
    const state = create('A{wait:2}B{speed:2}CD{speed:0.5}E');
    const frames = Array.from({ length: 7 }, () => { state.update(empty()); return state.snapshot?.lines[0]; });
    expect(frames).toEqual(['A', 'A', 'A', 'AB', 'ABCD', 'ABCD', 'ABCDE']);
    const second = create('A{wait:2}B{speed:2}CD{speed:0.5}E');
    expect(Array.from({ length: 7 }, () => { second.update(empty()); return second.snapshot?.lines[0]; })).toEqual(frames);
  });
  it('fast reveal skips leading and trailing waits, while natural reveal honors trailing wait', () => {
    const state = create('{wait:99}AB{wait:99}'); state.update(empty('ok'));
    expect(state.snapshot?.fullyShown).toBe(true); expect(state.snapshot?.lines).toEqual(['AB']);
    state.update(empty('ok')); expect(state.opened).toBe(false);
    const trailing = create('A{wait:2}'); trailing.update(empty());
    expect(trailing.snapshot?.fullyShown).toBe(false);
    trailing.update(empty()); expect(trailing.snapshot?.fullyShown).toBe(false);
    trailing.update(empty()); expect(trailing.snapshot?.fullyShown).toBe(true);
  });
  it('freezes variable values at message/choice open and only formats once', () => {
    let value = '1', calls = 0;
    const r = { variable: () => { calls++; return value; }, plugin: () => '' };
    const state = new MessageState({ width: 100, rows: 2, charsPerTick: 1 }, new HeadlessTextMeasurer(12), r);
    state.open({ text: '{var:n}', speaker: '화자 {var:n}' }); value = '9'; state.update(empty());
    expect(state.snapshot).toMatchObject({ text: '1', plainText: '1', speaker: '화자 1' }); expect(calls).toBe(2);
    const choice = new ChoiceState(text => plainText(text, r, false)); choice.open({ prompt: '{var:n}', labels: ['{{{var:n}}}'], cancelIndex: null });
    value = '5'; expect(choice.snapshot).toMatchObject({ prompt: '9', options: [{ label: '{9}' }] });
  });
  it.each(['{wait:1}', '{color:accent}', '{color}', '{speed:2}'])('restricts choice and speaker control %s at runtime', text => {
    expect(() => new ChoiceState().open({ prompt: text, labels: ['ok'], cancelIndex: null })).toThrow('only allowed');
    const state = new MessageState({ width: 100, rows: 1, charsPerTick: 1 }, new HeadlessTextMeasurer(12), resolver);
    expect(() => state.open({ text: 'body', speaker: text })).toThrow('only allowed');
  });
});
const plugin = (register: PluginModule['register']): PluginModule => ({ id: 'text_test', apiVersion: 1, register });
it('registers pure plugin formatters using frozen readonly state; duplicates/names/return types/args fail', () => {
  const register: PluginModule['register'] = api => api.text.register('x_count', { args: Type.Object({}, { additionalProperties: false }), format: (_args, state) => { expect(Object.isFrozen(state)).toBe(true); expect('setVar' in state).toBe(false); return String(state.getVar('n')); } });
  const runtime = new PluginRuntime('0.6.0', [{ name: 'text_test', module: plugin(register) }]);
  expect(runtime.format('x_count', {}, new GameState({ flags: {}, vars: { n: 7 } }))).toBe('7');
  expect(() => runtime.format('x_missing', {}, new GameState({ flags: {}, vars: {} }))).toThrow('Unknown plugin text');
  expect(() => runtime.format('x_count', { extra: true }, new GameState({ flags: {}, vars: {} }))).toThrow('Invalid text arguments');
  expect(() => new PluginRuntime('0.6.0', [{ name: 'text_test', module: plugin(api => { register(api); register(api); }) }])).toThrow('Duplicate text');
  expect(() => new PluginRuntime('0.6.0', [{ name: 'text_test', module: plugin(api => api.text.register('plain' as 'x_plain', { args: Type.Object({}), format: () => '' })) }])).toThrow('Invalid plugin registration');
  const bad = new PluginRuntime('0.6.0', [{ name: 'text_test', module: plugin(api => api.text.register('x_bad', { args: Type.Object({}), format: () => 3 as unknown as string })) }]);
  expect(() => bad.format('x_bad', {}, new GameState({ flags: {}, vars: {} }))).toThrow('must return string');
});
it.each([
  ['{var:missing}', 'V3'], ['{plugin:x_missing}', 'V3'], ['{color:missing}', 'V3'],
  ['{unknown:x}', 'V1'], ['{wait:-1}', 'V1'], ['{speed:0}', 'V1'], ['{var:missing', 'V1'], ['literal { bracket', 'V1'],
])('validates body %s with %s and a JSON field pointer', async (text, code) => {
  const source = await fixtureSource([{ op: 'set', file: 'common-events.json', pointer: '/hello/commands', value: [{ cmd: 'text', text }] }]);
  const result = await validatePack(source, 'base', { commands: builtinCatalog() });
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ code, file: 'common-events.json', pointer: '/hello/commands/0/text', level: 'error' }));
});
it.each(['speaker', 'prompt', 'label'])('validates the restricted %s field', async field => {
  const command = field === 'speaker' ? { cmd: 'text', text: 'ok', speaker: '{wait:1}' } : { cmd: 'choice', prompt: field === 'prompt' ? '{wait:1}' : 'ok', options: [{ label: field === 'label' ? '{wait:1}' : 'ok', commands: [] }] };
  const result = await validatePack(await fixtureSource([{ op: 'set', file: 'common-events.json', pointer: '/hello/commands', value: [command] }]), 'base', { commands: builtinCatalog() });
  expect(result.diagnostics.some(d => d.code === 'V1' && d.pointer.endsWith(field === 'label' ? '/label' : '/' + field))).toBe(true);
});
it('validates plugin empty-args schemas and custom palette colors', async () => {
  const source = await fixtureSource([{ op: 'set', file: 'common-events.json', pointer: '/hello/commands', value: [{ cmd: 'text', text: '{plugin:x_test}{color:accent}ok{color:mapNameText}name{color}' }] }, { op: 'set', file: 'skin.json', pointer: '/colors/accent', value: '#ffaa00' }, { op: 'set', file: 'skin.json', pointer: '/colors/mapNameText', value: '#ffffff' }]);
  const good = await validatePack(source, 'base', { commands: builtinCatalog(), text: new Map([['x_test', Type.Object({}, { additionalProperties: false })]]) });
  expect(good.pack).toBeDefined();
  const bad = await validatePack(source, 'base', { commands: builtinCatalog(), text: new Map([['x_test', Type.Object({ n: Type.Integer() })]]) });
  expect(bad.diagnostics.some(d => d.code === 'V1' && d.pointer.includes('/text'))).toBe(true);
});
it('preserves story text expressions in commands and lints undeclared variables with S003', async () => {
  const baseline = await readFile('packs/lantern/story/main.story.md', 'utf8');
  const story = parseStory(baseline).story;
  const compilation = compileStories([story], await new FsSource('packs/lantern').readJson('game.json'), await new FsSource('packs/lantern').readJson('story/tiles.json'));
  expect(compilation.files.get('maps/pier.events.json')).toContain('{var:trust}');
  const variant = parseStory(baseline.replace('{var:trust}', '{var:missing}')).story;
  expect(lintStories([variant])).toContainEqual(expect.objectContaining({ code: 'S003' }));
});
it('manor truth records resolved TTS plain text with its clue count', async () => {
  const source = new FsSource('packs/manor'), plugins = await nodePluginRuntime(source, source.root);
  const pack = (await validatePack(source, 'manor', plugins.validationOptions)).pack!;
  const result = await rehearse(pack, asFilm(await source.readJson('films/truth.film.json')), plugins);
  expect(result.events).toContainEqual(expect.objectContaining({ type: 'text-start', plainText: expect.stringContaining('단서 5/5') }));
  expect(result.events.some(e => 'plainText' in e && e.plainText.includes('{plugin:'))).toBe(false);
});

import { drawUi } from '../engine/platform/renderer/ui';
import type { Skin } from '../engine/data/skin';
it('platform renders palette names and reset with visible-text positions', () => {
  const message = create('A{color:accent}B{color}C'); message.update(empty('ok'));
  const runs: { text: string; x: number; color: string }[] = [];
  const context = { canvas: { width: 120, height: 80 }, fillStyle: '', save() {}, restore() {}, fillRect() {}, strokeRect() {},
    measureText: (text: string) => ({ width: [...text].length * 6 }),
    fillText: (text: string, x: number) => runs.push({ text, x, color: context.fillStyle }),
  };
  const colors = { text: '#ffffff', speaker: '#cccccc', cursor: '#ffffff', fade: '#000000', accent: '#ff0000' };
  const skin: Skin = { font: { family: 'test', src: 'test.woff2', size: 12, lineHeight: 14 }, window: { slice: 1, padding: 4 }, colors, message: { rows: 2, charsPerTick: 1 } };
  drawUi(context as unknown as CanvasRenderingContext2D, { message: message.snapshot, choice: null }, skin, new Map());
  expect(runs).toEqual([{ text: 'A', x: 4, color: '#ffffff' }, { text: 'B', x: 10, color: '#ff0000' }, { text: 'C', x: 16, color: '#ffffff' }]);
});
