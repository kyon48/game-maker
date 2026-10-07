import { build } from 'vite';
import { cp, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePack } from '../engine/data/validator/validate';
import { nodePluginRuntime } from './loadPlugins';
import { API_VERSION } from '../engine/api';
import { FsSource } from './fsSource';
import { packRuntimePlugin } from './vitePackRuntime';
import type { BuildInfo } from '../engine/data/buildInfo';
export async function buildPack(id: string, options: { base?: string; root?: string; outDir?: string } = {}): Promise<BuildInfo> {
  if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error('Invalid pack id');
  const root = await realpath(options.root ?? process.cwd()), packRoot = path.join(root, 'packs', id);
  const source = new FsSource(packRoot);
  const plugins = await nodePluginRuntime(source, packRoot, root);
  const { diagnostics, pack } = await validatePack(source, id, plugins.validationOptions);
  for (const item of diagnostics) console.log(`${item.file}${item.pointer} ${item.level} ${item.code}: ${item.message}`);
  if (!pack) throw new Error(`Validation failed: ${id}`);
  const engine = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { version: string };
  let commit: string; try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { commit = 'unknown'; }
  const info: BuildInfo = { gameId: id, gameVersion: pack.game.version, engineVersion: engine.version,
    formatVersion: pack.game.formatVersion, apiVersion: API_VERSION, commit, builtAt: new Date().toISOString() };
  const outDir = options.outDir ?? path.join(root, 'dist', id);
  await build({ root, configFile: false, base: options.base ?? './', plugins: [packRuntimePlugin(info)],
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
    resolve: { alias: { '@engine/api': fileURLToPath(new URL('../engine/api/index.ts', import.meta.url)) } }, build: { outDir, emptyOutDir: true } });
  const destination = path.join(outDir, 'pack'); await mkdir(destination, { recursive: true });
  for (const entry of await readdir(packRoot, { withFileTypes: true })) {
    if (entry.name === 'plugins' || entry.name === 'tests') continue;
    await cp(path.join(packRoot, entry.name), path.join(destination, entry.name), { recursive: true });
  }
  await writeFile(path.join(outDir, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
  return info;
}
