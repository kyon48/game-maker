import type { Items, Category } from '../../data/items';
import type { InitialState } from '../../data/game';
export class GameState {
  private readonly flags: Map<string, boolean>;
  private readonly vars: Map<string, number>;
  private readonly selfFlags = new Map<string, boolean>();
  private changed = false;
  private readonly items = new Map<string, number>();
  constructor(initial: InitialState, private readonly definitions: Items = {}) {
    for (const id of Object.keys(definitions)) this.items.set(id, initial.items?.[id] ?? 0);
    this.flags = new Map(Object.entries(initial.flags));
    this.vars = new Map(Object.entries(initial.vars));
  }
  snapshot(): { flags: Record<string, boolean>; vars: Record<string, number>; selfFlags: Record<string, boolean>; items: Record<string, number> } {
    return { items: Object.fromEntries(this.items), flags: Object.fromEntries(this.flags), vars: Object.fromEntries(this.vars), selfFlags: Object.fromEntries(this.selfFlags) };
  }
  getItem(name: string): number { const value = this.items.get(name); if (value === undefined) throw new Error(`Undeclared item: ${name}`); return value; }
  setItem(name: string, value: number): void {
    const before = this.getItem(name);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid item count: ${name}`);
    if (before !== value) { this.items.set(name, value); this.changed = true; }
  }
  itemCount(category: Category): number {
    if (category !== 'item' && category !== 'clue') throw new Error(`Unknown item category: ${category}`);
    let sum = 0; for (const [id, item] of Object.entries(this.definitions)) if (item.category === category) sum += this.getItem(id);
    if (!Number.isSafeInteger(sum)) throw new Error('Unsafe item category total'); return sum;
  }
  get dirty(): boolean { return this.changed; }
  clearDirty(): void { this.changed = false; }
  getFlag(name: string): boolean {
    const value = this.flags.get(name);
    if (value === undefined) throw new Error(`Undeclared flag: ${name}`);
    return value;
  }
  setFlag(name: string, value: boolean): void {
    const before = this.getFlag(name);
    if (typeof value !== 'boolean') throw new Error(`Invalid flag: ${name}`);
    if (before !== value) { this.flags.set(name, value); this.changed = true; }
  }
  getVar(name: string): number {
    const value = this.vars.get(name);
    if (value === undefined) throw new Error(`Undeclared variable: ${name}`);
    return value;
  }
  setVar(name: string, value: number): void {
    const before = this.getVar(name);
    if (!Number.isSafeInteger(value)) throw new Error(`Unsafe variable: ${name}`);
    if (before !== value) { this.vars.set(name, value); this.changed = true; }
  }
  private selfKey(map: string, event: string, name: string): string {
    if (![map, event, name].every(part => /^[a-z][a-z0-9_]*$/.test(part))) throw new Error('Invalid self flag key');
    return `${map}:${event}:${name}`;
  }
  getSelf(map: string, event: string, name: string): boolean {
    return this.selfFlags.get(this.selfKey(map, event, name)) ?? false;
  }
  setSelf(map: string, event: string, name: string, value: boolean): void {
    if (typeof value !== 'boolean') throw new Error('Invalid self flag value');
    const key = this.selfKey(map, event, name);
    if ((this.selfFlags.get(key) ?? false) !== value) { this.selfFlags.set(key, value); this.changed = true; }
  }
}
