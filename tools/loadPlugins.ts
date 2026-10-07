import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';
import type { PackSource } from '../engine/sim/ports';
import type { PluginModule } from '../engine/api';
import { PluginRuntime } from '../engine/sim/plugins/PluginRuntime';
import type { NamedPlugin } from '../engine/sim/plugins/PluginRuntime';
export async function loadPlugins(source: PackSource, root: string): Promise<NamedPlugin[]> {
  const game = await source.readJson('game.json') as { plugins?: unknown };
  if (!Array.isArray(game.plugins) || !game.plugins.every(name => typeof name === 'string' && /^[a-z][a-z0-9_]*$/.test(name))) return [];
  return Promise.all(game.plugins.map(async name => {
    const filename = path.resolve(root, 'plugins', `${name}.ts`);
    const loaded = await tsImport(pathToFileURL(filename).href, { parentURL: import.meta.url, tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)) }) as { default: PluginModule };
    return { name, module: loaded.default };
  }));
}
export async function nodePluginRuntime(source: PackSource, packRoot: string, root = process.cwd()): Promise<PluginRuntime> {
  const engine = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return readFile(new URL('../package.json', import.meta.url), 'utf8'); })) as { version: string };
  return new PluginRuntime(engine.version, await loadPlugins(source, packRoot));
}
