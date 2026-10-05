import type { InitialState } from '../../data/game';
export class GameState {
  private readonly flags: Map<string, boolean>;
  private readonly vars: Map<string, number>;
  private readonly selfFlags = new Map<string, boolean>();
  private changed = false;
  constructor(initial: InitialState) {
    this.flags = new Map(Object.entries(initial.flags));
    this.vars = new Map(Object.entries(initial.vars));
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
