import { schemaErrors } from '../validator/schemaErrors';
import type { Static } from '@sinclair/typebox';
import { ScenarioSchema } from '../schema/scenario';
import type { SaveExpect } from '../schema/scenario';
import { ConditionSchema, CommandSchema } from '../schema/events';
import type { ValidatedPack } from '../validator/types';
import type { InputFrame, Action } from '@engine/api';
import type { Dir } from '@engine/api';
import type { Condition } from '../events';
export interface ScenarioGame {
  readonly player: { readonly x: number; readonly y: number; readonly dir: Dir };
  readonly map: { readonly id: string };
  readonly main: { readonly running: boolean };
  readonly message: { readonly opened: boolean };
  readonly choice: { readonly opened: boolean; readonly snapshot: { options: readonly { index: number }[]; selected: number } | null };
  readonly snapshot: { readonly message: { text: string } | null };
  reload?(): void;
  expectSave?(condition: SaveExpect): boolean;
  tick(input: InputFrame): void;
  evaluate(condition: Condition, scope: { mapId: string; id: string } | null): boolean;
}
export type Scenario = Static<typeof ScenarioSchema>;
export type ScenarioFactory = (pack: ValidatedPack, start: ValidatedPack['game']['start'], state: ValidatedPack['game']['state']) => ScenarioGame;
export async function runScenario(pack: ValidatedPack, value: unknown, factory: ScenarioFactory): Promise<void> {
  const errors = schemaErrors(ScenarioSchema, [ConditionSchema, CommandSchema], value);
  if (errors.length) throw new Error(`Invalid scenario: ${errors.map(error => error.path + ' ' + error.message).join('; ')}`);
  const scenario = value as Scenario;
  const start = scenario.start ?? pack.game.start;
  const state = { flags: { ...pack.game.state.flags, ...scenario.state?.flags }, vars: { ...pack.game.state.vars, ...scenario.state?.vars } };
  for (const name of Object.keys(state.flags)) if (!Object.hasOwn(pack.game.state.flags, name)) throw new Error(`Unknown scenario flag: ${name}`);
  for (const name of Object.keys(state.vars)) if (!Object.hasOwn(pack.game.state.vars, name)) throw new Error(`Unknown scenario variable: ${name}`);
  const game = factory(pack, start, state);
  const tick = async (held: Action[] = [], pressed: Action[] = []) => { game.tick({ held: new Set(held), pressed: new Set(pressed) }); await Promise.resolve(); };
  const press = async (action: Action) => { await tick([action], [action]); await tick(); };
  const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };
  for (const [index, step] of scenario.steps.entries()) {
    try {
      if ('press' in step) await press(step.press);
      else if ('hold' in step) for (let i = 0; i < step.frames; i++) await tick([step.hold], i === 0 ? [step.hold] : []);
      else if ('wait' in step) for (let i = 0; i < step.wait; i++) await tick();
      else if ('walk' in step) for (const direction of step.walk) {
        const { x, y } = game.player; let count = 0;
        do { await tick([direction], count === 0 ? [direction] : []); count++; } while (game.player.x === x && game.player.y === y && count < 120);
        assert(game.player.x !== x || game.player.y !== y, 'walk exceeded 120 ticks');
      }
      else if ('advanceText' in step) {
        let ticks = 0;
        while (game.message.opened && !game.choice.opened && ticks < 1200) { await press('ok'); ticks += 2; }
        assert(!game.message.opened || game.choice.opened, 'advanceText exceeded 1200 ticks');
      }
      else if ('choose' in step) {
        assert(game.choice.opened && !!game.choice.snapshot?.options.some(option => option.index === step.choose), 'Choice is closed or index hidden');
        let count = 0;
        while (game.choice.snapshot?.selected !== step.choose && count++ < 6) await press('down');
        assert(game.choice.snapshot?.selected === step.choose, 'Unable to select choice'); await press('ok');
      }
      else if ('reload' in step) { if (!game.reload) throw new Error('Reload session unavailable'); game.reload(); }
      else if ('expectSave' in step) { if (!game.expectSave) throw new Error('Save session unavailable'); assert(game.expectSave(step.expectSave), 'Saved condition false'); }
      else if ('settle' in step) {
        let count = 0;
        while ((game.main.running || game.message.opened || game.choice.opened) && count++ < 600) await tick();
        assert(!game.main.running && !game.message.opened && !game.choice.opened, 'settle exceeded 600 ticks');
      }
      else {
        const e = step.expect;
        if ('textContains' in e) assert(!!game.snapshot.message?.text.includes(e.textContains), 'Expected text not open');
        else if ('map' in e && !('self' in e)) {
          assert(game.map.id === e.map, `Expected map ${e.map}`);
          for (const field of ['x', 'y', 'dir'] as const) if (e[field] !== undefined) assert(game.player[field] === e[field], `Expected ${field} ${e[field]}`);
        } else assert(game.evaluate(e as Condition, 'self' in e && 'map' in e ? { mapId: e.map, id: e.event } : null), 'Condition false');
      }
    } catch (error) { throw new Error(`${scenario.name}, step ${index}, map ${game.map.id} (${game.player.x},${game.player.y}), message=${game.message.opened}, choice=${game.choice.opened}: ${String(error)}`); }
  }
}
