import { FsSource } from './fsSource';
import { packIds } from './packs';
import { nodePluginRuntime } from './loadPlugins';
import { validatePack } from '../engine/data/validator/validate';
import { runScenario } from '../engine/data/scenarios/run';
import { scenarioGameWithPlugins } from './scenarioGame';
try {
  for (const id of await packIds()) {
    const source = new FsSource(`packs/${id}`), plugins = await nodePluginRuntime(source, `packs/${id}`);
    const { diagnostics, pack } = await validatePack(source, id, plugins.validationOptions);
    if (!pack) throw new Error(`${id} validation failed: ${diagnostics.filter(result => result.level === 'error').map(result => result.code + ' ' + result.file + result.pointer).join('; ')}`);
    const files = (await source.listFiles()).filter(file => /^tests\/.*\.scenario\.json$/.test(file)).sort();
    for (const file of files) { const runtime = await nodePluginRuntime(source, `packs/${id}`);
      await runScenario(pack, await source.readJson(file), scenarioGameWithPlugins(runtime)); console.log(`${id}/${file}: passed`); }
  }
} catch (error) { console.error(String(error)); process.exitCode = 1; }
