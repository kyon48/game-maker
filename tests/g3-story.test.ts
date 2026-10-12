import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { Type } from '@sinclair/typebox';
import { parseStory } from '../tools/story/parser';
import { lintStories } from '../tools/story/lint';
import { compileStories } from '../tools/story/compile';
import { generateFilm } from '../tools/story/film';
import { PluginRuntime } from '../engine/sim/plugins/PluginRuntime';
import { FsSource } from '../tools/fsSource';
import { validatePack } from '../engine/data/validator/validate';
import { rehearse, asFilm } from '../tools/film/rehearse';
import { runScenario } from '../engine/data/scenarios/run';
import { scenarioGameWithPlugins } from '../tools/scenarioGame';
const legend = new Set(Object.keys(JSON.parse(await readFile('packs/lantern/story/tiles.json','utf8')).legend));
const baseline = (await readFile('packs/lantern/story/main.story.md', 'utf8')).replace(/ voice=[^\s]+/g, '');
const game = JSON.parse(await readFile('packs/lantern/game.json', 'utf8')) as unknown;
const tiles = JSON.parse(await readFile('packs/lantern/story/tiles.json', 'utf8')) as unknown;
async function prepare(text: string) {
  const parsed = parseStory(text, 'main.story.md'); expect(parsed.diagnostics).toEqual([]);
  const compilation = compileStories([parsed.story], game, tiles);
  const fs = new FsSource('packs/lantern');
  const runtime = new PluginRuntime('0.12.0', [{ name: 'puzzle', module: { id: 'puzzle', apiVersion: 1, register(api) {
    api.scenes.register('x_puzzle', { args: Type.Object({}), init: () => 0, update: (s, input) => input.pressed.has('ok') ? { done: 8 } : s, view: () => [] });
  } } }]);
  const source = { readBytes: fs.readBytes.bind(fs), readJson: async (file: string) => compilation.files.has(file) ? JSON.parse(compilation.files.get(file)!) as unknown : fs.readJson(file), exists: async (file: string) => !['voices.json', 'voice-manifest.json'].includes(file) && (compilation.files.has(file) || await fs.exists(file)), listFiles: async () => [...new Set([...(await fs.listFiles()).filter(f => !/^films\/|^tests\//.test(f)), ...compilation.files.keys()])] };
  const result = await validatePack(source, 'lantern', runtime.validationOptions); expect(result.pack).toBeDefined();
  return { compilation, story: parsed.story, pack: result.pack!, runtime };
}
it('parses scene JSON and return var, lints undeclared vars and malformed JSON, compiles without losing fields', () => {
  const text = baseline.replace('  @cmd {"cmd":"save"}', '  @scene ending {"title":"끝","lines":["기록"]} -> trust');
  const parsed = parseStory(text, 'main.story.md'); expect(parsed.diagnostics).toEqual([]);
  expect(lintStories([parsed.story], { legend }).filter(d => d.level === 'error')).toEqual([]);
  const compiled = compileStories([parsed.story], game, tiles);
  expect(compiled.files.get('maps/pier.events.json')).toContain('"resultVar": "trust"');
  expect(lintStories([parseStory(text.replace('-> trust', '-> undeclared'), 'main.story.md').story]).some(d => d.code === 'S003')).toBe(true);
  expect(parseStory(text.replace('{"title":"끝","lines":["기록"]}', '{broken}'), 'main.story.md').diagnostics.some(d => d.code === 'S001')).toBe(true);
});
it('ending film stops with the screen still open, does not select restart, keeps expected flags and is byte deterministic', async () => {
  const { story, pack, runtime } = await prepare(baseline);
  const first = await generateFilm([story], pack, runtime), second = await generateFilm([story], pack, runtime);
  expect(first).toEqual(second);
  const film = asFilm(JSON.parse(first.get('films/main.film.json')!) as unknown);
  expect(film.steps.some(s => 'waitFor' in s && s.waitFor === 'scene')).toBe(true);
  const replay = await rehearse(pack, film, runtime);
  expect(replay.game.snapshot.scenes.at(-1)?.name).toBe('ending'); expect(replay.game.snapshot.sceneResult).toBeNull();
  expect(replay.game.state.getFlag('ending_public')).toBe(true);
  await runScenario(pack, JSON.parse(first.get('tests/story_main.scenario.json')!) as unknown, scenarioGameWithPlugins(runtime));
  const alternate = await prepare(baseline.replace('*> 마을 사람들과 함께 지킨다', '* 마을 사람들과 함께 지킨다').replace('* 당분간 소라가 남아 지킨다', '*> 당분간 소라가 남아 지킨다'));
  const other = await generateFilm([alternate.story], alternate.pack, alternate.runtime);
  const ending = await rehearse(alternate.pack, asFilm(JSON.parse(other.get('films/main.film.json')!) as unknown), alternate.runtime);
  expect(ending.game.state.getFlag('ending_kept')).toBe(true);
  expect((ending.game.snapshot.scenes.at(-1)?.state as { title: string }).title).toBe('오래 지키는 불');
});
it('plugin scene requires an immediate film press hint and the same hinted result replays in film and scenario', async () => {
  const text = baseline.replace('  @cmd {"cmd":"save"}', '  @scene x_puzzle {} -> trust\n  @film press ok');
  const { story, pack, runtime } = await prepare(text);
  const first = await generateFilm([story], pack, runtime);
  const replay = await rehearse(pack, asFilm(JSON.parse(first.get('films/main.film.json')!) as unknown), runtime);
  expect(replay.game.state.getVar('trust')).toBe(8);
  await runScenario(pack, JSON.parse(first.get('tests/story_main.scenario.json')!) as unknown, scenarioGameWithPlugins(runtime));
  const bad = await prepare(text.replace('  @film press ok\n', ''));
  await expect(generateFilm([bad.story], bad.pack, bad.runtime)).rejects.toMatchObject({ diagnostic: { code: 'S042' } });
});

it('ending ignores commands and expected flag mutations after the terminal scene', async () => {
  const text = baseline.replace('@scene ending {"title":"함께 켜는 불","lines":["여러 사람의 약속이 등대를 지킨다."]}', '@scene ending {"title":"함께 켜는 불","lines":["여러 사람의 약속이 등대를 지킨다."]}\n    @unset met_elder');
  const { story, pack, runtime } = await prepare(text);
  const outputs = await generateFilm([story], pack, runtime);
  const replay = await rehearse(pack, asFilm(JSON.parse(outputs.get('films/main.film.json')!) as unknown), runtime);
  expect(replay.game.state.getFlag('met_elder')).toBe(true);
});
