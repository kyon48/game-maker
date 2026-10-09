import { lintPack } from './files';
const [command, packId, ...extra] = process.argv.slice(2);
if (command !== 'lint' || !packId || extra.length) {
  console.error('story:1 S019 사용법: npm run story -- lint <packId>'); process.exitCode = 1;
} else {
  try {
    const diagnostics = await lintPack(packId);
    for (const d of diagnostics) console.log(`${d.file}:${d.line} ${d.code} ${d.level === 'warning' ? '경고: ' : ''}${d.message}`);
    if (diagnostics.some(d => d.level === 'error')) process.exitCode = 1;
  } catch (error) { console.error(`story:1 S019 ${String(error)}`); process.exitCode = 1; }
}
