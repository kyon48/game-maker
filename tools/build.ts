import { buildPack } from './buildPack';
import { packIds } from './packs';
try {
  const args = process.argv.slice(2), target = args.shift();
  let base: string | undefined;
  if (args.length) { if (args.length !== 2 || args[0] !== '--base' || !args[1]) throw new Error('Usage: build <packId>|--all [--base <path>]'); base = args[1]; }
  for (const id of await packIds(target)) await buildPack(id, { base });
} catch (error) { console.error(String(error)); process.exitCode = 1; }
