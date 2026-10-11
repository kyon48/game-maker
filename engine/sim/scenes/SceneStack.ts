import { Value } from '@sinclair/typebox/value';
import type { SceneContext, SceneDefinition, InputFrame } from '@engine/api';
import { DrawListSchema } from '../../data/scenes';
import type { DrawList } from '../../data/scenes';
import { ending } from './ending';
export type RuntimeScene = SceneDefinition<unknown, unknown>;
export interface SceneSnapshot { name: string; state: unknown; draw: DrawList }
export class SceneStack {
  private readonly stack: { name: string; definition: RuntimeScene; state: unknown; result: { done: boolean; value?: number } }[] = [];
  readonly definitions = new Map<string, RuntimeScene>([['ending', ending as RuntimeScene]]);
  constructor(private readonly context: () => SceneContext, private readonly images?: ReadonlySet<string>, private readonly completed?: (name: string, result: number) => void) {}
  get opened(): boolean { return this.stack.length > 0; }
  open(name: string, args: unknown = {}): { done: boolean; value?: number } {
    const definition = this.definitions.get(name);
    if (!definition) throw new Error(`Unknown scene: ${name}`);
    if (!Value.Check(definition.args, args)) throw new Error(`Invalid scene arguments: ${name}`);
    const result = { done: false };
    const depth = this.stack.length;
    const item = { name, definition, state: undefined as unknown, result };
    this.stack.push(item);
    try { item.state = definition.init(args, this.context()); }
    catch (error) { this.stack.splice(depth); throw error; }
    return result;
  }
  update(input: InputFrame): void {
    const item = this.stack.at(-1); if (!item) return;
    const next = item.definition.update(item.state, input, this.context());
    if (next && typeof next === 'object' && 'done' in next) {
      const value = next.done;
      if (!Number.isSafeInteger(value)) throw new Error('Scene result must be a safe integer');
      if (this.stack.at(-1) !== item) throw new Error('Cannot finish a scene while its child is open');
      this.stack.pop(); item.result.done = true; item.result.value = value as number; this.completed?.(item.name, value as number);
    } else item.state = next;
  }
  get snapshot(): SceneSnapshot[] {
    return this.stack.map(item => {
      const draw = item.definition.view(item.state);
      if (!Value.Check(DrawListSchema, draw)) throw new Error(`Invalid DrawList: ${item.name}`);
      for (const command of draw) if (command.kind === 'image') {
        if (!/^[^/\\?#:]+(?:\/[^/\\?#:]+)*$/.test(command.asset) || command.asset.split('/').some(p => p === '.' || p === '..') || (this.images && !this.images.has(command.asset))) throw new Error(`Missing or unsafe scene image: ${command.asset}`);
      }
      return { name: item.name, state: JSON.parse(JSON.stringify(item.state)) as unknown, draw: draw.map(command => ({ ...command })) };
    });
  }
}
