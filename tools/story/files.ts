import { parseLegend } from './tileLegend';
import { packDirectory } from '../packPaths';
import { parseManifest } from './ownership';
import { parseStoryConfig } from './config';
import type { StoryConfig } from './config';
import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { parseStory } from './parser';
import { lintStories } from './lint';
import { normalizeExpression, expressionAliases } from './expressions';
import type { Diagnostic, Story } from './ast';
export interface StoryInput { stories: Story[]; diagnostics: Diagnostic[]; expressions?: ReadonlyMap<string, string> | null; config?: StoryConfig; resolvedTiles?: unknown }
export async function readStories(packId: string, root = process.cwd(), allowMissingArt = false): Promise<StoryInput> {
  const folder = path.join(packDirectory(packId, root), 'story'), diagnostics: Diagnostic[] = [], stories: Story[] = [];
  const display = (file: string) => `packs/${packId}/` + path.relative(packDirectory(packId, root), file).split(path.sep).join('/');
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
        catch (error) {
          if (allowMissingArt && ['ENOENT', 'EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) {
            const cached = parseManifest(await readFile(path.join(folder, '.compiled.json'), 'utf8')).expressions;
            if (!cached) throw new Error('표정 별칭 캐시가 없습니다. artRoot가 있는 환경에서 story art를 실행하세요');
            expressions = new Map(Object.entries(cached));
            diagnostics.push({ file: display(configPath), line: 1, level: 'warning', code: 'S039', message: 'artRoot를 읽을 수 없어 원본 대조를 생략하고 복사본·소유권 해시만 확인합니다' });
          } else { expressions = null; io(manifest, error); }
        }
      }
    }
  } catch (error) { expressions = null; io(configPath, error); }
  if (allowMissingArt && expressions === undefined) {
    try {
      const cached = parseManifest(await readFile(path.join(folder, '.compiled.json'), 'utf8')).expressions;
      if (cached) {
        expressions = new Map(Object.entries(cached));
        diagnostics.push({ file: display(configPath), line: 1, level: 'warning', code: 'S039', message: 'artRoot 설정이 없어 원본 대조를 생략하고 복사본·소유권 해시만 확인합니다' });
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') diagnostics.push({ file: display(path.join(folder, '.compiled.json')), line: 1, level: 'error', code: 'S026', message: String(error) }); }
  }
  if (expressions) for (const character of stories.flatMap(s => s.characters)) {
    try {
      let fallback: unknown;
      let unavailable = !settings?.artRoot || diagnostics.some(d=>d.code==='S039');
      if (character.art && settings?.artRoot) {
        try { const assetRoot = await realpath(path.resolve(folder,settings.artRoot)); const characterFile = await realpath(path.join(assetRoot,character.art,'character.json')); if (!characterFile.startsWith(assetRoot+path.sep)) throw new Error('캐릭터 경로가 artRoot 밖을 가리킵니다'); const data = JSON.parse(await readFile(characterFile, 'utf8')); fallback = data.defaultExpression; }
        catch (error) { if (!allowMissingArt || !['ENOENT','EACCES','EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; unavailable = true; }
      }
      if (fallback === undefined && allowMissingArt && unavailable) fallback = parseManifest(await readFile(path.join(folder, '.compiled.json'), 'utf8')).defaultExpressions?.[character.id];
      if (fallback !== undefined) { if (typeof fallback !== 'string') throw new Error('defaultExpression은 문자열이어야 합니다'); character.assetFace = normalizeExpression(fallback, expressions); }
      if (character.face !== undefined) normalizeExpression(character.face, expressions);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') diagnostics.push({ ...character, code: 'S007', level: 'error', message: String(error) }); }
  }
  let battleTroops: Set<string> | undefined;
  const battlePath = path.join(folder, '..', 'battle.json');
  try { const battle = JSON.parse(await readFile(battlePath, 'utf8')) as { troops?: Record<string, unknown> }; battleTroops = new Set(Object.keys(battle.troops ?? {})); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') io(battlePath, error); }
  let resolvedTiles: unknown;
  let legend: Set<string> | undefined;
  const tilesFile = path.join(folder,'tiles.json');
  let tileText: string | undefined;
  try { tileText = await readFile(tilesFile,'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') io(tilesFile,error); }
  if (tileText !== undefined) try {
    const tiles = JSON.parse(tileText);
    if (tiles.legend || tiles.tilesets) {
      for (const set of Object.values(tiles.tilesets ?? {}) as {image:string;columns:number;tileSize:number;spacing?:number;rows?:number}[]) {
        if (typeof set.image !== 'string' || /(^\/|\\\\|\.\.)/.test(set.image)) throw new Error('타일셋 image는 팩 내부 상대 경로입니다');
        const {pngSize}=await import('../../engine/data/portraits'); const size=pngSize(await readFile(path.resolve(folder,'..',set.image)));
        const rows = (size.height+(set.spacing??0))/(set.tileSize+(set.spacing??0));
        if (!Number.isInteger(rows) || set.rows !== undefined && set.rows !== rows || size.width !== set.columns*set.tileSize+(set.columns-1)*(set.spacing??0)) throw new Error('타일셋 columns/rows·이미지 크기 불일치');
        set.rows = rows;
      }
      resolvedTiles=tiles; legend=new Set(Object.keys(parseLegend(tiles).legend));
    }
  } catch(error) { diagnostics.push({file:display(tilesFile),line:1,code:'S047',level:'error',message:String(error)}); }
  diagnostics.push(...lintStories(stories, { packId, expressions, config: settings, battleTroops, legend }));
  return { stories, expressions, config: settings, resolvedTiles, diagnostics: diagnostics.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code)) };
}

export async function lintPack(packId: string, root = process.cwd()): Promise<Diagnostic[]> { return (await readStories(packId, root)).diagnostics; }
