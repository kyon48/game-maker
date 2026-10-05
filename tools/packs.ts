import { readdir } from 'node:fs/promises';
export async function packIds(argument = process.argv[2]): Promise<string[]> {
  if (argument === '--all') return (await readdir('packs', { withFileTypes: true })).filter(entry => entry.isDirectory() && !entry.name.startsWith('_')).map(entry => entry.name).sort();
  if (!argument || !/^[a-z][a-z0-9_]*$/.test(argument)) throw new Error('Specify <packId> or --all');
  return [argument];
}
