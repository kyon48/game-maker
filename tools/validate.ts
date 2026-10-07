import { validatePack } from '../engine/data/validator/validate';
import { FsSource } from './fsSource';
import { nodePluginRuntime } from './loadPlugins';
import { packIds } from './packs';
try {
  for (const id of await packIds()) {
    const source = new FsSource(`packs/${id}`), plugins = await nodePluginRuntime(source, `packs/${id}`);
    const { diagnostics } = await validatePack(source, id, plugins.validationOptions);
    for (const result of diagnostics) console.log(`${id}/${result.file}${result.pointer} ${result.level} ${result.code}: ${result.message}`);
    if (diagnostics.some(result => result.level === 'error')) process.exitCode = 1;
    else console.log(`${id}: validation passed`);
  }
} catch (error) { console.error(String(error)); process.exitCode = 1; }
