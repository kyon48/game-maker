import { parseStoryConfig } from './config';
import type { StoryConfig } from './config';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseStory } from './parser';
import { lintStories } from './lint';
import { expressionAliases } from './expressions';
import type { Diagnostic, Story } from './ast';
export interface StoryInput { stories: Story[]; diagnostics: Diagnostic[]; expressions?: ReadonlyMap<string, string> | null; config?: StoryConfig }
export async function readStories(packId: string, root = process.cwd()): Promise<StoryInput> {
  const folder = path.join(root, 'packs', packId, 'story'), diagnostics: Diagnostic[] = [], stories: Story[] = [];
  const display = (file: string) => path.relative(root, file).split(path.sep).join('/');
  const io = (file: string, error: unknown) => diagnostics.push({ file: display(file), line: 1, level: 'error', code: 'S019', message: error instanceof Error ? error.message : String(error) });
  if (!/^[a-z][a-z0-9_]*$/.test(packId)) return { stories, diagnostics: [{ file: 'story', line: 1, code: 'S019', level: 'error', message: '팩 ID 형식 오류' }] };
  try {
    const entries = (await readdir(folder, { withFileTypes: true })).filter(entry => entry.isFile() && entry.name.endsWith('.story.md')).sort((a, b) => a.name.localeCompare(b.name));
    if (!entries.length) { io(folder, new Error('*.story.md 파일이 없습니다')); return { stories, diagnostics }; }
    for (const entry of entries) {
      const file = path.join(folder, entry.name);
      try { const result = parseStory(await readFile(file, 'utf8'), display(file)); stories.push(result.story); diagnostics.push(...result.diagnostics); }
      catch (error) { io(file, error); }
    }
  } catch (error) { io(folder, error); return { stories, diagnostics }; }
  let expressions: ReadonlyMap<string, string> | null | undefined;
  let settings: StoryConfig | undefined;
  const configPath = path.join(folder, 'story.config.json');
  try {
    let config: unknown;
    try { config = JSON.parse(await readFile(configPath, 'utf8')) as unknown; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (config !== undefined) {
      settings = parseStoryConfig(config);
      const artRoot = settings.artRoot;
      if (artRoot !== undefined) {
        if (typeof artRoot !== 'string' || !artRoot.trim()) throw new Error('artRoot는 비어 있지 않은 경로여야 합니다');
        const manifest = path.resolve(folder, artRoot, 'expressions.json');
        try { expressions = expressionAliases(JSON.parse(await readFile(manifest, 'utf8')) as unknown); }
        catch (error) { expressions = null; io(manifest, error); }
      }
    }
  } catch (error) { expressions = null; io(configPath, error); }
  diagnostics.push(...lintStories(stories, { packId, expressions, config: settings }));
  return { stories, expressions, config: settings, diagnostics: diagnostics.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code)) };
}

export async function lintPack(packId: string, root = process.cwd()): Promise<Diagnostic[]> { return (await readStories(packId, root)).diagnostics; }
