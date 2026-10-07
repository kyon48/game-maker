import { fixtureSource, ruleChanges } from './fixtureSource';
import { expect, it } from 'vitest';
import { validatePack } from '../engine/data/validator/validate';
import { FsSource } from '../tools/fsSource';
import { builtinCatalog } from '../tools/catalog';
import { packSchemas } from '../engine/data/schema/export';
import { argsSchema as moveArgs } from '../engine/sim/commands/move';
import { Value } from '@sinclair/typebox/value';
import { CharacterSchema } from '../engine/data/schema/characters';
const options = { commands: builtinCatalog() };
it('accepts the valid base pack without warnings', async () => {
  const result = await validatePack(new FsSource('tests/fixtures/base'), 'base', options);
  expect(result.diagnostics).toEqual([]); expect(result.pack).toBeDefined();
});
it.each(Array.from({ length: 12 }, (_, i) => i + 1))('detects V%s in its base pack variant with location and severity', async n => {
  const { diagnostics, pack } = await validatePack(await fixtureSource(ruleChanges[n]!), 'base', options);
  const errors = diagnostics.filter(result => result.code === `V${n}`);
  expect(errors.length).toBeGreaterThan(0);
  for (const result of errors) {
    expect(result.level).toBe(n === 10 || n === 11 ? 'warning' : 'error');
    expect(result.file).toBeTruthy(); expect(result.pointer === '' || result.pointer.startsWith('/')).toBe(true);
  }
  expect(!!pack).toBe(n === 10 || n === 11);
});
it('the catalog and generated schema use the exact command-owned args', () => {
  expect(options.commands.get('move')?.args).toBe(moveArgs);
  const schema = packSchemas(options.commands).get('events.schema.json') as { $defs: { Command: { anyOf: { properties: { cmd: { const: string }; route?: unknown } }[] } } };
  expect(schema.$defs.Command.anyOf.find(entry => entry.properties.cmd.const === 'move')?.properties.route).toEqual(JSON.parse(JSON.stringify(moveArgs.properties.route)));
});
it('character timing validation moved from sim to its TypeBox schema', () => {
  expect(Value.Check(CharacterSchema, { placeholder: '#123456', moveTicks: 0 })).toBe(false);
  expect(Value.Check(CharacterSchema, { sheet: 'hero.png', frameWidth: 16, frameHeight: 24, frameTicks: 0 })).toBe(false);
});
async function changed(file: string, mutate: (value: Record<string, unknown>) => void, extra: Partial<import('../engine/data/validator/types').ValidationOptions> = {}) {
  const base = new FsSource('tests/fixtures/base');
  const source = {
    readJson: async (path: string) => { const value = await base.readJson(path) as Record<string, unknown>; if (path === file) mutate(value); return value; },
    exists: (path: string) => base.exists(path), listFiles: () => base.listFiles(),
  };
  return (await validatePack(source, 'base', { ...options, ...extra })).diagnostics;
}
it.each([
  [{ cmd: 'wait', frames: 0 }, 'V9'],
  [{ cmd: 'fade', to: 'black', frames: 0 }, 'V9'],
  [{ cmd: 'move', target: 'this', route: ['diagonal'] }, 'V9'],
  [{ cmd: 'move', target: 'this', route: ['wait:99999999999999999999'] }, 'V9'],
  [{ cmd: 'choice', options: [{ label: 'One', commands: [] }], cancel: 1 }, 'V9'],
  [{ cmd: 'transfer', map: 'map' }, 'V9'],
  [{ cmd: 'transfer', map: 'map', marker: 'missing' }, 'V3'],
  [{ cmd: 'face', target: 'missing', dir: 'down' }, 'V3'],
  [{ cmd: 'show_character', target: 'player', visible: false }, 'V3'],
  [{ cmd: 'set_flag', flag: 'missing', value: true }, 'V3'],
  [{ cmd: 'set_var', var: 'missing', value: 1 }, 'V3'],
  [{ cmd: 'call', common: 'missing' }, 'V3'],
  [{ cmd: 'if', cond: { all: [] }, then: [{ cmd: 'missing' }] }, 'V1'],
  [{ cmd: 'choice', options: [{ label: 'One', when: { plugin: 'x_missing', args: {} }, commands: [] }] }, 'V1'],
  [{ cmd: 'wait', frames: 1, typo: true }, 'V1'],
] as const)('checks nested command %j with %s', async (command, code) => {
  const diagnostics = await changed('common-events.json', data => { data.hello = { commands: [command] }; });
  expect(diagnostics.some(result => result.code === code)).toBe(true);
});
it('checks plugin metadata, injected argument schemas and parallel safety without implementing M7 registration', async () => {
  const catalog = new Map(options.commands);
  catalog.set('x_test', { args: moveArgs, parallelSafe: false });
  const diagnostics = await changed('maps/map.events.json', data => {
    data.events = [{ id: 'npc', x: 2, y: 2, pages: [{ trigger: 'parallel', commands: [{ cmd: 'x_test', target: 'this', route: [] }] }] }];
  }, { commands: catalog, plugins: [{ id: 'fixture', apiVersion: 2 }] });
  expect(diagnostics.some(result => result.code === 'V2')).toBe(true); expect(diagnostics.some(result => result.code === 'V7')).toBe(true);
});
it('propagates call cycles and parallel violations through multiple common events and nested branches', async () => {
  const diagnostics = await changed('common-events.json', data => {
    data.hello = { commands: [{ cmd: 'call', common: 'other' }] };
    data.other = { commands: [{ cmd: 'if', cond: { all: [] }, then: [{ cmd: 'call', common: 'hello' }] }] };
  });
  expect(diagnostics.some(result => result.code === 'V8')).toBe(true);
});
it('validates character exclusivity and safe integer state before accessing malformed pack data', async () => {
  const diagnostics = await changed('characters.json', data => { data.hero = { placeholder: '#fff', sheet: 'assets/tile.png', frameWidth: 16, frameHeight: 16 }; });
  expect(diagnostics.some(result => result.code === 'V1')).toBe(true);
  const unsafe = await changed('game.json', data => { data.state = { flags: {}, vars: { n: Number.MAX_SAFE_INTEGER + 1 } }; });
  expect(unsafe.some(result => result.code === 'V1')).toBe(true);
});
it('rejects invalid ids in records and invalid message width before starting the game', async () => {
  const ids = await changed('characters.json', data => { data.BAD = { placeholder: '#fff' }; });
  expect(ids.some(result => result.code === 'V1' && result.pointer === '/BAD')).toBe(true);
  const width = await changed('skin.json', data => { data.window = { slice: 8, padding: 100 }; });
  expect(width.some(result => result.code === 'V9' && result.pointer === '/window/padding')).toBe(true);
});
it.each(['keeper', 'elder'])('checks targets after a common event transfer in the resulting map: %s', async target => {
  const base = new FsSource('packs/demo');
  const source = {
    readJson: async (path: string) => {
      const value = await base.readJson(path) as Record<string, unknown>;
      if (path === 'common-events.json') value.travel = { commands: [{ cmd: 'transfer', map: 'house', x: 3, y: 3, fade: false }] };
      if (path === 'maps/village.events.json') {
        const events = value.events as import('../engine/data/game').EventDefinition[];
        events[0]!.pages[0]!.commands = [{ cmd: 'call', common: 'travel' }, { cmd: 'face', target, dir: 'down' }];
      }
      return value;
    }, exists: (path: string) => base.exists(path), listFiles: () => base.listFiles(),
  };
  const { diagnostics } = await validatePack(source, 'demo', options);
  expect(diagnostics.some(result => result.code === 'V3')).toBe(target === 'elder');
});
