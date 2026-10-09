import { validatePack } from '../../engine/data/validator/validate';
import { FsSource } from '../fsSource';
import { nodePluginRuntime } from '../loadPlugins';
import path from 'node:path';
/** Same validator, plugin catalog and output contract as tools/validate.ts. */
export async function validateCompiledPack(packId: string, root = process.cwd()): Promise<boolean> {
  const folder = path.join(root, 'packs', packId), source = new FsSource(folder), plugins = await nodePluginRuntime(source, folder);
  const { diagnostics } = await validatePack(source, packId, plugins.validationOptions);
  for (const result of diagnostics) console.log(`${packId}/${result.file}${result.pointer} ${result.level} ${result.code}: ${result.message}`);
  if (diagnostics.some(result => result.level === 'error')) return false;
  console.log(`${packId}: validation passed`); return true;
}
