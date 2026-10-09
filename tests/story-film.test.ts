import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import { parseStory } from '../tools/story/parser';
import { compileStories } from '../tools/story/compile';
import { planFilm } from '../tools/story/film-project';
import { asFilm, rehearse } from '../tools/film/rehearse';
import { FsSource } from '../tools/fsSource';
import { validatePack } from '../engine/data/validator/validate';
import { nodePluginRuntime } from '../tools/loadPlugins';
import { runScenario } from '../engine/data/scenarios/run';
import { scenarioGameWithPlugins } from '../tools/scenarioGame';
import type { PackSource } from '../engine/api';
const baseline = await readFile('packs/lantern/story/main.story.md', 'utf8');
const game = JSON.parse(await readFile('packs/lantern/game.json', 'utf8')) as unknown;
const tiles = JSON.parse(await readFile('packs/lantern/story/tiles.json', 'utf8')) as unknown;
async function generate(text = baseline) {
  const parsed = parseStory(text, 'main.story.md');
  expect(parsed.diagnostics.filter(d => d.level === 'error')).toEqual([]);
  const compilation = compileStories([parsed.story], game, tiles);
  const outputs = await planFilm('lantern', process.cwd(), compilation.files, [parsed.story], 'main');
  const fs = new FsSource('packs/lantern');
  const source: PackSource = { readJson: async f => compilation.files.has(f) ? JSON.parse(compilation.files.get(f)!) as unknown : fs.readJson(f), exists: async f => compilation.files.has(f) || await fs.exists(f), listFiles: async () => [...new Set([...(await fs.listFiles()).filter(f => !/^films\/|^tests\//.test(f)), ...compilation.files.keys()])] };
  const plugins = await nodePluginRuntime(source, fs.root);
  const result = await validatePack(source, 'lantern', plugins.validationOptions);
  expect(result.pack).toBeDefined();
  const film = asFilm(JSON.parse(outputs.get('films/main.film.json')!) as unknown);
  const replay = await rehearse(result.pack!, film, plugins);
  await runScenario(result.pack!, JSON.parse(outputs.get('tests/story_main.scenario.json')!) as unknown, scenarioGameWithPlugins(await nodePluginRuntime(source, fs.root)));
  return { outputs, film, replay };
}
describe('story film generation (one baseline, memory mutations)', () => {
  it('crosses doors in both directions across three maps, then saves', async () => {
    const { film, replay } = await generate();
    const doors = film.steps.filter(s => 'walk' in s);
    expect(doors).toEqual([{ walk: ['right'] }, { walk: ['right'] }, { walk: ['left'] }, { walk: ['left'] }]);
    expect(replay.game.map.id).toBe('pier');
    expect(replay.game.state.getFlag('ending_public')).toBe(true);
  });
  it('measures a fade/wait prefix rather than guessing a pause', async () => {
    const { film } = await generate(baseline.replace('@fade black 12', '@fade black 47').replace('@wait 12', '@wait 29'));
    expect(film.steps.some(s => 'wait' in s && s.wait >= 88)).toBe(true);
  });
  it('waits for startup auto with a fade prefix', async () => {
    const { film } = await generate(baseline.replace('  : 등대지기의 약속', '  @fade black 17\n  @wait 23\n  @fade clear 17\n  : 등대지기의 약속'));
    const firstAdvance = film.steps.findIndex(s => 'advanceText' in s);
    expect(film.steps.slice(0, firstAdvance).some(s => 'wait' in s && s.wait > 1)).toBe(true);
  });
  it('handles an auto scene immediately after transfer without settling on its open message', async () => {
    const text = baseline.replace('trigger=action character=lamp', 'trigger=auto once character=lamp').replace('@page when=lamp_lit\n  : 심지는 고르게 타고 있다. 오른쪽 아래 금빛 문으로 나가면 마당이다.\n', '');
    const { replay } = await generate(text);
    expect(replay.game.state.getFlag('lamp_lit')).toBe(true);
  });
  it('defaults an unmarked choice to the first option', async () => {
    const { film } = await generate(baseline.replaceAll('*>', '*'));
    expect(film.steps.filter(s => 'choose' in s)).toEqual([{ choose: 0, dwell: 0.4 }, { choose: 0, dwell: 0.4 }]);
  });
  it('uses the marked alternate ending and tests that complete route', async () => {
    const text = baseline.replace('      *> 마을 사람들과 함께 지킨다', '      * 마을 사람들과 함께 지킨다').replace('      * 당분간 소라가 남아 지킨다', '      *> 당분간 소라가 남아 지킨다');
    const { film, replay } = await generate(text);
    expect(film.steps.filter(s => 'choose' in s)).toEqual([{ choose: 0, dwell: 0.4 }, { choose: 1, dwell: 0.4 }]);
    expect(replay.game.state.getFlag('ending_kept')).toBe(true);
    expect(replay.game.state.getFlag('ending_public')).toBe(false);
  });
  it('emits flags at their scene boundary and again as final scenario assertions', async () => {
    const { film, outputs } = await generate();
    const flag = film.steps.findIndex(s => 'expect' in s && 'flag' in s.expect && s.expect.flag === 'met_elder');
    const chapter = film.steps.findIndex(s => 'chapter' in s && s.chapter.startsWith('2장'));
    expect(flag).toBeLessThan(chapter);
    const scenario = JSON.parse(outputs.get('tests/story_main.scenario.json')!) as { steps: unknown[] };
    expect(scenario.steps.at(-2)).toEqual({ expect: { flag: 'ending_public', is: true } });
  });
  it('honors scene pause/walk hints and preserves narration order', async () => {
    const { film, outputs } = await generate(baseline.replace('@film walkTo elder_spot', '@film pause 1.25\n@film walkTo elder_spot'));
    expect(film.steps).toContainEqual({ pause: 1.25 });
    expect(film.steps).toContainEqual({ walkTo: { event: 'elder' } });
    const narration = outputs.get('films/main.narration.md')!;
    expect(narration.indexOf('소라는')).toBeLessThan(narration.indexOf('불을 켜는 일'));
    expect(narration).not.toContain('나레이션 재생');
  });
  it('is byte identical on two independent rehearsals', async () => {
    expect([...(await generate()).outputs]).toEqual([...(await generate()).outputs]);
  });
});

import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { filmPack } from '../tools/story/film-project';
import { compilePack } from '../tools/story/project';
it('tracks film/narration/scenario ownership, detects edits and check differences, and supports force', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'story-film-'));
  const folder = path.join(root, 'packs/lantern');
  try {
    await mkdir(path.join(folder, 'story'), { recursive: true });
    for (const file of ['game.json', 'characters.json', 'skin.json', 'CREDITS.md']) await writeFile(path.join(folder, file), await readFile(`packs/lantern/${file}`));
    await symlink(path.resolve('packs/lantern/assets'), path.join(folder, 'assets'));
    await writeFile(path.join(folder, 'story/main.story.md'), baseline);
    await writeFile(path.join(folder, 'story/tiles.json'), JSON.stringify(tiles));
    expect((await compilePack('lantern', root)).filter(d => d.level === 'error')).toEqual([]);
    expect((await filmPack('lantern', root)).filter(d => d.level === 'error')).toEqual([]);
    const file = path.join(folder, 'films/main.narration.md'), original = await readFile(file, 'utf8');
    await writeFile(file, 'manual edit\n');
    expect(await filmPack('lantern', root)).toContainEqual(expect.objectContaining({ code: 'S025' }));
    expect(await compilePack('lantern', root, { check: true })).toContainEqual(expect.objectContaining({ code: 'S029' }));
    expect((await filmPack('lantern', root, 'main', true)).filter(d => d.level === 'error')).toEqual([]);
    expect(await readFile(file, 'utf8')).toBe(original);
    const before = await readFile(path.join(folder, 'story/.compiled.json'), 'utf8');
    expect((await compilePack('lantern', root)).filter(d => d.level === 'error')).toEqual([]);
    expect(await readFile(path.join(folder, 'story/.compiled.json'), 'utf8')).toBe(before);
    await writeFile(path.join(folder, 'story/main.story.md'), baseline.replace('> 소라는', '> 이제 소라는'));
    expect(await compilePack('lantern', root, { check: true })).toContainEqual(expect.objectContaining({ code: 'S029', file: 'packs/lantern/films/main.narration.md' }));
  } finally { await rm(root, { recursive: true, force: true }); }
});
