import { expect, it } from 'vitest';
import { readFile, mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseStory } from '../tools/story/parser';
import { lintStories } from '../tools/story/lint';
import { parseStoryConfig, storyVoices } from '../tools/story/config';
import { compileStories, jsonBytes } from '../tools/story/compile';
import { checkGeneratedFilms } from '../tools/story/film-project';
import { generateFilm } from '../tools/story/film';
import { prepareCompilation, compilePack } from '../tools/story/project';
import { FsSource } from '../tools/fsSource';
import { validatePack } from '../engine/data/validator/validate';
import { PluginRuntime } from '../engine/sim/plugins/PluginRuntime';
import { GameSession } from '../engine/sim/state/GameSession';
import { FilmCueGate } from '../engine/film/cues';
import { asFilm, rehearse } from '../tools/film/rehearse';
import { extractFilm } from '../tools/tts/extract';
import { fake, wavFrames } from '../tools/tts/provider';
import { voiceKey } from '../engine/data/voice';
import { runScenario } from '../engine/data/scenarios/run';
import { scenarioGame } from '../tools/scenarioGame';
import type { PackSource } from '../engine/api';
const baseline = await readFile('packs/lantern/story/main.story.md', 'utf8');
const game = JSON.parse(await readFile('packs/lantern/game.json', 'utf8')) as unknown;
const tiles = JSON.parse(await readFile('packs/lantern/story/tiles.json', 'utf8')) as unknown;
const config = parseStoryConfig(JSON.parse(await readFile('packs/lantern/story/story.config.json', 'utf8')));
config.voices = Object.fromEntries(Object.entries(config.voices!).map(([key, voice]) => [key, { ...voice, provider: 'fake' }]));
async function prepare(text = baseline, voiced = true) {
  const { story, diagnostics } = parseStory(text, 'main.story.md'); expect(diagnostics).toEqual([]);
  const compiled = compileStories([story], game, tiles), voices = storyVoices([story], config)!;
  if (voiced) compiled.files.set('voices.json', jsonBytes(voices));
  const fs = new FsSource('packs/lantern');
  const source: PackSource = {
    readJson: async file => file === 'voices.json' ? voices : compiled.files.has(file) ? JSON.parse(compiled.files.get(file)!) as unknown : fs.readJson(file),
    exists: async file => file === 'voices.json' ? voiced : compiled.files.has(file) || await fs.exists(file),
    listFiles: async () => [...new Set([...(await fs.listFiles()).filter(f => !/^films\/|^tests\//.test(f)), ...compiled.files.keys()])],
  };
  const plugins = new PluginRuntime('0.9.0');
  const pack = (await validatePack(source, 'lantern', plugins.validationOptions)).pack!;
  expect(pack).toBeDefined();
  return { story, compiled, voices, pack, plugins };
}
async function generate(text = baseline, voiced = true, lengthMultiplier = 1) {
  const data = await prepare(text, voiced);
  const outputs = await generateFilm([data.story], data.pack, data.plugins);
  const film = asFilm(JSON.parse(outputs.get('films/main.film.json')!));
  data.pack.voiceManifest = {};
  if (voiced) for (const utterance of await extractFilm(data.pack, film, data.plugins)) {
    const voice = data.voices[utterance.speaker ?? 'narrator'];
    if (voice) data.pack.voiceManifest[voiceKey(voice, utterance.plainText)] = { frames: wavFrames((await fake.synthesize(utterance.plainText, voice.voice, 1 / lengthMultiplier)).wav), provider: voice.provider, voice: voice.voice };
  }
  const result = await rehearse(data.pack, film, data.plugins);
  await runScenario(data.pack, JSON.parse(outputs.get('tests/story_main.scenario.json')!), scenarioGame);
  return { ...data, outputs, film, result };
}
it('maps voice keys to character display names and narrator, and diagnoses missing keys/voices', () => {
  const story = parseStory(baseline).story, voices = storyVoices([story], config)!;
  expect(voices['소라']).toEqual(config.voices!.sora); expect(voices.narrator).toEqual(config.voices!.narrator);
  expect(voices.sora).toBeUndefined();
  expect(lintStories([parseStory(baseline.replace('voice=sora', 'voice=absent')).story], { config })).toContainEqual(expect.objectContaining({ code: 'S035', level: 'error', line: 4 }));
  expect(lintStories([parseStory(baseline.replace(' voice=sora', '')).story], { config })).toContainEqual(expect.objectContaining({ code: 'S036', level: 'warning', line: 4 }));
  expect(lintStories([story], { config: { ...config, narrator: 'absent' } })).toContainEqual(expect.objectContaining({ code: 'S035' }));
  expect(() => parseStoryConfig({ voices: { a: { provider: 'fake', voice: 'a', speed: -1 } } })).toThrow('voices');
});
it('generates voice with per-message boundaries, waitFor readiness, ordered narration and cue barriers without overlapping voices', async () => {
  const { film, result, compiled } = await generate();
  expect(film.steps).toContainEqual({ advanceText: 'voice', count: 1 }); expect(film.steps).toContainEqual({ waitFor: 'message' });
  expect(film.steps).toContainEqual({ waitNarration: true });
  const cue = film.steps.find(s => 'narrate' in s && s.cue);
  expect(cue).toMatchObject({ narrate: expect.stringContaining('열쇠'), cue: expect.any(String) });
  const json = compiled.files.get('maps/pier.events.json')!;
  expect(json).toContain('film_cue'); expect(json).not.toContain('잠시 손에 쥔');
  expect(result.warnings).toEqual([]);
  const types = result.events.flatMap(e => e.type === 'text-start' || e.type === 'narration-start' ? [e.text] : []);
  expect(types.findIndex(t => t.includes('오래 비워'))).toBeLessThan(types.findIndex(t => t.includes('잠시 손에 쥔')));
  expect(types.findIndex(t => t.includes('잠시 손에 쥔'))).toBeLessThan(types.findIndex(t => t.includes('우선 제가')));
});
it('has byte-identical film/scenario output regardless of manifest lengths and repeats', async () => {
  const { story, pack, plugins } = await prepare();
  const first = await generateFilm([story], pack, plugins);
  pack.voiceManifest = { ['a'.repeat(64)]: { frames: 99999, provider: 'fake', voice: 'test' } };
  expect([...(await generateFilm([story], pack, plugins))]).toEqual([...first]);
  const silent = await generate(baseline, false);
  expect(silent.film.steps.some(s => 'advanceText' in s && s.advanceText === 'auto')).toBe(true);
  expect(silent.film.steps.some(s => 'advanceText' in s && s.advanceText === 'voice')).toBe(false);
  expect(silent.outputs.get('tests/story_main.scenario.json')).toBe(first.get('tests/story_main.scenario.json'));
});
it('cue commands pass immediately in normal/scenario mode, and suspend only recording until released', async () => {
  const { pack } = await prepare();
  const event = pack.events.get('pier')!.find(e => e.id === 'arrival')!;
  event.pages[0]!.commands = [{ cmd: 'film_cue', id: 'test_cue' }, { cmd: 'set_flag', flag: 'met_elder', value: true }];
  const empty = { held: new Set<never>(), pressed: new Set<never>() }, gate = new FilmCueGate();
  const normal = new GameSession(pack, { filmCues: gate }); normal.tick(empty);
  expect(normal.game.state.getFlag('met_elder')).toBe(true); expect(gate.pending).toBeNull();
  const recording = new GameSession(pack, { recording: true, filmCues: gate }); recording.tick(empty);
  for (let i = 0; i < 60; i++) recording.tick(empty);
  expect(recording.game.state.getFlag('met_elder')).toBe(false); expect(gate.pending).toBe('test_cue');
  gate.release('test_cue'); recording.tick(empty); expect(recording.game.state.getFlag('met_elder')).toBe(true);
});
it('handles narrative inside a choice/common event with a waitNarration cue and missing character voice as silent text', async () => {
  const text = baseline.replace('  소라: 돌아가면', '  > 마을에 돌아갈 약속은 이웃들의 이름으로 남았습니다.\n  @waitNarration\n  소라: 돌아가면').replace(' voice=keeper', '');
  const result = await generate(text);
  expect(result.result.events).toContainEqual(expect.objectContaining({ type: 'narration-start', text: '마을에 돌아갈 약속은 이웃들의 이름으로 남았습니다.' }));
  expect(result.result.warnings).toEqual([]); expect(result.film.steps).toContainEqual(expect.objectContaining({ waitNarration: true, cue: expect.any(String) }));
});
it('owns voices.json, refuses a manual file/edit until force, and checks manifest mismatch without synthesizing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 's2-ownership-')), folder = path.join(root, 'packs/lantern');
  try {
    await mkdir(path.join(folder, 'story'), { recursive: true });
    for (const file of ['game.json', 'characters.json', 'skin.json', 'CREDITS.md', 'story/tiles.json']) await writeFile(path.join(folder, file), await readFile(`packs/lantern/${file}`));
    await symlink(path.resolve('packs/lantern/assets'), path.join(folder, 'assets'));
    await writeFile(path.join(folder, 'story/main.story.md'), baseline); await writeFile(path.join(folder, 'story/story.config.json'), jsonBytes(config));
    await writeFile(path.join(folder, 'voices.json'), '{}\n');
    expect((await prepareCompilation('lantern', root)).diagnostics).toContainEqual(expect.objectContaining({ code: 'S025', file: 'packs/lantern/voices.json' }));
    expect((await compilePack('lantern', root, { force: true })).some(d => d.level === 'error')).toBe(false);
    const manifest = JSON.parse(await readFile(path.join(folder, 'story/.compiled.json'), 'utf8')) as { files: Record<string, string> };
    expect(manifest.files['voices.json']).toMatch(/^[a-f0-9]{64}$/);
    await writeFile(path.join(folder, 'voices.json'), '{}\n');
    expect((await prepareCompilation('lantern', root)).diagnostics).toContainEqual(expect.objectContaining({ code: 'S025' }));
    expect((await compilePack('lantern', root, { force: true })).some(d => d.level === 'error')).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
it('fake-only story build completes TTS and replay, reuses cache, and missing manifest reports the rebuild command', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 's2-build-')), folder = path.join(root, 'packs/lantern');
  const cli = (tool: string, ...args: string[]) => spawnSync(process.execPath, ['--import', createRequire(import.meta.url).resolve('tsx'), path.resolve(`tools/${tool}.ts`), ...args], { cwd: root, encoding: 'utf8' });
  try {
    await mkdir(path.join(folder, 'story'), { recursive: true });
    for (const file of ['game.json', 'characters.json', 'skin.json', 'CREDITS.md', 'story/tiles.json']) await writeFile(path.join(folder, file), await readFile(`packs/lantern/${file}`));
    await symlink(path.resolve('packs/lantern/assets'), path.join(folder, 'assets'));
    await writeFile(path.join(folder, 'story/main.story.md'), baseline); await writeFile(path.join(folder, 'story/story.config.json'), jsonBytes(config));
    const first = cli('story/index', 'build', 'lantern'); expect(first.status, first.stdout + first.stderr).toBe(0);
    const before = await readFile(path.join(folder, 'voice-manifest.json'), 'utf8');
    const second = cli('story/index', 'build', 'lantern'); expect(second.status, second.stdout + second.stderr).toBe(0);
    expect(second.stdout).toContain('generated 0 cached voices'); expect(await readFile(path.join(folder, 'voice-manifest.json'), 'utf8')).toBe(before);
    const filmFile = path.join(folder, 'films/main.film.json'), originalFilm = await readFile(filmFile, 'utf8');
    const unsafe = JSON.parse(originalFilm) as { steps: unknown[] };
    unsafe.steps.unshift({ narrate: baseline.match(/^> (.*)$/m)![1] });
    await writeFile(filmFile, jsonBytes(unsafe));
    const overlap = cli('films', 'lantern'); expect(overlap.status).toBe(1); expect(overlap.stderr).toContain('S037'); expect(overlap.stderr).toContain('Narration overlaps voiced dialogue');
    expect(await checkGeneratedFilms('lantern', root, new Map([['films/main.film.json', jsonBytes(unsafe)]]))).toContainEqual(expect.objectContaining({ code: 'S037', level: 'error' }));
    await writeFile(filmFile, originalFilm);
    await writeFile(path.join(folder, 'films/authored.film.json'), jsonBytes(unsafe));
    const authored = cli('films', 'lantern'); expect(authored.status, authored.stdout + authored.stderr).toBe(0); expect(authored.stderr).toContain('Narration overlaps voiced dialogue');
    await rm(path.join(folder, 'films/authored.film.json'));
    await writeFile(path.join(folder, 'voice-manifest.json'), '{}\n');
    const broken = cli('films', 'lantern'); expect(broken.status).toBe(1); expect(broken.stderr).toContain('npm run story -- build lantern');
    const check = cli('story/index', 'check', 'lantern'); expect(check.status).toBe(1); expect(check.stdout).toContain('npm run story -- build lantern');
    // Removing voice configuration switches the generated path back to silent mode, with no stale owned voices.
    await writeFile(path.join(folder, 'story/story.config.json'), '{}\n');
    await writeFile(path.join(folder, 'story/main.story.md'), baseline.replace(/ voice=[^\s]+/g, ''));
    const silent = cli('story/index', 'build', 'lantern'); expect(silent.status, silent.stdout + silent.stderr).toBe(0);
    expect(JSON.parse(await readFile(path.join(folder, 'films/main.film.json'), 'utf8')).steps).not.toContainEqual({ advanceText: 'voice', count: 1 });
    await expect(readFile(path.join(folder, 'voices.json'))).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
}, 20000);

const longSceneNarration = '> 소라는 등대의 불빛을 기다리는 사람들을 차례로 떠올렸습니다. 그 밤을 함께 지키겠다는 약속은 오래도록 마음에 남았습니다.\n> 오래 기다린 사람들의 이야기를 들으려면 아직 시간이 필요했습니다. 소라는 돌아오는 길과 다음 밤의 약속을 천천히 생각했습니다.\n';
const withoutExplicitSceneWaits = baseline.replaceAll('\n@waitNarration', '');
it.each(['action', 'touch'])('waits for long scene narration immediately before %s dialogue input, independent of voice lengths', async trigger => {
  const text = withoutExplicitSceneWaits.replace('#.......e..............x', '#......se..............x').replace('#..s...................#', '#......................#').replace('### 촌장의 열쇠 @ pier\n', '### 촌장의 열쇠 @ pier\n' + longSceneNarration).replace('trigger=action character=elder', `trigger=${trigger} character=elder`);
  const first = await generate(text), slower = await generate(text, true, 4);
  expect(first.result.warnings).toEqual([]); expect(slower.result.warnings).toEqual([]);
  expect(slower.outputs.get('films/main.film.json')).toBe(first.outputs.get('films/main.film.json'));
  expect(slower.outputs.get('tests/story_main.scenario.json')).toBe(first.outputs.get('tests/story_main.scenario.json'));
  const steps = first.film.steps, visit = steps.findIndex(s => 'walkTo' in s && 'event' in s.walkTo && s.walkTo.event === 'elder');
  const opening = steps.findIndex((s, i) => i > visit && (trigger === 'action' ? 'press' in s && s.press === 'ok' : 'walk' in s));
  expect(steps[opening - 1]).toEqual({ waitNarration: true });
});
it('gates startup auto before its first command for two preceding scene narrations', async () => {
  const text = withoutExplicitSceneWaits.replace('@event arrival at', longSceneNarration + '@event arrival at');
  const first = await generate(text), slower = await generate(text, true, 4);
  expect(first.result.warnings).toEqual([]); expect(slower.result.warnings).toEqual([]);
  expect(slower.outputs.get('films/main.film.json')).toBe(first.outputs.get('films/main.film.json'));
  const events = JSON.parse(first.compiled.files.get('maps/pier.events.json')!) as { events: { id: string; pages: { commands: { cmd: string; id?: string }[] }[] }[] };
  const prefix = events.events.find(e => e.id === 'arrival')!.pages[0]!.commands[0]!;
  expect(prefix.cmd).toBe('film_cue');
  expect(first.film.steps).toContainEqual(expect.objectContaining({ cue: prefix.id }));
});
it.each(['door', 'go'])('gates destination auto after %s, including an event tail narration before transfer', async route => {
  let text = withoutExplicitSceneWaits.replace('trigger=action character=lamp', 'trigger=auto once character=lamp').replace('@page when=lamp_lit\n  : 심지는 고르게 타고 있다. 오른쪽 아래 금빛 문으로 나가면 마당이다.\n', '').replace('### 등대를 다시 켜다 @ tower\n', '### 등대를 다시 켜다 @ tower\n' + longSceneNarration);
  if (route === 'go') text = text.replace('@page when=met_elder', '  > 돌아오는 밤길을 생각하며 소라는 등대로 걸음을 옮겼습니다.\n  @go tower:entry\n@page when=met_elder');
  const first = await generate(text), slower = await generate(text, true, 4);
  expect(first.result.warnings).toEqual([]); expect(slower.result.warnings).toEqual([]);
  expect(slower.outputs.get('films/main.film.json')).toBe(first.outputs.get('films/main.film.json'));
  expect(first.result.game.state.getFlag('lamp_lit')).toBe(true);
});

it('leaves narration unbound when its following conditional auto is inactive', async () => {
  const text = withoutExplicitSceneWaits.replace('trigger=action character=lamp', 'trigger=auto once when=lamp_lit character=lamp');
  const result = await generate(text);
  expect(result.result.warnings).toEqual([]);
  const narrative = result.film.steps.find(s => 'narrate' in s && s.narrate.startsWith('불을 켜는 일'));
  expect(narrative).not.toHaveProperty('cue');
});
