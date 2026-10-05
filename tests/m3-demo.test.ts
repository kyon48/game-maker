import { expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { Game } from '../engine/sim/Game';
import { MapCache } from '../engine/data/loader/MapCache';
import type { Command } from '../engine/data/events';
import { evaluate } from '../engine/sim/event/conditions';
import type { Action } from '../engine/sim/ports';
import type { GameConfig, EventDefinition } from '../engine/data/game';
import type { Characters } from '../engine/data/characters';
import type { Skin } from '../engine/data/skin';
import type { Condition } from '../engine/data/events';
const json = (path: string) => JSON.parse(readFileSync(`packs/demo/${path}`, 'utf8'));
type Expectation = (Condition & { map?: string; event?: string }) | { map: string; x?: number; y?: number; dir?: string };
interface Step { press?: Action; hold?: Action; frames?: number; walk?: ('up' | 'down' | 'left' | 'right')[]; wait?: number; advanceText?: boolean; choose?: number; settle?: boolean; expect?: Expectation | { textContains: string } }
interface Scenario { name: string; start?: GameConfig['start']; state?: { flags?: Record<string, boolean>; vars?: Record<string, number> }; steps: Step[] }
const scenarios = readdirSync('packs/demo/tests').filter(path => path.endsWith('.scenario.json'));
it.each(scenarios)('executes demo acceptance scenario %s through headless Game', async file => {
  const scenario = json(`tests/${file}`) as Scenario;
  const config = json('game.json') as GameConfig;
  if (scenario.start) config.start = scenario.start;
  Object.assign(config.state.flags, scenario.state?.flags); Object.assign(config.state.vars, scenario.state?.vars);
  const events = new Map(config.maps.map(id => [id, (json(`maps/${id}.events.json`) as { events: EventDefinition[] }).events]));
  const cache = new MapCache({ readJson: async path => json(path), exists: async () => true }, config.tileSize, events);
  const game = new Game(config, await cache.load(config.start.map), json('characters.json') as Characters, events.get(config.start.map)!, {
    skin: json('skin.json') as Skin, commonEvents: json('common-events.json') as Record<string, { commands: Command[] }>,
    mapLoader: { load: async id => ({ data: await cache.load(id), events: events.get(id)! }) },
  });
  const tick = async (held: readonly Action[] = [], pressed: readonly Action[] = []) => {
    game.tick({ held: new Set(held), pressed: new Set(pressed) }); await Promise.resolve();
  };
  const press = async (action: Action) => { await tick([action], [action]); await tick(); };
  for (const step of scenario.steps) {
    if (step.press) await press(step.press);
    if (step.hold) for (let i = 0; i < step.frames!; i++) await tick([step.hold], i === 0 ? [step.hold] : []);
    if (step.walk) for (const direction of step.walk) {
      const x = game.player.x, y = game.player.y; let count = 0;
      do { await tick([direction], count === 0 ? [direction] : []); count++; } while (game.player.x === x && game.player.y === y && count < 120);
      expect(count, scenario.name).toBeLessThan(120);
    }
    if (step.wait) for (let i = 0; i < step.wait; i++) await tick();
    if (step.advanceText) {
      let count = 0;
      while (game.message.opened && !game.choice.opened && count++ < 1200) await press('ok');
      expect(count, scenario.name).toBeLessThan(1200);
    }
    if (step.choose !== undefined) {
      expect(game.choice.snapshot?.options.some(option => option.index === step.choose)).toBe(true);
      let count = 0;
      while (game.choice.snapshot?.selected !== step.choose && count++ < 6) await press('down');
      expect(game.choice.snapshot?.selected).toBe(step.choose); await press('ok');
    }
    if (step.settle) {
      let count = 0;
      while ((game.main.running || game.message.opened || game.choice.opened) && count++ < 600) await tick();
      expect(count, scenario.name).toBeLessThan(600);
    }
    if (step.expect) {
      if ('textContains' in step.expect) expect(game.snapshot.message?.text).toContain(step.expect.textContains);
      else if ('map' in step.expect && !('self' in step.expect)) {
        expect(game.map.id, scenario.name).toBe(step.expect.map);
        for (const field of ['x', 'y', 'dir'] as const) if (field in step.expect) expect(game.player[field], scenario.name).toBe((step.expect as { x?: number; y?: number; dir?: string })[field]);
      } else {
        const condition = step.expect as Condition & { map?: string; event?: string };
        expect(evaluate(condition, game.state, condition.event ? { mapId: condition.map!, id: condition.event } : null), scenario.name).toBe(true);
      }
    }
  }
});
it('copies exact upstream font and license into pack, with no runtime node_modules reference', () => {
  expect(readFileSync('packs/demo/assets/fonts/Galmuri11.woff2').equals(readFileSync('node_modules/galmuri/dist/Galmuri11.woff2'))).toBe(true);
  expect(readFileSync('packs/demo/assets/fonts/OFL.txt').equals(readFileSync('node_modules/galmuri/dist/LICENSE.txt'))).toBe(true);
  expect(readFileSync('packs/demo/CREDITS.md', 'utf8')).toContain('Lee Minseo');
});
