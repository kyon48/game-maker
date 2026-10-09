import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { afterEach, expect, it } from 'vitest';
import { lintPack } from '../tools/story/files';
const valid = await readFile('tests/fixtures/story/valid.story.md', 'utf8');
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function setup(text = valid) {
  const root = await mkdtemp(path.join(tmpdir(), 'story-lint-')); temporary.push(root);
  const folder = path.join(root, 'packs/lantern/story'); await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'main.story.md'), text);
  return { root, folder };
}
const tsx = createRequire(import.meta.url).resolve('tsx');
const cli = fileURLToPath(new URL('../tools/story/index.ts', import.meta.url));
function run(root: string, args = ['lint', 'lantern']) {
  // Resolve tsx in this repo while deliberately launching from another working directory.
  return spawnSync(process.execPath, ['--import', tsx, cli, ...args], { cwd: root, encoding: 'utf8' });
}
it('CLI returns 0 for warnings, prints file:line code message and never changes inputs', async () => {
  const { root, folder } = await setup(); const result = run(root);
  expect(result.status).toBe(0); expect(result.stdout).toMatch(/^packs\/lantern\/story\/main.story.md:1 S015 경고:/);
  expect(result.stdout.match(/S015/g)).toHaveLength(1); expect(await readFile(path.join(folder, 'main.story.md'), 'utf8')).toBe(valid);
});
it('CLI returns 1 for semantic errors and reports the original source line', async () => {
  const { root } = await setup(valid.replace('@set met_elder', '@set missing'));
  const result = run(root); expect(result.status).toBe(1);
  const line = valid.split('\n').findIndex(row => row.includes('@set met_elder')) + 1;
  expect(result.stdout).toContain(`packs/lantern/story/main.story.md:${line} S002`);
});
it('CLI returns 1 for syntax errors without exposing a stack trace', async () => {
  const { root } = await setup(valid.replace('@cmd {"cmd":"show_map_name"}', '@cmd {broken}'));
  const result = run(root); expect(result.status).toBe(1); expect(result.stdout).toContain(' S001 '); expect(result.stderr).toBe('');
});
it('loads artRoot relative to story.config.json and accepts every manifest alias', async () => {
  const { root, folder } = await setup(); const art = path.join(root, 'asset-library'); await mkdir(art);
  await writeFile(path.join(art, 'expressions.json'), JSON.stringify({ expressions: [
    { key: 'suspicious', en: 'Suspicious', ko: '의심' }, { key: 'determined', en: 'Determined', ko: '결의' },
    { key: 'soft_smile', en: 'Soft Smile', ko: '부드러운 미소' }, { key: 'unimpressed', en: 'Unimpressed', ko: '시큰둥' },
    { key: 'neutral', en: 'Neutral', ko: '무표정' }, { key: 'startled', en: 'Startled', ko: '깜짝' },
  ], core: { surprised: 'startled' } }));
  await writeFile(path.join(folder, 'story.config.json'), JSON.stringify({ artRoot: '../../../asset-library' }));
  expect(await lintPack('lantern', root)).toEqual([]); expect(run(root).status).toBe(0);
  await writeFile(path.join(folder, 'main.story.md'), valid.replace('(의심)', '(모르는 표정)'));
  expect(run(root).stdout).toContain(' S007 '); expect(run(root).status).toBe(1);
});
it.each(['[]', '{broken}', '{"artRoot":42}', '{"artRoot":""}'])('reports invalid config %s as S019', async config => {
  const { root, folder } = await setup(); await writeFile(path.join(folder, 'story.config.json'), config);
  const diagnostics = await lintPack('lantern', root); expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'S019', file: 'packs/lantern/story/story.config.json', line: 1 }));
  expect(diagnostics.some(d => d.code === 'S015')).toBe(false); expect(run(root).status).toBe(1);
});
it('an artRoot with a missing or malformed manifest fails instead of silently skipping', async () => {
  const { root, folder } = await setup(); await writeFile(path.join(folder, 'story.config.json'), '{"artRoot":"assets"}');
  expect(await lintPack('lantern', root)).toContainEqual(expect.objectContaining({ code: 'S019', file: 'packs/lantern/story/assets/expressions.json' }));
  await mkdir(path.join(folder, 'assets')); await writeFile(path.join(folder, 'assets/expressions.json'), '{}');
  expect(run(root).stdout).toContain(' S019 '); expect(run(root).status).toBe(1);
});
it('all files share declarations, chapter checks and one missing-art warning', async () => {
  const { root, folder } = await setup(); await writeFile(path.join(folder, 'second.story.md'), '## 1장. 꺼진 불빛\n### 다시 만나다 @ pier\n> 새로운 대화');
  const diagnostics = await lintPack('lantern', root); expect(diagnostics.filter(d => d.code === 'S015')).toHaveLength(1);
  expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'S013', file: 'packs/lantern/story/second.story.md', line: 1 }));
});
it('missing folder, empty folder, invalid pack ID and unsupported command exit with 1', async () => {
  const { root, folder } = await setup();
  expect(run(root, ['compile', 'lantern']).status).toBe(1); expect(run(root, ['lint', '../outside']).status).toBe(1);
  expect(run(root, ['lint', 'missing']).status).toBe(1); await rm(path.join(folder, 'main.story.md'));
  const result = run(root); expect(result.status).toBe(1); expect(result.stdout).toContain(' S019 ');
});
