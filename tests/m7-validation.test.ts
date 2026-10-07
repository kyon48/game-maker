import { expect, it } from 'vitest';
import { FsSource } from '../tools/fsSource';
import { nodePluginRuntime } from '../tools/loadPlugins';
import { validatePack } from '../engine/data/validator/validate';
it.each([
  [{ cmd: 'x_greet', text: 1 }, '/commands/0/text'],
  [{ cmd: 'x_greet', text: 'hello', extra: true }, '/commands/0/extra'],
] as const)('V1 validates actual imported plugin command args %j', async (command, pointer) => {
  const source = new FsSource('packs/demo'), runtime = await nodePluginRuntime(source, 'packs/demo');
  const changed = { readJson: async (file: string) => file === 'common-events.json' ? { probe: { commands: [command] } } : source.readJson(file), exists: (file: string) => source.exists(file) };
  const { diagnostics } = await validatePack(changed, 'demo', runtime.validationOptions);
  expect(diagnostics.some(item => item.code === 'V1' && item.pointer === '/probe' + pointer)).toBe(true);
});
it('V1 checks actual plugin condition args and V7 rejects its unsafe command through common events', async () => {
  const source = new FsSource('packs/demo'), runtime = await nodePluginRuntime(source, 'packs/demo');
  const changed = { readJson: async (file: string) => {
    if (file === 'common-events.json') return { probe: { commands: [{ cmd: 'x_greet', text: 'hello' }] } };
    if (file === 'maps/village.events.json') return { events: [{ id: 'probe', x: 1, y: 1, pages: [{ trigger: 'parallel', when: { plugin: 'x_greeted', args: { minimum: 'bad' } }, commands: [{ cmd: 'call', common: 'probe' }] }] }] };
    return source.readJson(file);
  }, exists: (file: string) => source.exists(file) };
  const { diagnostics } = await validatePack(changed, 'demo', runtime.validationOptions);
  expect(diagnostics.some(item => item.code === 'V1' && item.pointer.endsWith('/when/args/minimum'))).toBe(true);
  expect(diagnostics.some(item => item.code === 'V7' && item.file === 'common-events.json')).toBe(true);
});
