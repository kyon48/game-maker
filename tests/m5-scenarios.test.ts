import { expect, it } from 'vitest';
import { FsSource } from '../tools/fsSource';
import { builtinCatalog } from '../tools/catalog';
import { validatePack } from '../engine/data/validator/validate';
import { runScenario } from '../engine/data/scenarios/run';
import { scenarioGame } from '../tools/scenarioGame';
it('runs all demo scenarios with the production headless runner', async () => {
  const source = new FsSource('packs/demo');
  const { diagnostics, pack } = await validatePack(source, 'demo', { commands: builtinCatalog() });
  expect(diagnostics).toEqual([]); expect(pack).toBeDefined();
  const files = (await source.listFiles()).filter(file => file.endsWith('.scenario.json'));
  expect(files.length).toBeGreaterThanOrEqual(3);
  for (const file of files) await runScenario(pack!, await source.readJson(file), scenarioGame);
});
it('reports scenario name, step and current game state on failure', async () => {
  const { pack } = await validatePack(new FsSource('tests/fixtures/base'), 'base', { commands: builtinCatalog() });
  await expect(runScenario(pack!, { name: 'blocked walk', start: { map: 'map', x: 0, y: 0, dir: 'up' }, steps: [{ walk: ['up'] }] }, scenarioGame)).rejects.toThrow('blocked walk, step 0, map map (0,0), message=false, choice=false');
});
