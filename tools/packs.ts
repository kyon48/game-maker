import { packLocations, packLocation } from './packPaths';
export async function packIds(argument = process.argv[2], root = process.cwd(), includeExternal = process.argv.includes('--include-external')): Promise<string[]> {
  const locations = packLocations(root);
  if (argument === '--all') return [...locations.values()].filter(p => includeExternal || !p.external).map(p => p.id).sort();
  if (!argument) throw new Error('Specify <packId> or --all');
  packLocation(argument, root); return [argument];
}
