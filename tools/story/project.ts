import { readFile, writeFile, mkdir, unlink, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readStories } from './files';
import { compileStories, StoryCompileError, object, jsonBytes } from './compile';
import type { Diagnostic } from './ast';
import { planFilm } from './film-project';
export const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
interface Manifest { version: 1; files: Record<string, string>; maps: Record<string, string> }
export interface CompileOptions { force?: boolean; forceMaps?: boolean; check?: boolean }
export interface Prepared { diagnostics: Diagnostic[]; files?: Map<string, string>; removed?: string[] }
const ownedPath = /^(game\.json|common-events\.json|maps\/[a-z][a-z0-9_]*\.events\.json|films\/[a-z][a-z0-9_]*\.(film\.json|narration\.md)|tests\/story_[a-z][a-z0-9_]*\.scenario\.json)$/;
const mapPath = /^maps\/[a-z][a-z0-9_]*\.tmj$/;
async function readOptional(file: string): Promise<string | undefined> { try { return await readFile(file, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; } }
function parseManifest(text: string): Manifest {
  const value = object(JSON.parse(text) as unknown);
  if (value.version !== 1 || Object.keys(value).some(key => !['version', 'files', 'maps'].includes(key))) throw new Error('소유권 매니페스트 버전/필드 오류');
  for (const [field, pattern] of [['files', ownedPath], ['maps', mapPath]] as const) {
    for (const [file, digest] of Object.entries(object(value[field]))) if (!pattern.test(file) || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw new Error(`소유권 경로/해시 오류: ${file}`);
  }
  return value as unknown as Manifest;
}
export async function prepareCompilation(packId: string, root = process.cwd(), options: CompileOptions = {}): Promise<Prepared> {
  const input = await readStories(packId, root), diagnostics = [...input.diagnostics];
  if (diagnostics.some(d => d.level === 'error')) return { diagnostics };
  const pack = path.join(root, 'packs', packId), display = (file: string) => `packs/${packId}/${file}`;
  const report = (file: string, code: string, message: string) => diagnostics.push({ file: display(file), line: 1, code, level: 'error', message });
  let game: unknown, tiles: unknown, old: Manifest | undefined;
  for (const filename of ['game.json', 'story/tiles.json', 'story/.compiled.json']) {
    try {
      const text = await readOptional(path.join(pack, filename));
      if (filename === 'story/.compiled.json') { if (text !== undefined) old = parseManifest(text); }
      else { if (text === undefined) throw new Error('필수 입력 파일이 없습니다'); const value = JSON.parse(text) as unknown; if (filename === 'game.json') game = value; else tiles = value; }
    } catch (error) { report(filename, filename.endsWith('.compiled.json') ? 'S026' : 'S021', String(error)); }
  }
  if (diagnostics.some(d => d.level === 'error')) return { diagnostics };
  const existing = new Map<string, string>();
  try {
    for (const location of input.stories.flatMap(s => s.locations)) {
      const file = `maps/${location.id}.tmj`, text = await readOptional(path.join(pack, file));
      if (text !== undefined) existing.set(file, text);
    }
    const compilation = compileStories(input.stories, game, tiles, existing, options.forceMaps);
    diagnostics.push(...compilation.diagnostics);
    const files = new Map(compilation.files), protectedFiles = [...files.keys()].filter(file => ownedPath.test(file)).sort();
    for (const file of Object.keys(old?.files ?? {}).filter(f => /^films\/|^tests\/story_/.test(f))) {
      const text = await readOptional(path.join(pack, file));
      if (text !== undefined) files.set(file, text);
    }
    if (options.check) {
      for (const file of Object.keys(old?.files ?? {}).filter(f => /^films\/.*\.film\.json$/.test(f)).sort()) {
        const name = file.slice(6, -10);
        for (const [generated, text] of await planFilm(packId, root, files, input.stories, name)) files.set(generated, text);
      }
    }
    const removed = Object.keys(old?.files ?? {}).filter(file => !files.has(file)).sort();
    // Complete all ownership checks before writing even the first output.
    if (!options.check && !options.force) {
      for (const file of new Set([...Object.keys(old?.files ?? {}), ...protectedFiles])) {
        const text = await readOptional(path.join(pack, file));
        if (old?.files[file] !== undefined) {
          if (text === undefined || hash(text) !== old.files[file]) report(file, 'S025', '생성 파일이 마지막 컴파일 이후 변경/삭제되었습니다. --force로 덮어쓸 수 있습니다');
        } else if (file !== 'game.json' && text !== undefined && text !== files.get(file)) report(file, 'S025', '소유권 없는 기존 파일입니다. --force로 덮어쓸 수 있습니다');
      }
    }
    if (diagnostics.some(d => d.level === 'error')) return { diagnostics };
    const manifest: Manifest = {
      version: 1, files: Object.fromEntries([...files.keys()].filter(f => ownedPath.test(f)).sort().map(file => [file, !options.check && old?.files[file] && /^films\/|^tests\/story_/.test(file) ? old.files[file] : hash(files.get(file)!)])),
      maps: Object.fromEntries([...compilation.maps].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([file, text]) => [file, !options.forceMaps && existing.has(file) && old?.maps[file] ? old.maps[file] : hash(text)])),
    };
    files.set('story/.compiled.json', jsonBytes(manifest));
    if (options.check) {
      for (const [file, expected] of files) {
        if (await readOptional(path.join(pack, file)) !== expected) report(file, 'S029', '생성물이 없거나 최신 스토리와 다릅니다. npm run story -- compile ' + packId + ' 실행 필요');
      }
      for (const file of removed) report(file, 'S029', '현재 스토리에 없는 이전 생성 파일입니다. 다시 컴파일하세요');
    }
    return { diagnostics, files, removed };
  } catch (error) {
    if (error instanceof StoryCompileError) diagnostics.push(error.diagnostic);
    else report('story/tiles.json', 'S021', String(error));
    return { diagnostics };
  }
}
export async function compilePack(packId: string, root = process.cwd(), options: CompileOptions = {}): Promise<Diagnostic[]> {
  const prepared = await prepareCompilation(packId, root, options);
  if (options.check || !prepared.files || prepared.diagnostics.some(d => d.level === 'error')) return prepared.diagnostics;
  await writePrepared(packId, root, prepared);
  return prepared.diagnostics;
}
export async function writePrepared(packId: string, root: string, prepared: Prepared & { files?: Map<string, string> }): Promise<void> {
  if (!prepared.files) return;
  const folder = path.join(root, 'packs', packId);
  for (const [file, text] of prepared.files) {
    const destination = path.join(folder, file);
    if (file === 'story/.compiled.json') continue;
    if (await readOptional(destination) === text) continue;
    await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, text);
  }
  // Only tracked, preflighted non-map files can be obsolete. Edited Tiled maps stay on disk.
  for (const file of prepared.removed ?? []) { try { await unlink(path.join(folder, file)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
  const manifest = path.join(folder, 'story/.compiled.json'), text = prepared.files.get('story/.compiled.json')!;
  if (await readOptional(manifest) !== text) { await mkdir(path.dirname(manifest), { recursive: true }); await writeFile(manifest, text); }
}
export async function storyPackIds(root = process.cwd()): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(path.join(root, 'packs'), { withFileTypes: true })) {
    if (!/^[a-z][a-z0-9_]*$/.test(entry.name)) continue;
    try { if ((await stat(path.join(root, 'packs', entry.name, 'story'))).isDirectory()) result.push(entry.name); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return result.sort();
}
