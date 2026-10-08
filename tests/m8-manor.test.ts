import { beforeAll, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { FsSource } from '../tools/fsSource';
import { nodePluginRuntime } from '../tools/loadPlugins';
import { validatePack } from '../engine/data/validator/validate';
import type { ValidatedPack } from '../engine/data/validator/types';
import { runScenario } from '../engine/data/scenarios/run';
import { Game } from '../engine/sim/Game';
import type { PersistentState } from '../engine/sim/state/loadSave';
import { loadSave } from '../engine/sim/state/loadSave';
import { integerScale } from '../engine/platform/scale';
import { camera } from '../engine/sim/world/Camera';
let pack: ValidatedPack;
beforeAll(async () => {
  const source = new FsSource('packs/manor'), runtime = await nodePluginRuntime(source, 'packs/manor');
  const result = await validatePack(source, 'manor', runtime.validationOptions);
  expect(result.diagnostics).toEqual([]); pack = result.pack!;
});
const clueFlags = ['clue_clock', 'clue_seal', 'clue_letter', 'clue_ledger', 'clue_receipt'];
it.each([
  [{}, [2, 3]],
  [{ clue_clock: true, clue_seal: true, clue_letter: true }, [2, 3]],
  [Object.fromEntries(clueFlags.map(flag => [flag, true])), [0, 2, 3]],
  [{ ...Object.fromEntries(clueFlags.map(flag => [flag, true])), trusted_archivist: true }, [0, 1, 2, 3]],
  [{ ...Object.fromEntries(clueFlags.map(flag => [flag, true])), clue_letter: false, trusted_archivist: true }, [2, 3]],
] as const)('final choices really hide unavailable evidence/trust branches for %j', async (flags, indices) => {
  const runtime = await nodePluginRuntime(new FsSource('packs/manor'), 'packs/manor');
  let game: Game;
  await runScenario(pack, { name: 'choice visibility', start: { map: 'hall', x: 18, y: 19, dir: 'down' }, state: { flags: { introduced: true, ...flags } }, steps: [{ press: 'ok' }, { advanceText: true }] }, (pack, start, state) => {
    game = new Game({ ...pack.game, start, state }, pack.maps.get(start.map)!, pack.characters, pack.events.get(start.map)!, { plugins: runtime, skin: pack.skin, commonEvents: pack.common });
    return game;
  });
  expect(game!.choice.snapshot?.options.map(option => option.index)).toEqual(indices);
});
it('full investigation saves through the real command and reload preserves clues/self flags but resets running events', async () => {
  const runtime = await nodePluginRuntime(new FsSource('packs/manor'), 'packs/manor');
  const saves: PersistentState[] = [];
  await runScenario(pack, JSON.parse(await readFile('packs/manor/tests/truth_full_route.scenario.json', 'utf8')), (pack, start, state) => new Game({ ...pack.game, start, state }, pack.maps.get(start.map)!, pack.characters, pack.events.get(start.map)!, {
    plugins: runtime, skin: pack.skin, commonEvents: pack.common, save: state => saves.push(structuredClone(state)),
    mapLoader: { load: async id => ({ data: pack.maps.get(id)!, events: pack.events.get(id)! }) },
  }));
  expect(saves).toHaveLength(1); const saved = saves[0]!;
  expect(saved).toMatchObject({ map: 'hall', x: 24, y: 17, dir: 'up', flags: { finished: false, trusted_archivist: true } });
  for (const flag of clueFlags) expect(saved.flags[flag]).toBe(true);
  expect(saved.selfFlags).toEqual({ 'hall:clock:examined': true, 'study:seal:examined': true, 'study:letter:examined': true, 'library:ledger:examined': true, 'greenhouse:receipt:examined': true });
  const state = loadSave(JSON.stringify({ ...saved, packId: 'manor', saveVersion: 1, gameVersion: '0.1.0' }), pack.game, pack.events, pack.maps).state!;
  expect(state).toEqual(saved);
  const freshRuntime = await nodePluginRuntime(new FsSource('packs/manor'), 'packs/manor');
  const reloaded = new Game({ ...pack.game, start: { map: state.map, x: state.x, y: state.y, dir: state.dir }, state: { flags: state.flags, vars: state.vars } }, pack.maps.get(state.map)!, pack.characters, pack.events.get(state.map)!, { plugins: freshRuntime, skin: pack.skin, commonEvents: pack.common, selfFlags: state.selfFlags });
  expect(reloaded.main.running).toBe(false); expect(reloaded.snapshot.message).toBeNull(); expect(reloaded.snapshot.fade).toBe(0);
  expect(reloaded.evaluate({ plugin: 'x_enough_clues', args: { minimum: 5 } }, null)).toBe(true);
});
it('480×270 fits a 1920×1080 viewport at 4× and smaller/wider rooms use existing camera rules', () => {
  expect(pack.game.screen).toEqual({ width: 480, height: 270 });
  expect(integerScale(480, 270, 1920, 1080)).toBe(4);
  expect(camera({ x: 200, y: 150 }, { width: 448, height: 288 }, pack.game.screen)).toEqual({ x: -16, y: 15 });
  expect(camera({ x: 240, y: 128 }, { width: 480, height: 256 }, pack.game.screen)).toEqual({ x: 0, y: -7 });
});
