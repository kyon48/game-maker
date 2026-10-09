import { readFile, mkdtemp, mkdir, writeFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import { parseStory } from '../tools/story/parser';
import { compileStories, jsonBytes, parseTiles } from '../tools/story/compile';
import { compilePack, prepareCompilation, storyPackIds } from '../tools/story/project';
import { expressionAliases, normalizeExpression } from '../tools/story/expressions';
import { FsSource } from '../tools/fsSource';
import { validatePack } from '../engine/data/validator/validate';
import { builtinCatalog } from '../tools/catalog';
import { Game } from '../engine/sim/Game';
const valid = await readFile('tests/fixtures/story/valid.story.md', 'utf8');
const game = { id: 'lantern', title: '직접 쓴 제목', version: '2.3.4', formatVersion: 1, tileSize: 16, screen: { width: 320, height: 240 }, player: 'sora', plugins: [], labels: { continue: '이어가기', newGame: '새 시작' }, state: { flags: { obsolete: true }, vars: { previous: 9 } }, maps: ['previous'], start: { map: 'previous', x: 1, y: 1, dir: 'left' } };
const tiles = { wall: 7, floor: 2, door: 8, tileset: 'assets/colors.tsj' };
const build = (text = valid, maps = new Map<string, string>(), force = false) => compileStories([parseStory(text).story], game, tiles, maps, force);
interface Page { trigger: string; character?: string; through?: boolean; when?: unknown; commands: Record<string, unknown>[] }
interface Event { id: string; x: number; y: number; pages: Page[] }
const events = (files: ReadonlyMap<string, string>, map: string): Event[] => (JSON.parse(files.get(`maps/${map}.events.json`)!) as { events: Event[] }).events;
const temps: string[] = [];
afterEach(async () => { await Promise.all(temps.splice(0).map(root => rm(root, { force: true, recursive: true }))); });
async function setup(text = valid) {
  const root = await mkdtemp(path.join(tmpdir(), 'story-compile-')); temps.push(root);
  const folder = path.join(root, 'packs/lantern'); await mkdir(path.join(folder, 'story'), { recursive: true }); await mkdir(path.join(folder, 'assets'));
  const files: Record<string, string> = { 'game.json': jsonBytes(game), 'story/main.story.md': text, 'story/tiles.json': jsonBytes(tiles), 'characters.json': jsonBytes({ sora: { placeholder: '#123456' }, elder: { placeholder: '#abcdef' } }), 'skin.json': await readFile('tests/fixtures/base/skin.json', 'utf8'), 'CREDITS.md': 'Test assets only', 'assets/colors.tsj': jsonBytes({ image: 'tile.png', tilewidth: 16, tileheight: 16, columns: 8, tilecount: 8 }) };
  for (const [file, value] of Object.entries(files)) await writeFile(path.join(folder, file), value);
  await writeFile(path.join(folder, 'assets/tile.png'), await readFile('tests/fixtures/base/assets/tile.png'));
  await writeFile(path.join(folder, 'assets/font.woff2'), await readFile('tests/fixtures/base/assets/font.woff2'));
  return { root, folder };
}
it('compiles dialogue, branches, options, every command, pages and common events without film or portrait fields', () => {
  const result = build(), elder = events(result.files, 'pier').find(e => e.id === 'elder')!;
  expect(elder).toMatchObject({ x: 4, y: 2, pages: [{ trigger: 'action', character: 'elder' }, { when: { flag: 'met_elder', is: true } }] });
  expect(elder.pages[0]?.commands[0]).toEqual({ cmd: 'face', target: 'this', dir: 'player' });
  expect(elder.pages[0]?.commands[1]).toEqual({ cmd: 'text', text: '등대 열쇠를 찾는다고? 자네가?', speaker: '촌장' });
  const choice = elder.pages[0]!.commands[3]!;
  expect(choice).toMatchObject({ cmd: 'choice', prompt: '뭐라고 답할까', cancel: null });
  const options = choice.options as { label: string; commands: Record<string, unknown>[] }[];
  expect(options.map(o => o.label)).toEqual(['사정을 말한다', '돌아선다']);
  expect(options[0]?.commands.slice(0, 2)).toEqual([{ cmd: 'set_flag', flag: 'met_elder', value: true }, { cmd: 'set_var', var: 'trust', op: 'add', value: 1 }]);
  expect(options[0]?.commands[2]).toEqual({ cmd: 'if', cond: { all: [{ flag: 'met_elder', is: true }, { any: [{ var: 'trust', op: '>=', value: 1 }, { flag: 'lamp_lit', is: false }] }] }, then: [{ cmd: 'text', text: '그렇다면 도와주지.', speaker: '촌장' }], else: [{ cmd: 'set_var', var: 'trust', op: 'sub', value: 1 }, { cmd: 'text', text: '조금 더 생각해 보게.', speaker: '촌장' }] });
  const light = events(result.files, 'tower').find(e => e.id === 'light')!;
  expect(light.pages[0]?.commands).toEqual(expect.arrayContaining([{ cmd: 'move', target: 'player', route: ['up', 'up', 'wait:30', 'face:right'], wait: true }, { cmd: 'face', target: 'this', dir: 'player' }, { cmd: 'call', common: 'light_room' }, { cmd: 'show_map_name' }, { cmd: 'transfer', map: 'garden', marker: 'entry', dir: 'down' }]));
  expect(light.pages[0]?.commands).toContainEqual(expect.objectContaining({ cmd: 'if', then: [{ cmd: 'set_flag', flag: 'lamp_lit', value: true }, { cmd: 'text', text: '다시 빛이 보이네요.', speaker: '소라' }], else: [{ cmd: 'set_flag', flag: 'lamp_lit', value: false }, { cmd: 'text', text: '아직 불씨가 약하다.' }] }));
  const common = JSON.parse(result.files.get('common-events.json')!) as Record<string, { commands: unknown[] }>;
  expect(common.light_room?.commands).toEqual([{ cmd: 'fade', to: 'black', frames: 30 }, { cmd: 'wait', frames: 60 }, { cmd: 'fade', to: 'clear', frames: 30 }, { cmd: 'shake' }, { cmd: 'text', text: '잠시 바람이 잦아들었다.' }]);
  expect([...result.files.keys()].some(file => /films|scenario|portrait/.test(file))).toBe(false);
  expect(JSON.stringify([...result.files.values()])).not.toMatch(/portrait|expression|narrate|filmPause|waitNarration/);
  expect(result.diagnostics.filter(d => d.code === 'S028')).toHaveLength(1);
});
it('once inserts a persistent self flag and idle page, and combines explicit page conditions with completion', () => {
  const light = events(build().files, 'tower').find(e => e.id === 'light')!;
  expect(light.pages[0]?.when).toEqual({ self: 'story_once', is: false }); expect(light.pages[0]?.commands[0]).toEqual({ cmd: 'set_self_flag', name: 'story_once', value: true });
  expect(light.pages[1]).toMatchObject({ trigger: 'none', when: { self: 'story_once', is: true }, commands: [] });
  const elder = events(build(valid.replace('trigger=action character=elder', 'trigger=action once character=elder')).files, 'pier').find(e => e.id === 'elder')!;
  expect(elder.pages).toHaveLength(2); expect(elder.pages[0]?.commands.slice(0, 2)).toEqual([{ cmd: 'face', target: 'this', dir: 'player' }, { cmd: 'set_self_flag', name: 'story_once', value: true }]);
  expect(elder.pages[1]?.when).toEqual({ all: [{ self: 'story_once', is: true }, { flag: 'met_elder', is: true }] });
});
it('anchor letters resolve to canonical door markers and generated floor/collision data', () => {
  const result = build(), door = events(result.files, 'pier').find(e => e.id === 'to_tower')!;
  expect(door).toEqual({ id: 'to_tower', x: 11, y: 2, pages: [{ trigger: 'touch', through: true, commands: [{ cmd: 'transfer', map: 'tower', marker: 'entry' }] }] });
  const raw = JSON.parse(result.files.get('maps/pier.tmj')!) as { layers: { name: string; data?: number[]; objects?: { name: string; x: number; y: number }[] }[]; tilesets: unknown[] };
  expect(raw.layers.map(l => l.name)).toEqual(['floor', 'collision', 'markers']); expect(raw.layers[0]?.data?.[0]).toBe(7); expect(raw.layers[0]?.data?.[35]).toBe(8); expect(raw.layers[1]?.data?.[35]).toBe(0);
  expect(raw.layers[2]?.objects).toContainEqual(expect.objectContaining({ name: 'elder_spot', x: 64, y: 32 })); expect(raw.tilesets).toEqual([{ firstgid: 1, source: '../assets/colors.tsj' }]);
});
it('changes only the four owned game fields and requires start in the entry map', () => {
  const result = JSON.parse(build().files.get('game.json')!) as Record<string, unknown>;
  for (const [key, value] of Object.entries(game)) if (!['state', 'maps', 'start', 'mapNames'].includes(key)) expect(result[key]).toEqual(value);
  expect(result.start).toEqual({ map: 'pier', x: 2, y: 3, dir: 'left' }); expect(result.maps).toEqual(['pier', 'tower', 'garden']);
  expect(result.state).toEqual({ flags: { met_elder: false, lamp_lit: false }, vars: { trust: 0 } });
  expect(() => build(valid.replace('@anchor s = start', '@anchor s = other'))).toThrow('pier:start');
});
it('preserves edited Tiled bytes, rejects changed/missing/duplicate anchors and regenerates only with force-maps', () => {
  const generated = build().files.get('maps/pier.tmj')!;
  const map = JSON.parse(generated) as { note?: string; layers: { name: string; objects?: { name: string; x: number; y: number }[] }[] };
  map.note = 'Tiled hand edit'; const edited = JSON.stringify(map, null, 4) + '\n';
  const kept = build(valid, new Map([['maps/pier.tmj', edited]])); expect(kept.files.has('maps/pier.tmj')).toBe(false); expect(kept.maps.get('maps/pier.tmj')).toBe(edited);
  const markers = map.layers[2]!.objects!; markers[0]!.x += 16;
  expect(() => build(valid, new Map([['maps/pier.tmj', jsonBytes(map)]]))).toThrow('앵커 불일치');
  expect(build(valid, new Map([['maps/pier.tmj', jsonBytes(map)]]), true).files.get('maps/pier.tmj')).toBe(generated);
  markers[0]!.x -= 16; markers.push({ ...markers[0]! }); expect(() => build(valid, new Map([['maps/pier.tmj', jsonBytes(map)]]))).toThrow('앵커 불일치');
});
it('two compiles have byte-identical output and ownership manifests with no absolute paths or times', async () => {
  const { root, folder } = await setup(); expect((await compilePack('lantern', root)).some(d => d.level === 'error')).toBe(false);
  const manifest = JSON.parse(await readFile(path.join(folder, 'story/.compiled.json'), 'utf8')) as { files: Record<string, string>; maps: Record<string, string> };
  const filenames = [...Object.keys(manifest.files), ...Object.keys(manifest.maps), 'story/.compiled.json'];
  const before = await Promise.all(filenames.map(file => readFile(path.join(folder, file), 'utf8')));
  await compilePack('lantern', root); expect(await Promise.all(filenames.map(file => readFile(path.join(folder, file), 'utf8')))).toEqual(before);
  expect(before.join()).not.toContain(root); expect(await compilePack('lantern', root, { check: true })).not.toContainEqual(expect.objectContaining({ level: 'error' }));
});
it('refuses hand edits and deletion before any writes, and force restores generated content', async () => {
  const { root, folder } = await setup(); await compilePack('lantern', root);
  const original = await readFile(path.join(folder, 'game.json'), 'utf8'); await writeFile(path.join(folder, 'common-events.json'), '{}\n');
  await writeFile(path.join(folder, 'story/main.story.md'), valid.replace('@var trust 0', '@var trust 2'));
  expect(await compilePack('lantern', root)).toContainEqual(expect.objectContaining({ code: 'S025', file: 'packs/lantern/common-events.json' })); expect(await readFile(path.join(folder, 'game.json'), 'utf8')).toBe(original);
  expect((await compilePack('lantern', root, { force: true })).some(d => d.level === 'error')).toBe(false);
  await rm(path.join(folder, 'maps/tower.events.json')); expect(await compilePack('lantern', root)).toContainEqual(expect.objectContaining({ code: 'S025' }));
  expect((await compilePack('lantern', root, { force: true })).some(d => d.level === 'error')).toBe(false);
});
it('preserved maps retain bytes and mtime and remain checkable after an allowed edit', async () => {
  const { root, folder } = await setup(); await compilePack('lantern', root);
  const file = path.join(folder, 'maps/pier.tmj'), map = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>; map.note = 'Edited by Tiled'; const edited = jsonBytes(map); await writeFile(file, edited);
  const before = (await stat(file)).mtimeMs; await compilePack('lantern', root); expect(await readFile(file, 'utf8')).toBe(edited); expect((await stat(file)).mtimeMs).toBe(before);
  expect((await compilePack('lantern', root, { check: true })).some(d => d.level === 'error')).toBe(false);
  await compilePack('lantern', root, { forceMaps: true }); expect(await readFile(file, 'utf8')).not.toBe(edited);
});
it('check is read-only and finds missing/outdated manifests and generated files', async () => {
  const { root, folder } = await setup(); expect(await compilePack('lantern', root, { check: true })).toContainEqual(expect.objectContaining({ code: 'S029' }));
  await compilePack('lantern', root); const before = await readFile(path.join(folder, 'maps/pier.events.json'), 'utf8');
  await writeFile(path.join(folder, 'story/main.story.md'), valid.replace('등대 열쇠를 찾는다고?', '열쇠가 필요하다고?'));
  expect(await compilePack('lantern', root, { check: true })).toContainEqual(expect.objectContaining({ code: 'S029', file: 'packs/lantern/maps/pier.events.json' })); expect(await readFile(path.join(folder, 'maps/pier.events.json'), 'utf8')).toBe(before);
});
it('lint and malformed roles/ownership fail without changing pack outputs', async () => {
  const { root, folder } = await setup(valid.replace('@set met_elder', '@set undeclared')); const before = await readFile(path.join(folder, 'game.json'), 'utf8');
  expect(await compilePack('lantern', root)).toContainEqual(expect.objectContaining({ code: 'S002' })); expect(await readFile(path.join(folder, 'game.json'), 'utf8')).toBe(before);
  await writeFile(path.join(folder, 'story/main.story.md'), valid); await writeFile(path.join(folder, 'story/tiles.json'), '{"wall":0}'); expect(await compilePack('lantern', root)).toContainEqual(expect.objectContaining({ code: 'S021' }));
  await writeFile(path.join(folder, 'story/tiles.json'), jsonBytes(tiles)); await writeFile(path.join(folder, 'story/.compiled.json'), jsonBytes({ version: 1, files: { '../../outside': 'a'.repeat(64) }, maps: {} }));
  expect(await compilePack('lantern', root, { force: true })).toContainEqual(expect.objectContaining({ code: 'S026' })); expect(await readFile(path.join(folder, 'game.json'), 'utf8')).toBe(before);
});
it('checks colliding door/event IDs and preserves raw JSON for the existing validator', async () => {
  expect(() => build(valid.replace('@event elder at', '@event to_tower at'))).toThrow('충돌');
  const { root, folder } = await setup(valid.replace('"show_map_name"', '"unknown_command"')); await compilePack('lantern', root);
  const result = await validatePack(new FsSource(folder), 'lantern', { commands: builtinCatalog() }); expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'V1' }));
});
it('normalizes key/English/Korean/core aliases to canonical expression keys', () => {
  const aliases = expressionAliases({ expressions: [{ key: 'startled', en: 'Startled', ko: '깜짝' }], core: { surprised: 'startled' } });
  for (const name of ['startled', 'STARTLED', '깜짝', ' surprised ']) expect(normalizeExpression(name, aliases)).toBe('startled'); expect(() => normalizeExpression('missing', aliases)).toThrow();
});
it('once prevents replay even if a raw stop exits before the rest of the event', async () => {
  const text = valid.replace('trigger=action character=elder', 'trigger=action once character=elder').replace('  촌장(의심):', '  @add trust 1\n  @cmd {"cmd":"stop"}\n  촌장(의심):');
  const { root, folder } = await setup(text); await compilePack('lantern', root); const { pack } = await validatePack(new FsSource(folder), 'lantern', { commands: builtinCatalog() });
  const g = new Game({ ...pack!.game, start: { map: 'pier', x: 4, y: 3, dir: 'up' } }, pack!.maps.get('pier')!, pack!.characters, pack!.events.get('pier')!, { skin: pack!.skin, commonEvents: pack!.common });
  const empty = { held: new Set<never>(), pressed: new Set<never>() }, ok = { held: new Set<never>(), pressed: new Set<'ok'>(['ok']) };
  g.tick(ok); g.tick(empty); g.tick(ok); g.tick(empty); expect(g.state.getVar('trust')).toBe(1); expect(g.state.getSelf('pier', 'elder', 'story_once')).toBe(true);
});
it('check --all discovers story packs, including symlinks, and skips packs without story', async () => {
  const { root } = await setup(); await mkdir(path.join(root, 'packs/demo')); await symlink(path.join(root, 'packs/lantern'), path.join(root, 'packs/linked'), 'dir');
  expect(await storyPackIds(root)).toEqual(['lantern', 'linked']);
});
it('CLI compile validates outputs and propagates validator errors; check never rewrites files', async () => {
  const { root, folder } = await setup(); const cli = path.resolve('tools/story/index.ts'), tsx = createRequire(import.meta.url).resolve('tsx');
  const run = (...args: string[]) => spawnSync(process.execPath, ['--import', tsx, cli, ...args], { cwd: root, encoding: 'utf8' });
  const result = run('compile', 'lantern'); expect(result.status).toBe(0); expect(result.stdout).toContain('lantern: validation passed');
  expect(run('check', '--all').status).toBe(0);
  await writeFile(path.join(folder, 'story/main.story.md'), valid.replace('"show_map_name"', '"unknown_command"')); const bad = run('compile', 'lantern'); expect(bad.status).toBe(1); expect(bad.stdout).toContain('error V1:');
});
it.each([{ ...tiles, tileset: '../escape.tsj' }, { ...tiles, tileset: '/outside.tsj' }, { ...tiles, floor: 0 }, { ...tiles, firstgid: 0 }])('rejects invalid tile roles %j', value => expect(() => parseTiles(value)).toThrow());
it('force preserves edited human game metadata while regenerating the four story fields', async () => {
  const { root, folder } = await setup(); await compilePack('lantern', root);
  const file = path.join(folder, 'game.json'), current = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>; current.title = '새 제목'; current.version = '3.0.0'; current.labels = { continue: '돌아오기', newGame: '처음으로' };
  await writeFile(file, jsonBytes(current)); expect(await compilePack('lantern', root)).toContainEqual(expect.objectContaining({ code: 'S025', file: 'packs/lantern/game.json' }));
  await compilePack('lantern', root, { force: true }); const next = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  expect(next).toMatchObject({ title: '새 제목', version: '3.0.0', labels: current.labels });
});
it('marker mismatch fails before writing any files even with force, unless force-maps is requested', async () => {
  const { root, folder } = await setup(); await compilePack('lantern', root);
  const file = path.join(folder, 'maps/pier.tmj'), map = JSON.parse(await readFile(file, 'utf8')) as { layers: { objects?: { x: number }[] }[] }; map.layers[2]!.objects![0]!.x += 16; await writeFile(file, jsonBytes(map));
  const before = await readFile(path.join(folder, 'game.json'), 'utf8');
  expect(await compilePack('lantern', root, { force: true })).toContainEqual(expect.objectContaining({ code: 'S023' })); expect(await readFile(path.join(folder, 'game.json'), 'utf8')).toBe(before);
  expect((await compilePack('lantern', root, { forceMaps: true })).some(d => d.level === 'error')).toBe(false);
});
it('check diagnoses obsolete owned outputs and compile removes only matching tracked non-map files', async () => {
  const { hash } = await import('../tools/story/project');
  const { root, folder } = await setup(); await compilePack('lantern', root);
  const filename = path.join(folder, 'story/.compiled.json'), manifest = JSON.parse(await readFile(filename, 'utf8')) as { files: Record<string, string> };
  const stale = '{"events":[]}\n'; manifest.files['maps/stale.events.json'] = hash(stale); await writeFile(filename, jsonBytes(manifest)); await writeFile(path.join(folder, 'maps/stale.events.json'), stale); await writeFile(path.join(folder, 'maps/handwritten.tmj'), '{}');
  const plan = await prepareCompilation('lantern', root, { check: true }); expect(plan.diagnostics).toContainEqual(expect.objectContaining({ code: 'S029', file: 'packs/lantern/maps/stale.events.json' }));
  await compilePack('lantern', root); await expect(readFile(path.join(folder, 'maps/stale.events.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' }); expect(await readFile(path.join(folder, 'maps/handwritten.tmj'), 'utf8')).toBe('{}');
});
