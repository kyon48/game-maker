import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { createRequire } from 'node:module';
import { jsonBytes } from './compile';
export async function newStory(id: string, options: { dir?: string; title?: string; root?: string; provider?: 'fake' | 'macos-say' } = {}): Promise<string> {
  if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error('Invalid pack id');
  const root = options.root ?? process.cwd(), directory = path.resolve(options.dir ?? path.join(root, 'packs', id)), title = options.title ?? id;
  await mkdir(path.dirname(directory), { recursive: true }); await mkdir(directory); // Refuse every existing destination.
  const put = async (file: string, value: unknown) => { const destination = path.join(directory, file); await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, typeof value === 'string' ? value : jsonBytes(value)); };
  await put('game.json', { id, title, version: '0.1.0', formatVersion: 1, tileSize: 16, screen: { width: 480, height: 270 }, maps: ['room'], start: { map: 'room', x: 3, y: 3, dir: 'right' }, player: 'hero', plugins: [], labels: { continue: '이어하기', newGame: '처음부터' }, state: { flags: {}, vars: {} } });
  await put('characters.json', { hero: { sheet: 'assets/characters/hero.png', frameWidth: 16, frameHeight: 16, moveTicks: 8 }, guide: { placeholder: '#e9bb72' } });
  await put('skin.json', JSON.parse(await readFile(path.join(root, 'packs/demo/skin.json'), 'utf8')));
  await put('story/story.config.json', { $comment: '얼굴 에셋을 준비하면 artRoot: ../../art/characters 를 추가하세요 (설정 파일 기준 경로).', voices: { hero: { provider: options.provider ?? 'macos-say', voice: 'Yuna' }, narrator: { provider: options.provider ?? 'macos-say', voice: 'Yuna' } }, narrator: 'narrator' });
  await put('story/tiles.json', { wall: 1, floor: 2, door: 3, tileset: 'assets/tiles.tsj' });
  await put('assets/tiles.tsj', { tilewidth: 16, tileheight: 16, tilecount: 8, columns: 8, image: 'tiles.png', imagewidth: 128, imageheight: 16 });
  await put('common-events.json', {});
  await put('story/main.story.md', `@pack ${id} ${JSON.stringify(title)}\n@player hero\n@screen 480x270\n@character hero "여행자" voice=hero\n@character guide "안내자"\n@flag finished\n\n@location room "첫 장소"\n@layout\n##########\n#........#\n#........#\n#..s.g...#\n#........#\n##########\n@end\n@anchor s = start\n@anchor g = guide_spot\n\n## 1장. 시작\n### 첫 만남 @ room\n> 여행자는 작은 방에 들어와 새로운 이야기를 시작했습니다.\n@waitNarration\n@event welcome at guide_spot character=guide once\n  여행자: 여기가 이야기의 시작이군요.\n  : 이 원고를 고쳐 나만의 장면을 만드세요.\n  @set finished\n@end\n`);
  await put('CREDITS.md', '# 출처\n\n- 이야기·자료: {원작·작가·출처 또는 창작 표시}\n- 타일·캐릭터: 이 레포의 생성 스크립트로 생성한 원본.\n- Galmuri11: quiple, SIL OFL-1.1, https://github.com/quiple/galmuri (assets/fonts/OFL.txt).\n');
  await put('README.md', '# 제작 순서\n\n1. story/main.story.md 수정 → story lint.\n2. story.config.json에서 voices를 배정. 얼굴이 필요하면 artRoot에 읽을 수 있는 에셋 경로를 넣고 인물 art를 배정. artRoot는 설정 파일 기준 상대 경로(예: ../../art/characters).\n3. npm run story -- build ' + id + '\n4. npm run release -- ' + id + '\n5. release/review.md를 검수한 뒤 업로드. CREDITS의 빈 칸을 채우세요.\n');
  const run = promisify(execFile);
  for (const [script, file] of [['generate-tiles.ts', 'assets/tiles.png'], ['generate-character.ts', 'assets/characters/hero.png']]) {
    await mkdir(path.dirname(path.join(directory, file!)), { recursive: true });
    await run(process.execPath, ['--import', createRequire(import.meta.url).resolve('tsx'), path.join(root, 'tools', script!), path.join(directory, file!)]);
  }
  const require = createRequire(import.meta.url), fonts = path.join(path.dirname(require.resolve('galmuri/package.json')), 'dist');
  await mkdir(path.join(directory, 'assets/fonts'), { recursive: true });
  await copyFile(path.join(fonts, 'Galmuri11.woff2'), path.join(directory, 'assets/fonts/Galmuri11.woff2'));
  await copyFile(path.join(fonts, 'LICENSE.txt'), path.join(directory, 'assets/fonts/OFL.txt'));
  return directory;
}
