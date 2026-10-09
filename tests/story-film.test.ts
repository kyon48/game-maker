import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import { GameSession } from '../engine/sim/state/GameSession';
import { lintStories } from '../tools/story/lint';
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
  return { outputs, film, replay, pack: result.pack!, compilation, story: parsed.story };
}
describe('story film generation (one baseline, memory mutations)', () => {
  it('compiles base when, combines once, and keeps successor conditions independent', async () => {
    const text = baseline.replace('trigger=action character=elder', 'trigger=action character=elder once when=all(!met_elder,trust>=0)');
    const { compilation, pack } = await generate(text);
    const events = JSON.parse(compilation.files.get('maps/pier.events.json')!) as { events: { id: string; pages: { when?: unknown }[] }[] };
    const pages = events.events.find(e => e.id === 'elder')!.pages;
    expect(pages[0]?.when).toEqual({ all: [{ self: 'story_once', is: false }, { all: [{ flag: 'met_elder', is: false }, { var: 'trust', op: '>=', value: 0 }] }] });
    expect(pages[1]?.when).toEqual({ all: [{ self: 'story_once', is: true }, { flag: 'met_elder', is: true }] });
    const runtime = new GameSession(pack);
    runtime.game.state.setFlag('met_elder', true);
    runtime.game.state.setSelf('pier', 'elder', 'story_once', true);
    const elder = runtime.game.events.find(e => e.id === 'elder')!;
    elder.refresh(runtime.game.state);
    expect(elder.pageIndex).toBe(1);
    expect(elder.active).toBe(true);
  });
  it('parses spaced nested appearance conditions with following options', () => {
    const parsed = parseStory(baseline.replace('trigger=action character=elder', 'trigger=action when=all(!met_elder, trust >= 0) character=elder once'));
    expect(parsed.diagnostics).toEqual([]);
    const event = parsed.story.scenes.flatMap(s => s.items).find(e => e.kind === 'event' && e.id === 'elder');
    expect(event).toMatchObject({ character: 'elder', once: true, pages: [{ condition: { kind: 'all', conditions: [{ kind: 'flag', name: 'met_elder', enabled: false }, { kind: 'variable', name: 'trust', op: '>=', value: 0 }] } }, {}] });
  });
  it('makes an event inactive with no matching base or successor page', async () => {
    const { compilation, pack } = await generate(baseline.replace('trigger=action character=elder', 'trigger=action character=elder when=met_elder').replace('@film walkTo elder_spot\n', ''));
    const data = JSON.parse(compilation.files.get('maps/pier.events.json')!) as { events: { id: string; pages: { when?: unknown }[] }[] };
    expect(data.events.find(e => e.id === 'elder')!.pages[0]?.when).toEqual({ flag: 'met_elder', is: true });
    const runtime = new GameSession(pack);
    const elder = runtime.game.events.find(e => e.id === 'elder')!;
    expect(elder.active).toBe(false);
    expect(elder.pageIndex).toBe(-1);
    runtime.game.state.setFlag('met_elder', true); elder.refresh(runtime.game.state);
    expect(elder.active).toBe(true);
  });
  it('lints undeclared appearance flags/variables and rejects unsupported film values', () => {
    const parsed = parseStory(baseline.replace('trigger=action character=elder', 'trigger=action character=elder when=all(unknown_flag,unknown_var>=1)'), 'main.story.md');
    const diagnostics = lintStories([parsed.story]);
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'S002', level: 'error' }));
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'S003', level: 'error' }));
    expect(parseStory(baseline.replace('trigger=action character=elder', 'trigger=action character=elder film=other')).diagnostics).toContainEqual(expect.objectContaining({ code: 'S001' }));
  });
  it('keeps skipped events in the game while omitting visits/expect and warning about nested flag changes', async () => {
    const text = baseline.replace('@flag met_elder', '@flag background_seen\n@flag met_elder').replace('### 촌장의 열쇠 @ pier', '@event background at board character=sign film=skip\n  @if !met_elder\n    @set background_seen\n  @end\n  : 지나가는 배를 기다리고 있어요.\n@end\n\n### 촌장의 열쇠 @ pier');
    const { film, compilation, story, replay } = await generate(text);
    expect(compilation.files.get('maps/pier.events.json')).toContain('background_seen');
    expect(film.steps.some(s => 'walkTo' in s && 'event' in s.walkTo && s.walkTo.event === 'background')).toBe(false);
    expect(film.steps.some(s => 'expect' in s && 'flag' in s.expect && s.expect.flag === 'background_seen')).toBe(false);
    expect(replay.game.state.getFlag('background_seen')).toBe(false);
    expect(lintStories([story])).toContainEqual(expect.objectContaining({ code: 'S033', level: 'warning' }));
  });
  it('omits a skipped event even when an explicit hint points to it, and warns through common calls', async () => {
    const text = baseline.replace('trigger=action character=elder', 'trigger=action character=elder film=skip');
    const { film, story } = await generate(text);
    expect(film.steps.some(s => 'walkTo' in s && 'event' in s.walkTo && s.walkTo.event === 'elder')).toBe(false);
    expect(lintStories([story])).toContainEqual(expect.objectContaining({ code: 'S033', level: 'warning' }));
    const indirect = parseStory(text.replace('      @set met_elder', '      @call flag_change').replace('@common relight', '@common flag_change\n  @set met_elder\n@end\n\n@common relight')).story;
    expect(lintStories([indirect])).toContainEqual(expect.objectContaining({ code: 'S033', level: 'warning' }));
  });
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
  it('keeps a transferred destination auto choice in the next scene', async () => {
    const text = baseline.replace('@page when=met_elder', '  @go tower:entry\n@page when=met_elder').replace('trigger=action character=lamp', 'trigger=auto once character=lamp').replace('  @if met_elder\n    @call relight', '  ? 등대에 도착했다. 불을 켤까?\n    *> 불을 켠다\n      @set lamp_lit\n  @if met_elder\n    @call relight').replace('@page when=lamp_lit\n  : 심지는 고르게 타고 있다. 오른쪽 아래 금빛 문으로 나가면 마당이다.\n', '');
    const { film, replay } = await generate(text);
    const chapter = film.steps.findIndex(s => 'chapter' in s && s.chapter.startsWith('2장'));
    expect(film.steps.slice(0, chapter).filter(s => 'choose' in s)).toHaveLength(1);
    expect(film.steps.slice(chapter).filter(s => 'choose' in s)).toHaveLength(2);
    expect(replay.game.state.getFlag('lamp_lit')).toBe(true);
    expect(replay.game.state.getFlag('ending_public')).toBe(true);
  });
  it('emits only one consecutive walkTo for a hint and its event', async () => {
    const { film } = await generate();
    const visits = film.steps.filter(s => 'walkTo' in s && 'event' in s.walkTo && s.walkTo.event === 'elder');
    expect(visits).toHaveLength(1);
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

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
async function temporaryStoryPack() {
  const root = await mkdtemp(path.join(tmpdir(), 'story-review-')), folder = path.join(root, 'packs/lantern');
  await mkdir(path.join(folder, 'story'), { recursive: true });
  for (const file of ['game.json', 'characters.json', 'skin.json', 'CREDITS.md']) await writeFile(path.join(folder, file), await readFile(`packs/lantern/${file}`));
  await symlink(path.resolve('packs/lantern/assets'), path.join(folder, 'assets'));
  await writeFile(path.join(folder, 'story/main.story.md'), baseline);
  await writeFile(path.join(folder, 'story/tiles.json'), JSON.stringify(tiles));
  return { root, folder };
}
function storyCli(root: string, ...args: string[]) {
  return spawnSync(process.execPath, ['--import', createRequire(import.meta.url).resolve('tsx'), path.resolve('tools/story/index.ts'), ...args], { cwd: root, encoding: 'utf8' });
}
it('can regenerate owned films after deleting a declared/expected flag, with compile warning and check failure', async () => {
  const { root, folder } = await temporaryStoryPack();
  const original = baseline.replace('@flag met_elder', '@flag obsolete\n@flag met_elder').replace('      @set met_elder', '      @set obsolete\n      @set met_elder');
  const changed = original.replace('@flag obsolete\n', '').replace('      @set obsolete\n', '');
  try {
    await writeFile(path.join(folder, 'story/main.story.md'), original);
    expect(storyCli(root, 'build', 'lantern').status).toBe(0);
    expect(await readFile(path.join(folder, 'films/main.film.json'), 'utf8')).toContain('obsolete');
    await writeFile(path.join(folder, 'story/main.story.md'), changed);
    const compile = storyCli(root, 'compile', 'lantern');
    expect(compile.status, compile.stdout + compile.stderr).toBe(0);
    expect(compile.stdout).toContain('story film 필요');
    expect(storyCli(root, 'check', 'lantern').status).toBe(1);
    expect(storyCli(root, 'film', 'lantern').status).toBe(0);
    expect(await readFile(path.join(folder, 'films/main.film.json'), 'utf8')).not.toContain('obsolete');
    await writeFile(path.join(folder, 'story/main.story.md'), original);
    expect(storyCli(root, 'build', 'lantern').status).toBe(0);
    await writeFile(path.join(folder, 'story/main.story.md'), changed);
    const build = storyCli(root, 'build', 'lantern');
    expect(build.status, build.stdout + build.stderr).toBe(0);
    expect(await readFile(path.join(folder, 'films/main.film.json'), 'utf8')).not.toContain('obsolete');
    expect(await readFile(path.join(folder, 'tests/story_main.scenario.json'), 'utf8')).not.toContain('obsolete');
    await writeFile(path.join(folder, 'story/main.story.md'), original);
    expect(storyCli(root, 'build', 'lantern').status).toBe(0);
    await writeFile(path.join(folder, 'story/main.story.md'), changed);
    const directFilm = storyCli(root, 'film', 'lantern');
    expect(directFilm.status, directFilm.stdout + directFilm.stderr).toBe(0);
    expect(await readFile(path.join(folder, 'films/main.film.json'), 'utf8')).not.toContain('obsolete');
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);
it('still validates unowned films and story-named scenarios before regenerating', async () => {
  const { root, folder } = await temporaryStoryPack();
  try {
    expect(storyCli(root, 'build', 'lantern').status).toBe(0);
    await writeFile(path.join(folder, 'films/handwritten.film.json'), JSON.stringify({ name: 'handwritten', steps: [{ expect: { flag: 'undeclared', is: true } }] }));
    for (const command of ['compile', 'film', 'build']) {
      const result = storyCli(root, command, 'lantern');
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).toContain('V3');
      expect(result.stdout + result.stderr).toContain('handwritten.film.json');
    }
    await rm(path.join(folder, 'films/handwritten.film.json'));
    await writeFile(path.join(folder, 'tests/story_handwritten.scenario.json'), JSON.stringify({ name: 'handwritten', steps: [{ expect: { flag: 'undeclared', is: true } }] }));
    const result = storyCli(root, 'film', 'lantern');
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('handwritten');
    expect(result.stdout + result.stderr).toContain('Undeclared flag');
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);
