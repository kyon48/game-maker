import { FsSource } from './fsSource';
import { packIds } from './packs';
import { builtinCatalog } from './catalog';
import { validatePack } from '../engine/data/validator/validate';
import { runScenario } from '../engine/data/scenarios/run';
import { scenarioGame } from './scenarioGame';
try {
  for (const id of await packIds()) {
    const source = new FsSource(`packs/${id}`), { diagnostics, pack } = await validatePack(source, id, { commands: builtinCatalog() });
    if (!pack) throw new Error(`${id} validation failed: ${diagnostics.filter(result => result.level === 'error').map(result => result.code + ' ' + result.file + result.pointer).join('; ')}`);
    const files = (await source.listFiles()).filter(file => /^tests\/.*\.scenario\.json$/.test(file)).sort();
    for (const file of files) { await runScenario(pack, await source.readJson(file), scenarioGame); console.log(`${id}/${file}: passed`); }
  }
} catch (error) { console.error(String(error)); process.exitCode = 1; }
