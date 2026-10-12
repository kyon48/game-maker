import * as module from 'node:module';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const roots = new Set<string>();
let installed = false;
/** Scoped Node resolver for plugins stored outside this repository's node_modules ancestry. */
export function pluginAliases(root: string): void {
  roots.add(realpathSync(root) + path.sep);
  if (installed) return;
  if (!module.registerHooks) throw new Error('External pack plugins require Node 22.15 or newer');
  const aliases: Record<string, string> = { '@engine/api': new URL('../engine/api/index.ts', import.meta.url).href, '@sinclair/typebox': pathToFileURL(module.createRequire(import.meta.url).resolve('@sinclair/typebox')).href };
  module.registerHooks({ resolve(specifier, context, nextResolve) {
    if (aliases[specifier] && context.parentURL?.startsWith('file:') && [...roots].some(root => fileURLToPath(context.parentURL!).startsWith(root))) return nextResolve(aliases[specifier]!, context);
    return nextResolve(specifier, context);
  } });
  installed = true;
}
