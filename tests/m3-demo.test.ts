import { expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { Game } from '../engine/sim/Game';
import { loadTiled } from '../engine/data/loader/tiled';
import { evaluate } from '../engine/sim/event/conditions';
import type { Action } from '../engine/sim/ports';
import type { GameConfig, EventDefinition } from '../engine/data/game';
import type { Characters } from '../engine/data/characters';
import type { Skin } from '../engine/data/skin';
import type { Condition } from '../engine/data/events';
const json = (path: string) => JSON.parse(readFileSync(`packs/demo/${path}`, 'utf8'));
const empty = { held: new Set<Action>(), pressed: new Set<Action>() };
type Expectation = Condition & { map?: string; event?: string };
interface Step { press?: Action; wait?: number; advanceText?: boolean; choose?: number; settle?: boolean; expect?: Expectation | { textContains: string } }
interface Scenario { name: string; start: GameConfig['start']; steps: Step[] }
const scenarios = readdirSync('packs/demo/tests').filter(path => path.endsWith('.scenario.json'));
it.each(scenarios)('executes demo acceptance scenario %s through headless Game', async file => {
  const scenario = json(`tests/${file}`) as Scenario;
  const config = json('game.json') as GameConfig; config.start = scenario.start;
  const map = await loadTiled({ readJson: async path => json(path), exists: async () => true }, `maps/${config.start.map}.tmj`, config.tileSize);
  const game = new Game(config, map, json('characters.json') as Characters, (json(`maps/${config.start.map}.events.json`) as { events: EventDefinition[] }).events, { skin: json('skin.json') as Skin });
  const press = (action: Action) => { game.tick({ held: new Set([action]), pressed: new Set([action]) }); game.tick(empty); };
  for (const step of scenario.steps) {
    if (step.press) press(step.press);
    if (step.wait) for (let i = 0; i < step.wait; i++) game.tick(empty);
    if (step.advanceText) {
      let count = 0;
      while (game.message.opened && !game.choice.opened && count++ < 1200) press('ok');
      expect(count, scenario.name).toBeLessThan(1200);
    }
    if (step.choose !== undefined) {
      expect(game.choice.snapshot?.options.some(option => option.index === step.choose)).toBe(true);
      let count = 0;
      while (game.choice.snapshot?.selected !== step.choose && count++ < 6) press('down');
      expect(game.choice.snapshot?.selected).toBe(step.choose); press('ok');
    }
    if (step.settle) {
      let count = 0;
      while ((game.main.running || game.message.opened || game.choice.opened) && count++ < 600) game.tick(empty);
      expect(count, scenario.name).toBeLessThan(600);
    }
    if (step.expect) {
      if ('textContains' in step.expect) expect(game.snapshot.message?.text).toContain(step.expect.textContains);
      else expect(evaluate(step.expect, game.state, step.expect.event ? { mapId: step.expect.map!, id: step.expect.event } : null), scenario.name).toBe(true);
    }
  }
});
it('copies exact upstream font and license into pack, with no runtime node_modules reference', () => {
  expect(readFileSync('packs/demo/assets/fonts/Galmuri11.woff2').equals(readFileSync('node_modules/galmuri/dist/Galmuri11.woff2'))).toBe(true);
  expect(readFileSync('packs/demo/assets/fonts/OFL.txt').equals(readFileSync('node_modules/galmuri/dist/LICENSE.txt'))).toBe(true);
  expect(readFileSync('packs/demo/CREDITS.md', 'utf8')).toContain('Lee Minseo');
});
