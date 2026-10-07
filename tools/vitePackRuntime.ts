import type { Plugin } from 'vite';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { FsSource } from './fsSource';
import type { BuildInfo, PackRuntime } from '../engine/data/buildInfo';
export function packRuntimePlugin(info?: BuildInfo): Plugin {
  let root = process.cwd(), base = '/', packs: string[] = [];
  return {
    name: 'pack-runtime',
    async configResolved(config) {
      root = config.root; base = config.base;
      packs = info ? [info.gameId] : (await readdir(path.join(root, 'packs'), { withFileTypes: true })).filter(entry => entry.isDirectory() && /^[a-z][a-z0-9_]*$/.test(entry.name)).map(entry => entry.name).sort();
    },
    resolveId(id) { if (id === 'virtual:pack-runtime') return '\0pack-runtime'; if (id === 'virtual:pack-plugins') return '\0pack-plugins'; },
    async load(id) {
      if (id === '\0pack-plugins') {
        const entries = await Promise.all(packs.map(async pack => {
          let names: string[] = [];
          try { const game = JSON.parse(await readFile(path.join(root, 'packs', pack, 'game.json'), 'utf8')) as { plugins?: unknown };
            if (Array.isArray(game.plugins)) names = game.plugins.filter((name): name is string => typeof name === 'string' && /^[a-z][a-z0-9_]*$/.test(name));
          } catch { /* The shared validator reports malformed pack JSON. */ }
          const missing = [];
          const present: string[] = [];
          for (const [index, name] of names.entries()) {
            if (await stat(path.join(root, 'packs', pack, 'plugins', name + '.ts')).then(item => item.isFile(), () => false)) present.push(name);
            else missing.push({ level: 'error', code: 'V3', file: 'game.json', pointer: `/plugins/${index}`, message: `Missing plugin: plugins/${name}.ts` });
          }
          const imports = present.map(name => `import(${JSON.stringify(path.join(root, 'packs', pack, 'plugins', name + '.ts'))}).then(m => m.default)`);
          return missing.length
            ? `${JSON.stringify(pack)}: () => Promise.reject(Object.assign(new Error("Plugin load failed"), {diagnostics: ${JSON.stringify(missing)}}))`
            : `${JSON.stringify(pack)}: () => Promise.all([${imports.join(',')}])`;
        }));
        return `export default {${entries.join(',')}};`;
      }
      if (id !== '\0pack-runtime') return;
      const engine = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { version: string };
      const runtime: PackRuntime = { fixedPackId: info?.gameId ?? null, buildInfo: info ?? null,
        roots: {}, inventory: info ? null : base + '__pack-files', cacheKey: info ? `${info.gameVersion}-${info.commit}` : null, engineVersion: engine.version };
      if (!info) for (const pack of packs) runtime.roots[pack] = base + 'packs/' + encodeURIComponent(pack) + '/';
      return `export default ${JSON.stringify(runtime)};`;
    },
    handleHotUpdate(ctx) {
      if (ctx.file.endsWith('/game.json')) {
        const module = ctx.server.moduleGraph.getModuleById('\0pack-plugins');
        if (module) ctx.server.moduleGraph.invalidateModule(module);
        ctx.server.ws.send({ type: 'full-reload' });
      }
    },
    configureServer(server) {
      server.middlewares.use('/__pack-files', (request, response, next) => {
        const id = new URL(request.url ?? '', 'http://localhost').searchParams.get('pack');
        if (!id || !packs.includes(id)) { response.statusCode = 400; response.end('Invalid pack'); return; }
        void new FsSource(path.join(root, 'packs', id)).listFiles().then(files => {
          response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(files));
        }, next);
      });
    },
  };
}
