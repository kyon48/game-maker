import path from 'node:path';
import { FsSource } from '../fsSource';
import { nodePluginRuntime } from '../loadPlugins';
import { validatePack } from '../../engine/data/validator/validate';
import { storySource } from './source';
import type { Story, Diagnostic } from './ast';
import { generateFilm } from './film';
import { prepareCompilation, writePrepared, hash } from './project';
import { readStories } from './files';
import { jsonBytes, object, StoryCompileError } from './compile';
export async function planFilm(packId: string, root: string, files: ReadonlyMap<string, string>, stories: readonly Story[], name: string) {
  const fs = new FsSource(path.join(root, 'packs', packId));
  const source = await storySource(fs.root, files, true);
  const plugins = await nodePluginRuntime(source, fs.root);
  const result = await validatePack(source, packId, plugins.validationOptions);
  if (!result.pack) throw new Error(result.diagnostics.filter(d => d.level === 'error').map(d => `${d.file}${d.pointer} ${d.code}: ${d.message}`).join('\n'));
  return generateFilm(stories, result.pack, plugins, name);
}
export async function filmPack(packId: string, root = process.cwd(), name = 'main', force = false): Promise<Diagnostic[]> {
  const prepared = await prepareCompilation(packId, root, { force });
  if (!prepared.files || prepared.diagnostics.some(d => d.level === 'error')) return prepared.diagnostics;
  try {
    const generated = await planFilm(packId, root, prepared.files, (await readStories(packId, root)).stories, name);
    const manifest = object(JSON.parse(prepared.files.get('story/.compiled.json')!) as unknown);
    const owned = object(manifest.files);
    const fs = new FsSource(path.join(root, 'packs', packId));
    for (const [file, bytes] of generated) {
      if (!force && owned[file] === undefined && await fs.exists(file)) {
        const { readFile } = await import('node:fs/promises');
        if (await readFile(path.join(fs.root, file), 'utf8') !== bytes) throw new Error(`소유권 없는 기존 파일: ${file} (--force 필요)`);
      }
      prepared.files.set(file, bytes); owned[file] = hash(bytes);
    }
    manifest.files = Object.fromEntries(Object.entries(owned).sort(([a], [b]) => a.localeCompare(b, 'en')));
    prepared.files.set('story/.compiled.json', jsonBytes(manifest));
    await writePrepared(packId, root, prepared);
  } catch (error) {
    prepared.diagnostics.push(error instanceof StoryCompileError ? error.diagnostic : { file: `packs/${packId}/story`, line: 1, code: 'S031', level: 'error', message: String(error) });
  }
  return prepared.diagnostics;
}
