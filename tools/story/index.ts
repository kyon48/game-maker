import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { filmPack } from './film-project';
import { lintPack } from './files';
import { compilePack, storyPackIds } from './project';
import { validateCompiledPack } from './validation';
import type { Diagnostic } from './ast';
const [command, packId, ...extra] = process.argv.slice(2);
const print = (diagnostics: readonly Diagnostic[]) => {
  for (const d of diagnostics) console.log(`${d.file}:${d.line} ${d.code} ${d.level === 'warning' ? '경고: ' : ''}${d.message}`);
  const failed = diagnostics.some(d => d.level === 'error'); if (failed) process.exitCode = 1; return failed;
};
async function runChecks(id: string): Promise<void> {
  for (const tool of ['scenarios', 'films']) {
    try {
      const script = fileURLToPath(new URL(`../${tool}.ts`, import.meta.url));
      const result = await promisify(execFile)(process.execPath, ['--import', import.meta.resolve('tsx'), script, id], { maxBuffer: 10 * 1024 * 1024 });
      process.stdout.write(result.stdout); process.stderr.write(result.stderr);
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string };
      process.stdout.write(failure.stdout ?? ''); process.stderr.write(failure.stderr ?? String(error));
      process.exitCode = 1; break;
    }
  }
}
const usage = () => { console.error('story:1 S019 사용법: npm run story -- lint <packId> | compile <packId> [--force] [--force-maps] | film <packId> [--name main] [--force] | build <packId> | check <packId>|--all'); process.exitCode = 1; };
try {
  if (command === 'lint' && packId && !extra.length) print(await lintPack(packId));
  else if (command === 'compile' && packId && extra.every(value => ['--force', '--force-maps'].includes(value))) {
    const diagnostics = await compilePack(packId, process.cwd(), { force: extra.includes('--force'), forceMaps: extra.includes('--force-maps') });
    if (!print(diagnostics) && !await validateCompiledPack(packId)) process.exitCode = 1;
  } else if (command === 'film' && packId) {
    let name = 'main', force = false, valid = true;
    for (let i = 0; i < extra.length; i++) {
      if (extra[i] === '--name' && extra[i + 1]) name = extra[++i]!;
      else if (extra[i] === '--force') force = true;
      else valid = false;
    }
    if (!valid) usage(); else if (!print(await filmPack(packId, process.cwd(), name, force))) await runChecks(packId);
  } else if (command === 'build' && packId && !extra.length) {
    if (!print(await lintPack(packId)) && !print(await compilePack(packId)) && !print(await filmPack(packId)) && await validateCompiledPack(packId)) {
      await runChecks(packId);
    } else process.exitCode = 1;
  } else if (command === 'check' && packId && !extra.length) {
    const ids = packId === '--all' ? await storyPackIds() : [packId];
    for (const id of ids) if (!print(await compilePack(id, process.cwd(), { check: true }))) console.log(`${id}: story check passed`);
  } else usage();
} catch (error) { console.error(`story:1 S019 ${String(error)}`); process.exitCode = 1; }
