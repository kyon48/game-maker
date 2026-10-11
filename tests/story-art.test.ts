import { afterEach, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { parseStory } from '../tools/story/parser';
import { expressionAliases, normalizeExpression } from '../tools/story/expressions';
import { storyFaces } from '../tools/story/faces';
import { planArt, artPack } from '../tools/story/art';
import { compileStories } from '../tools/story/compile';
import { compilePack, hash } from '../tools/story/project';
import { parseManifest } from '../tools/story/ownership';
import { lintStories } from '../tools/story/lint';
import { TimelineObserver } from '../engine/film/timeline';
import { MessageState } from '../engine/sim/ui/MessageState';
import { HeadlessTextMeasurer } from '../engine/sim/HeadlessTextMeasurer';
import { artifacts } from '../tools/film/artifacts';
import type { FilmView } from '../engine/film/view';
const baseline = await readFile('packs/lantern/story/main.story.md', 'utf8');
const aliases = expressionAliases(JSON.parse(await readFile('tests/fixtures/art/expressions.json', 'utf8')));
const fixture = path.resolve('tests/fixtures/art');
const game = JSON.parse(await readFile('packs/lantern/game.json', 'utf8'));
const tiles = JSON.parse(await readFile('packs/lantern/story/tiles.json', 'utf8'));
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const story = (text = baseline) => parseStory(text, 'main.story.md').story;
const normalize = (s = story()) => storyFaces([s], aliases);
it.each(['soft_smile', 'Soft Smile', '부드러운 미소', 'smile'])('normalizes %s and copies only used normalized keys', async name => {
  expect(normalizeExpression(name, aliases)).toBe('soft_smile');
  const s = story(baseline.replace('부드러운 미소', name));
  const files = await planArt([s], fixture, aliases);
  expect([...files.keys()].sort()).toEqual(['assets/portraits/elder/neutral.png', 'assets/portraits/elder/soft_smile.png', 'assets/portraits/elder/suspicious.png', 'assets/portraits/sora/determined.png', 'assets/portraits/sora/neutral.png', 'portraits.json']);
  expect(files.get('portraits.json')).toContain('soft_smile'); expect(files.get('portraits.json')).not.toContain('Soft Smile');
});
it('inherits the same speaker expression; page/common reset and branch siblings/joins use entry state', () => {
  const text = baseline.replace('  소라(결의):', '  촌장: 직전\n  소라(결의):').replace('      촌장: 서두르지', '      촌장: 서두르지').replace('@page when=met_elder', '  촌장: 분기 밖\n@page when=met_elder');
  const faces = normalize(story(text)), find = (term: string) => [...faces].find(([n]) => n.kind === 'dialogue' && n.text.includes(term))?.[1];
  expect(find('직전')?.expression).toBe('suspicious');
  expect(find('서두르지 말고')?.expression).toBe('suspicious'); expect(find('분기 밖')?.expression).toBe('suspicious');
  expect(find('열쇠는 받았지')?.expression).toBe('neutral'); expect(find('함께 지킬 사람이')?.expression).toBe('neutral');
});
it('compiles portrait fields while leaving narration, anonymous lines and art-free speakers without faces', () => {
  const s = story(), faces = normalize(s);
  expect([...faces].some(([n]) => n.kind !== 'dialogue' || !n.speaker)).toBe(false);
  const compilation = compileStories([s], game, tiles, new Map(), false, aliases);
  const data = JSON.parse(compilation.files.get('maps/pier.events.json')!);
  const text = data.events.flatMap((e: { pages: { commands: unknown[] }[] }) => e.pages.flatMap(p => p.commands));
  expect(text).toContainEqual(expect.objectContaining({ cmd: 'text', speaker: '촌장', portrait: 'elder', expression: 'suspicious' }));
  expect(text).toContainEqual(expect.objectContaining({ cmd: 'text', speaker: '뱃사공' }));
  expect(text.find((t: { speaker?: string }) => t.speaker === '뱃사공')).not.toHaveProperty('portrait');
  expect(compilation.diagnostics.some(d => d.code === 'S028')).toBe(false);
  expect(lintStories([story(baseline.replace('뱃사공:', '뱃사공(의심):'))], { expressions: aliases })).toContainEqual(expect.objectContaining({ code: 'S041', level: 'warning' }));
  expect(lintStories([story(baseline.replace('촌장(의심)', '촌장(unknown)'))], { expressions: aliases })).toContainEqual(expect.objectContaining({ code: 'S007', level: 'error' }));
});
it('fallback borrows missing expressions without replacing the costume neutral', async () => {
  const s = story(baseline.replace('elder "촌장" art=base', 'elder "촌장" art=outfit'));
  const files = await planArt([s], fixture, aliases);
  expect(Buffer.from(files.get('assets/portraits/elder/neutral.png')!, 'base64')).toEqual(await readFile(path.join(fixture, 'outfit/neutral.png')));
  expect(Buffer.from(files.get('assets/portraits/elder/suspicious.png')!, 'base64')).toEqual(await readFile(path.join(fixture, 'base/suspicious.png')));
});
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 's3-art-')); roots.push(root);
  await cp('packs/lantern', path.join(root, 'packs/lantern'), { recursive: true });
  await cp(fixture, path.join(root, 'art'), { recursive: true });
  const folder = path.join(root, 'packs/lantern'), config = JSON.parse(await readFile(path.join(folder, 'story/story.config.json'), 'utf8'));
  config.artRoot = '../../../art'; await writeFile(path.join(folder, 'story/story.config.json'), JSON.stringify(config));
  return { root, folder };
}
it.each(['cycle', 'missing', 'escape'] as const)('reports %s asset errors at the requesting dialogue line', async mode => {
  const { root } = await setup();
  const file = path.join(root, 'art/base/character.json'), data = JSON.parse(await readFile(file, 'utf8'));
  delete data.portrait.suspicious;
  if (mode === 'cycle') data.fallback = 'outfit';
  if (mode === 'escape') data.portrait.suspicious = '../outfit/neutral.png';
  await writeFile(file, JSON.stringify(data));
  const result = await artPack('lantern', root, true);
  expect(result).toContainEqual(expect.objectContaining({ code: 'S038', file: 'packs/lantern/story/main.story.md', line: baseline.split('\n').findIndex(l => l.includes('촌장(의심):')) + 1 }));
});
it('preserves hashes on repeat, protects modified PNGs, supports force and removes unused owned copies only after preflight', async () => {
  const { root, folder } = await setup();
  expect((await artPack('lantern', root, true)).some(d => d.level === 'error')).toBe(false);
  const manifestPath = path.join(folder, 'story/.compiled.json'), first = await readFile(manifestPath, 'utf8');
  expect((await artPack('lantern', root)).some(d => d.level === 'error')).toBe(false); expect(await readFile(manifestPath, 'utf8')).toBe(first);
  const manifest = parseManifest(first), png = 'assets/portraits/elder/suspicious.png';
  expect(manifest.files[png]).toBe(hash(await readFile(path.join(folder, png))));
  await writeFile(path.join(folder, png), 'edited');
  expect(await artPack('lantern', root)).toContainEqual(expect.objectContaining({ code: 'S025', file: `packs/lantern/${png}` }));
  expect(await readFile(manifestPath, 'utf8')).toBe(first);
  await artPack('lantern', root, true);
  await writeFile(path.join(folder, 'story/main.story.md'), baseline.replace('촌장(의심)', '촌장(무표정)'));
  const unused = path.join(folder, png); await writeFile(unused, 'edited unused');
  expect((await artPack('lantern', root)).some(d => d.code === 'S025')).toBe(true); expect(await readFile(unused, 'utf8')).toBe('edited unused');
  await artPack('lantern', root, true); await expect(stat(unused)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('check works without original art, verifies owned bytes, and art/build preparation require the original', async () => {
  const { root, folder } = await setup(); await artPack('lantern', root, true);
  await compilePack('lantern', root, { force: true });
  // Committed film bytes are independent of portrait images and voice lengths.
  await rm(path.join(root, 'art'), { recursive: true });
  const result = await compilePack('lantern', root, { check: true });
  expect(result.filter(d => d.level === 'error')).toEqual([]); expect(result.filter(d => d.code === 'S039')).toHaveLength(1);
  expect((await artPack('lantern', root)).some(d => d.level === 'error')).toBe(true);
  await writeFile(path.join(folder, 'assets/portraits/sora/neutral.png'), 'edited');
  expect(await compilePack('lantern', root, { check: true })).toContainEqual(expect.objectContaining({ code: 'S029', file: 'packs/lantern/assets/portraits/sora/neutral.png' }));
});
it('records normalized faces on timeline start/end and script speaker(expression)', () => {
  const message = new MessageState({ width: 300, rows: 3, charsPerTick: 1 }, new HeadlessTextMeasurer(12));
  message.open({ text: 'Hello', speaker: 'Hero', portrait: 'hero', expression: 'soft_smile' });
  const view: FilmView = { mapId: 'map', width: 1, height: 1, blocked: new Uint8Array(1), player: { x: 0, y: 0, dir: 'up', moving: false }, events: [], busy: true, choice: null, message: message.snapshot };
  const observer = new TimelineObserver(), events = [...observer.observe(view, 1), ...observer.finish(30)].map(e => ({ ...e, frame: e.tick }));
  expect(events.find(e => e.type === 'text-start')).toMatchObject({ portrait: 'hero', expression: 'soft_smile' });
  expect(events.find(e => e.type === 'text-end')).toMatchObject({ portrait: 'hero', expression: 'soft_smile' });
  expect(artifacts(events, 30, 40, 'test').script).toContain('Hero(soft_smile)');
});
it('if branches inherit entry state and cannot leak their expression to siblings or the join', () => {
  const text = baseline.replace('  소라(결의):', '  @if met_elder\n    촌장(부드러운 미소): iftrue\n  @else\n    촌장: iffalse\n  @end\n  촌장: afterif\n  소라(결의):');
  const faces = normalize(story(text)), at = (t: string) => [...faces].find(([n]) => n.kind === 'dialogue' && n.text === t)?.[1].expression;
  expect(at('iftrue')).toBe('soft_smile'); expect(at('iffalse')).toBe('suspicious'); expect(at('afterif')).toBe('suspicious');
});
it('warns when credits lack portrait attribution and refuses writes through outside-target symlinks', async () => {
  const { root, folder } = await setup();
  await writeFile(path.join(folder, 'CREDITS.md'), 'Music: original');
  expect(await artPack('lantern', root, true)).toContainEqual(expect.objectContaining({ code: 'S040', level: 'warning' }));
  const { symlink } = await import('node:fs/promises');
  const destination = path.join(folder, 'assets/portraits/sora/neutral.png');
  await rm(destination); await symlink(path.join(root, 'art/base/neutral.png'), destination);
  const before = await readFile(path.join(root, 'art/base/neutral.png'));
  expect((await artPack('lantern', root, true)).some(d => d.level === 'error' && d.message.includes('심볼릭'))).toBe(true);
  expect(await readFile(path.join(root, 'art/base/neutral.png'))).toEqual(before);
});
it('portable check also accepts an omitted artRoot using the owned alias cache', async () => {
  const { root, folder } = await setup(); await artPack('lantern', root, true); await compilePack('lantern', root, { force: true });
  const file = path.join(folder, 'story/story.config.json'), config = JSON.parse(await readFile(file, 'utf8')); delete config.artRoot; await writeFile(file, JSON.stringify(config));
  const result = await compilePack('lantern', root, { check: true });
  expect(result.filter(d => d.level === 'error')).toEqual([]); expect(result.filter(d => d.code === 'S039')).toHaveLength(1);
  expect((await artPack('lantern', root)).some(d => d.level === 'error')).toBe(true);
});
it('requires force to adopt pre-existing unowned portrait JSON and PNGs', async () => {
  const { root, folder } = await setup(), manifestFile = path.join(folder, 'story/.compiled.json');
  const manifest = parseManifest(await readFile(manifestFile, 'utf8'));
  for (const file of Object.keys(manifest.files)) if (file === 'portraits.json' || file.startsWith('assets/portraits/')) delete manifest.files[file];
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  const before = await readFile(path.join(folder, 'portraits.json'));
  const result = await artPack('lantern', root);
  expect(result).toContainEqual(expect.objectContaining({ code: 'S025', file: 'packs/lantern/portraits.json' }));
  expect(result.some(d => d.code === 'S025' && d.file.endsWith('/neutral.png'))).toBe(true);
  expect(await readFile(path.join(folder, 'portraits.json'))).toEqual(before);
  expect((await artPack('lantern', root, true)).some(d => d.level === 'error')).toBe(false);
  expect(parseManifest(await readFile(manifestFile, 'utf8')).files['portraits.json']).toBeDefined();
});
it('check detects obsolete copies when all character art declarations are removed', async () => {
  const { root, folder } = await setup(); await artPack('lantern', root, true); await compilePack('lantern', root, { force: true });
  await writeFile(path.join(folder, 'story/main.story.md'), baseline.replace(/ art=base/g, ''));
  const checked = await compilePack('lantern', root, { check: true });
  expect(checked).toContainEqual(expect.objectContaining({ code: 'S029', file: 'packs/lantern/portraits.json' }));
  expect(checked.some(d => d.code === 'S029' && d.file.endsWith('/neutral.png'))).toBe(true);
  await compilePack('lantern', root); await artPack('lantern', root);
  expect(await readFile(path.join(folder, 'portraits.json'), 'utf8')).toBe('{}\n');
  await expect(stat(path.join(folder, 'assets/portraits/sora/neutral.png'))).rejects.toMatchObject({ code: 'ENOENT' });
});
