import { packIds } from './packs';
import { rewritePack } from './migratePack';
import { FsSource } from './fsSource';
try {
  const argument = process.argv[2];
  if (process.argv.length > 3) throw new Error('Usage: migrate-pack <packId>|--all');
  const roots = (await packIds(argument)).map(id => `packs/${id}`);
  if (argument === '--all' && await new FsSource('tests/fixtures/base').exists('game.json')) roots.push('tests/fixtures/base');
  for (const root of roots) { await rewritePack(root); console.log(`${root}: migrated`); }
} catch (error) { console.error(String(error)); process.exitCode = 1; }
