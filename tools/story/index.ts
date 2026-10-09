import { lintPack } from './files';
import { compilePack, storyPackIds } from './project';
import { validateCompiledPack } from './validation';
import type { Diagnostic } from './ast';
const [command, packId, ...extra] = process.argv.slice(2);
const print = (diagnostics: readonly Diagnostic[]) => {
  for (const d of diagnostics) console.log(`${d.file}:${d.line} ${d.code} ${d.level === 'warning' ? '경고: ' : ''}${d.message}`);
  const failed = diagnostics.some(d => d.level === 'error'); if (failed) process.exitCode = 1; return failed;
};
const usage = () => { console.error('story:1 S019 사용법: npm run story -- lint <packId> | compile <packId> [--force] [--force-maps] | check <packId>|--all'); process.exitCode = 1; };
try {
  if (command === 'lint' && packId && !extra.length) print(await lintPack(packId));
  else if (command === 'compile' && packId && extra.every(value => ['--force', '--force-maps'].includes(value))) {
    const diagnostics = await compilePack(packId, process.cwd(), { force: extra.includes('--force'), forceMaps: extra.includes('--force-maps') });
    if (!print(diagnostics) && !await validateCompiledPack(packId)) process.exitCode = 1;
  } else if (command === 'check' && packId && !extra.length) {
    const ids = packId === '--all' ? await storyPackIds() : [packId];
    for (const id of ids) if (!print(await compilePack(id, process.cwd(), { check: true }))) console.log(`${id}: story check passed`);
  } else usage();
} catch (error) { console.error(`story:1 S019 ${String(error)}`); process.exitCode = 1; }
