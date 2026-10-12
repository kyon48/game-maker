import { packDirectory } from '../packPaths';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { Story, Source, Diagnostic } from './ast';
import { storyFaces, portraitOutputs, StoryArtError } from './faces';
import { pngSize } from '../../engine/data/portraits';
import { object } from './compile';
/** Generated PNG values are base64 internally; disk files and ownership hashes are binary. */
export async function planArt(stories: readonly Story[], artRoot: string, aliases: ReadonlyMap<string, string>): Promise<Map<string, string>> {
  const root = await realpath(artRoot), characters = new Map(stories.flatMap(s => s.characters).map(c => [c.id, c]));
  const faces = storyFaces(stories, aliases), files = portraitOutputs(faces), loaded = new Map<string, Promise<Record<string, unknown>>>();
  const inside = async (file: string) => {
    const resolved = await realpath(file);
    if (!resolved.startsWith(root + path.sep)) throw new Error('에셋 경로가 artRoot 밖을 가리킵니다');
    return resolved;
  };
  const resolve = async (folder: string, key: string, source: Source): Promise<Uint8Array> => {
    const seen = new Set<string>();
    try {
      while (true) {
        if (!/^[a-z][a-z0-9_]*$/.test(folder)) throw new Error('캐릭터 폴더 ID 형식 오류');
        if (seen.has(folder)) throw new Error(`fallback 순환: ${[...seen, folder].join(' → ')}`); seen.add(folder);
        let pending = loaded.get(folder);
        if (!pending) { pending = (async () => object(JSON.parse(await readFile(await inside(path.join(root, folder, 'character.json')), 'utf8'))))(); loaded.set(folder, pending); }
        const data = await pending, portrait = object(data.portrait ?? {}), file = portrait[key];
        if (file !== undefined) {
          if (typeof file !== 'string' || path.isAbsolute(file) || file.includes('\\') || file.split('/').some(p => !p || p === '..' || p === '.')) throw new Error('표정 PNG 상대 경로 오류');
          const bytes = await readFile(await inside(path.join(root, folder, file))); pngSize(bytes); return bytes;
        }
        if (typeof data.fallback !== 'string') throw new Error(`fallback 끝까지 표정 없음: ${key}`);
        folder = data.fallback;
      }
    } catch (error) { throw new StoryArtError(source, `${key}: ${error instanceof Error ? error.message : String(error)}`); }
  };
  for (const [source, face] of faces) {
    const file = `assets/portraits/${face.portrait}/${face.expression}.png`;
    if (!files.has(file)) files.set(file, Buffer.from(await resolve(characters.get(face.portrait)!.art!, face.expression, source)).toString('base64'));
  }
  return files;
}
export async function artCredits(folder: string): Promise<Diagnostic[]> {
  let text = ''; try { text = await readFile(path.join(folder, 'CREDITS.md'), 'utf8'); } catch { /* validator reports a missing credits file */ }
  return /플러시|Plush|얼굴|portrait|표정/i.test(text) ? [] : [{ file: 'CREDITS.md', line: 1, code: 'S040', level: 'warning', message: '얼굴 에셋 출처 항목을 CREDITS.md에 기록하세요' }];
}

/** Asset-only transaction: preflight ownership before any copy or obsolete-file deletion. */
export async function artPack(packId: string, root = process.cwd(), force = false): Promise<Diagnostic[]> {
  const { readStories } = await import('./files');
  const { parseManifest, artGeneratedPath } = await import('./ownership');
  const { writePrepared, outputHash } = await import('./project');
  const { jsonBytes } = await import('./compile');
  const input = await readStories(packId, root), diagnostics = [...input.diagnostics];
  if (diagnostics.some(d => d.level === 'error')) return diagnostics;
  const folder = packDirectory(packId, root), manifestFile = path.join(folder, 'story/.compiled.json');
  try {
    if (!input.config?.artRoot || !input.expressions) throw new StoryArtError({ file: `packs/${packId}/story/story.config.json`, line: 1 }, 'story art에는 읽을 수 있는 artRoot가 필요합니다');
    const files = await planArt(input.stories, path.resolve(folder, 'story', input.config.artRoot), input.expressions);
    let old: import('./ownership').Manifest = { version: 1, files: {}, maps: {} };
    try { old = parseManifest(await readFile(manifestFile, 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    // A target symlink must not turn a generated copy into a write to the source library.
    const canonicalPack = await realpath(folder);
    for (const file of files.keys()) {
      let ancestor = path.join(folder, file);
      while (true) {
        try {
          const canonical = await realpath(ancestor);
          if (canonical !== canonicalPack && !canonical.startsWith(canonicalPack + path.sep)) throw new StoryArtError({ file: `packs/${packId}/${file}`, line: 1 }, '생성 대상 심볼릭 링크가 팩 밖을 가리킵니다');
          break;
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; ancestor = path.dirname(ancestor); }
      }
    }
    const removed = Object.keys(old.files).filter(file => artGeneratedPath.test(file) && !files.has(file));
    if (!force) for (const file of new Set([...Object.keys(old.files), ...files.keys()])) {
      let bytes: Uint8Array | undefined;
      try { bytes = await readFile(path.join(folder, file)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const { hash } = await import('./project');
      if (old.files[file] ? !bytes || hash(bytes) !== old.files[file] : bytes !== undefined) diagnostics.push({ file: `packs/${packId}/${file}`, line: 1, code: 'S025', level: 'error', message: '생성물 변경/삭제 또는 소유권 없는 기존 파일입니다. --force 필요' });
    }
    if (diagnostics.some(d => d.level === 'error')) return diagnostics;
    const owned = { ...old.files };
    for (const file of removed) delete owned[file];
    for (const [file, text] of files) owned[file] = outputHash(file, text);
    files.set('story/.compiled.json', jsonBytes({ version: 1, expressions: Object.fromEntries([...input.expressions].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)), files: Object.fromEntries(Object.entries(owned).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)), maps: old.maps }));
    diagnostics.push(...(await artCredits(folder)).map(d => ({ ...d, file: `packs/${packId}/${d.file}` })));
    await writePrepared(packId, root, { diagnostics, files, removed });
  } catch (error) { diagnostics.push(error instanceof StoryArtError ? error.diagnostic : { file: `packs/${packId}/story/story.config.json`, line: 1, code: 'S038', level: 'error', message: error instanceof Error ? error.message : String(error) }); }
  return diagnostics;
}
