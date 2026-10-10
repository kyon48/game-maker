import { expect, it } from 'vitest';
import { readFile, mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseStory } from '../tools/story/parser';
import { lintStories } from '../tools/story/lint';
import { parseStoryConfig, storyVoices } from '../tools/story/config';
import { compileStories, jsonBytes } from '../tools/story/compile';
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
async function generate(text = baseline, voiced = true) {
  const data = await prepare(text, voiced);
  const outputs = await generateFilm([data.story], data.pack, data.plugins);
  const film = asFilm(JSON.parse(outputs.get('films/main.film.json')!));
  data.pack.voiceManifest = {};
  if (voiced) for (const utterance of await extractFilm(data.pack, film, data.plugins)) {
    const voice = data.voices[utterance.speaker ?? 'narrator'];
    if (voice) data.pack.voiceManifest[voiceKey(voice, utterance.plainText)] = { frames: wavFrames((await fake.synthesize(utterance.plainText, voice.voice, 1)).wav), provider: voice.provider, voice: voice.voice };
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
