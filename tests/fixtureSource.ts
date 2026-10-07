import type { PackSource } from '../engine/sim/ports';
import { FsSource } from '../tools/fsSource';
export type FixtureChange =
  | { op: 'set'; file: string; pointer: string; value: unknown }
  | { op: 'copy'; file: string; pointer: string; fromFile: string; fromPointer: string }
  | { op: 'delete'; file: string };
/** Each variant owns its JSON; the single base pack and other cases remain untouched. */
export async function fixtureSource(changes: readonly FixtureChange[]): Promise<PackSource> {
  const base = new FsSource('tests/fixtures/base');
  const files = new Set(await base.listFiles()), json = new Map<string, unknown>();
  const read = async (file: string): Promise<unknown> => {
    if (!files.has(file)) throw new Error(`Missing fixture file: ${file}`);
    if (!json.has(file)) json.set(file, await base.readJson(file));
    return json.get(file);
  };
  const parts = (pointer: string) => pointer === '' ? [] : pointer.slice(1).split('/').map(key => key.replace(/~1/g, '/').replace(/~0/g, '~'));
  const at = (value: unknown, pointer: string): unknown => parts(pointer).reduce((object, key) => (object as Record<string, unknown>)[key], value);
  for (const change of changes) {
    if (change.op === 'delete') { files.delete(change.file); json.delete(change.file); continue; }
    const value = structuredClone(change.op === 'copy' ? at(await read(change.fromFile), change.fromPointer) : change.value);
    const keys = parts(change.pointer);
    if (!keys.length) { json.set(change.file, value); files.add(change.file); continue; }
    const root = await read(change.file), key = keys.pop()!;
    const parent = keys.reduce((object, key) => (object as Record<string, unknown>)[key], root);
    if (Array.isArray(parent) && key === '-') parent.push(value);
    else (parent as Record<string, unknown>)[key] = value;
  }
  return {
    readJson: async file => structuredClone(await read(file)),
    exists: async file => files.has(file), listFiles: async () => [...files].sort(),
  };
}
export const ruleChanges: Readonly<Record<number, readonly FixtureChange[]>> = {
  1: [{ op: 'set', file: 'characters.json', pointer: '/hero/moveTicks', value: 0 }],
  2: [{ op: 'set', file: 'game.json', pointer: '/formatVersion', value: 2 }],
  3: [{ op: 'set', file: 'game.json', pointer: '/player', value: 'missing' }],
  4: [{ op: 'set', file: 'skin.json', pointer: '/font/src', value: '../outside.woff2' }],
  5: [{ op: 'copy', file: 'maps/map.events.json', pointer: '/events/-', fromFile: 'maps/map.events.json', fromPointer: '/events/0' }],
  6: [{ op: 'set', file: 'maps/map.tmj', pointer: '/layers/0/data/9', value: 1 }],
  7: [
    { op: 'set', file: 'maps/map.events.json', pointer: '/events/0/pages/0/trigger', value: 'parallel' },
    { op: 'set', file: 'common-events.json', pointer: '/hello/commands/-', value: { cmd: 'text', text: 'Forbidden' } },
  ],
  8: [{ op: 'set', file: 'common-events.json', pointer: '/hello/commands/-', value: { cmd: 'call', common: 'hello' } }],
  9: [{ op: 'set', file: 'maps/map.events.json', pointer: '/events/0/pages/0/commands/-', value: { cmd: 'transfer', map: 'map', marker: 'door', x: 1, y: 1 } }],
  10: [
    { op: 'set', file: 'maps/map.events.json', pointer: '/events/0/pages/0/trigger', value: 'auto' },
    { op: 'set', file: 'maps/map.events.json', pointer: '/events/0/pages/0/commands', value: [{ cmd: 'wait', frames: 1 }] },
  ],
  11: [
    { op: 'set', file: 'characters.json', pointer: '/unused', value: { placeholder: '#000' } },
    { op: 'copy', file: 'maps/orphan.tmj', pointer: '', fromFile: 'maps/map.tmj', fromPointer: '' },
  ],
  12: [{ op: 'delete', file: 'CREDITS.md' }],
};
