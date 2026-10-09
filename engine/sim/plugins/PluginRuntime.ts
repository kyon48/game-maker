import { Value } from '@sinclair/typebox/value';
import type { Static, TSchema } from '@sinclair/typebox';
import type { EngineApi, PluginModule, HookContext, SaveData, CommandDefinition, TextDefinition } from '@engine/api';
import { API_VERSION } from '../../data/apiVersion';
import { ConditionSchema, CommandSchema } from '../../data/schema/events';
import { registerBuiltins } from '../commands';
import { CommandRegistry } from '../event/CommandRegistry';
import type { GameState } from '../state/GameState';
import type { PersistentState } from '../state/loadSave';
import { publicContext, readonlyState } from './context';
import type { Diagnostic } from '../../data/validator/types';
export interface NamedPlugin { name: string; module: PluginModule }
type HookName = 'mapEnter' | 'mapLeave' | 'tick' | 'loadSave';
type HookHandler = (...args: never[]) => unknown;
export class PluginRuntime {
  readonly commands = new CommandRegistry();
  readonly diagnostics: Diagnostic[] = [];
  readonly conditions = new Map<string, { args: TSchema; test: (args: unknown, state: GameState) => boolean }>();
  readonly text = new Map<string, { args: TSchema; format: (args: unknown, state: GameState) => string }>();
  private readonly hooks = new Map<HookName, HookHandler[]>();
  constructor(readonly engineVersion: string, plugins: readonly NamedPlugin[] = []) {
    registerBuiltins(this.commands);
    const names = new Set<string>();
    for (const { name, module } of plugins) {
      if (names.has(name)) throw new Error(`Duplicate plugin: ${name}`); names.add(name);
      if (!module || module.id !== name || module.apiVersion !== API_VERSION) {
        this.diagnostics.push({ level: 'error', file: `plugins/${name}.ts`, pointer: module?.id !== name ? '/id' : '/apiVersion', code: 'V2', message: 'Plugin id or apiVersion mismatch' }); continue;
      }
      const result = module.register(this.api()) as unknown;
      this.assertSynchronous(result, 'Plugin register');
    }
  }
  private api(): EngineApi {
    return Object.freeze({ engineVersion: this.engineVersion,
      commands: Object.freeze({ register: <S extends TSchema>(name: `x_${string}`, definition: CommandDefinition<S>) => {
        this.name(name);
        this.commands.register(name, { ...definition, run: (args, context) => definition.run(args, publicContext(context)) });
      } }),
      conditions: Object.freeze({ register: <S extends TSchema>(name: `x_${string}`, definition: { args: S; test: (args: Static<S>, state: import('@engine/api').ReadonlyGameState) => boolean }) => {
        this.name(name); if (this.conditions.has(name)) throw new Error(`Duplicate condition: ${name}`);
        this.conditions.set(name, { args: definition.args, test: (args, state) => definition.test(args as Static<S>, readonlyState(state)) });
      } }),
      text: Object.freeze({ register: <S extends TSchema>(name: `x_${string}`, definition: TextDefinition<S>) => {
        this.name(name); if (this.text.has(name)) throw new Error(`Duplicate text function: ${name}`);
        this.text.set(name, { args: definition.args, format: (args, state) => definition.format(args as Static<S>, readonlyState(state)) });
      } }),
      hooks: { on: (event: HookName, handler: HookHandler) => {
        if (!['mapEnter', 'mapLeave', 'tick', 'loadSave'].includes(event)) throw new Error(`Unknown hook: ${event}`);
        const handlers = this.hooks.get(event) ?? []; handlers.push(handler); this.hooks.set(event, handlers);
      } },
    }) as EngineApi;
  }
  private name(name: string): void { if (!/^x_[a-z0-9_]+$/.test(name)) throw new Error(`Invalid plugin registration name: ${name}`); }
  evaluate(name: string, args: unknown, state: GameState): boolean {
    const condition = this.conditions.get(name); if (!condition) throw new Error(`Unknown plugin condition: ${name}`);
    if (!Value.Check(condition.args, [ConditionSchema, CommandSchema], args)) throw new Error(`Invalid condition arguments: ${name}`);
    const result = condition.test(args, state); if (typeof result !== 'boolean') throw new Error(`Condition must return boolean: ${name}`);
    return result;
  }
  format(name: string, args: unknown, state: GameState): string {
    const definition = this.text.get(name); if (!definition) throw new Error(`Unknown plugin text function: ${name}`);
    if (!Value.Check(definition.args, [ConditionSchema, CommandSchema], args)) throw new Error(`Invalid text arguments: ${name}`);
    const result = definition.format(args, state); if (typeof result !== 'string') throw new Error(`Text function must return string: ${name}`);
    return result;
  }
  private emit(event: HookName, ...args: unknown[]): void {
    for (const handler of this.hooks.get(event) ?? []) {
      const result = handler(...args as never[]);
      this.assertSynchronous(result, `Hook ${event}`);
    }
  }
  private assertSynchronous(result: unknown, origin: string): void {
    if (result && typeof result === 'object' && ('then' in result || 'next' in result || 'kind' in result)) {
      if ('then' in result) void Promise.resolve(result).catch(() => {});
      throw new Error(`${origin.startsWith('Hook') ? 'Hook cannot wait' : 'Plugin register must be synchronous'}: ${origin}`);
    }
  }
  mapEnter(ctx: HookContext): void { this.emit('mapEnter', ctx, ctx.mapId); }
  mapLeave(ctx: HookContext): void { this.emit('mapLeave', ctx, ctx.mapId); }
  tick(ctx: HookContext): void { this.emit('tick', ctx); }
  loadSave(state: PersistentState, data: Readonly<Record<string, unknown>>, fromGameVersion: string): PersistentState {
    const save: SaveData = { ...state, saveVersion: 1, packId: String(data.packId ?? ''), gameVersion: String(data.gameVersion ?? ''), engineVersion: String(data.engineVersion ?? ''), savedAt: String(data.savedAt ?? '') };
    this.emit('loadSave', save, fromGameVersion);
    return { map: save.map, x: save.x, y: save.y, dir: save.dir, flags: save.flags, vars: save.vars, selfFlags: save.selfFlags };
  }
  get validationOptions() {
    return { commands: this.commands.catalog, conditions: new Map([...this.conditions].map(([name, definition]) => [name, definition.args])), text: new Map([...this.text].map(([name, definition]) => [name, definition.args])), pluginDiagnostics: this.diagnostics };
  }
}
