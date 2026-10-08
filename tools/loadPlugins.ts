import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';
import type { Diagnostic } from '../engine/data/validator/types';
import type { PackSource } from '../engine/sim/ports';
import type { PluginModule } from '../engine/api';
import { PluginRuntime } from '../engine/sim/plugins/PluginRuntime';
import type { NamedPlugin } from '../engine/sim/plugins/PluginRuntime';
export async function loadPlugins(source: PackSource, root: string, diagnostics: Diagnostic[] = []): Promise<NamedPlugin[]> {
  const game = await source.readJson('game.json') as { plugins?: unknown };
  if (!Array.isArray(game.plugins) || !game.plugins.every(name => typeof name === 'string' && /^[a-z][a-z0-9_]*$/.test(name))) return [];
  const loadedPlugins = await Promise.all(game.plugins.map(async (name, index) => {
    if (!await source.exists(`plugins/${name}.ts`)) {
      diagnostics.push({ level: 'error', code: 'V3', file: 'game.json', pointer: `/plugins/${index}`, message: `Missing plugin: plugins/${name}.ts` });
      return null;
    }
    const filename = path.resolve(root, 'plugins', `${name}.ts`);
    let loaded: { default: PluginModule };
    try { loaded = await tsImport(pathToFileURL(filename).href, { parentURL: import.meta.url, tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)) }) as { default: PluginModule }; } catch (error) {
      diagnostics.push({ level: 'error', code: 'V2', file: `plugins/${name}.ts`, pointer: '', message: `Plugin load failed: ${String(error)}` });
      return null;
    }
    return { name, module: loaded.default };
  }));
  return loadedPlugins.filter((plugin): plugin is NamedPlugin => plugin !== null);
}
export async function nodePluginRuntime(source: PackSource, packRoot: string, root = process.cwd()): Promise<PluginRuntime> {
  const engine = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return readFile(new URL('../package.json', import.meta.url), 'utf8'); })) as { version: string };
  const diagnostics: Diagnostic[] = [];
  const modules = await loadPlugins(source, packRoot, diagnostics);
  let runtime: PluginRuntime;
  try { runtime = new PluginRuntime(engine.version, modules); } catch (error) {
    runtime = new PluginRuntime(engine.version);
    diagnostics.push({ level: 'error', code: 'V2', file: 'game.json', pointer: '/plugins', message: `Plugin registration failed: ${String(error)}` });
  }
  runtime.diagnostics.push(...diagnostics);
  return runtime;
}
