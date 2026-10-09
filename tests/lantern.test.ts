import { expect, it } from 'vitest';
import { FsSource } from '../tools/fsSource';
import { validatePack } from '../engine/data/validator/validate';
import { builtinCatalog } from '../tools/catalog';
import { runScenario } from '../engine/data/scenarios/run';
import { scenarioGame } from '../tools/scenarioGame';
it.each([0, 1])('the compiled lantern ending choice %s reaches only its own ending flag', async choice => {
  const { diagnostics, pack } = await validatePack(new FsSource('packs/lantern'), 'lantern', { commands: builtinCatalog() }); expect(diagnostics).toEqual([]);
  await runScenario(pack!, { name: `Lantern ending ${choice}`, start: { map: 'garden', x: 9, y: 7, dir: 'up' }, state: { flags: { met_elder: true, lamp_lit: true }, vars: { trust: choice === 0 ? 1 : -1 } }, steps: [
    { press: 'ok' }, { advanceText: true }, { choose: choice }, { advanceText: true }, { settle: true },
    { expect: { flag: 'ending_public', is: choice === 0 } }, { expect: { flag: 'ending_kept', is: choice === 1 } },
  ] }, scenarioGame);
});
