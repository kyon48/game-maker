import { validatePack } from '../engine/data/validator/validate';
import { FsSource } from './fsSource';
import { builtinCatalog } from './catalog';
import { packIds } from './packs';
try {
  for (const id of await packIds()) {
    const { diagnostics } = await validatePack(new FsSource(`packs/${id}`), id, { commands: builtinCatalog() });
    for (const result of diagnostics) console.log(`${id}/${result.file}${result.pointer} ${result.level} ${result.code}: ${result.message}`);
    if (diagnostics.some(result => result.level === 'error')) process.exitCode = 1;
    else console.log(`${id}: validation passed`);
  }
} catch (error) { console.error(String(error)); process.exitCode = 1; }
