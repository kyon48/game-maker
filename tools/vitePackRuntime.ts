import { packDirectory, packLocations } from './packPaths';
import { createReadStream } from 'node:fs';
import { packPath } from '../engine/data/loader/path';
import type { Plugin } from 'vite';
import { readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { FsSource } from './fsSource';
import type { BuildInfo, PackRuntime } from '../engine/data/buildInfo';
export function packRuntimePlugin(info?: BuildInfo): Plugin {
  let root = process.cwd(), base = '/', packs: string[] = [];
  return {
    name: 'pack-runtime',
    async configResolved(config) {
      root = config.root; base = config.base;
      packs = info ? [info.gameId] : [...packLocations(root).keys()].sort();
    },
    config() { return { server: { fs: { allow: [process.cwd(), ...[...packLocations().values()].map(p => p.directory)] } }, resolve: { dedupe: ['@sinclair/typebox'] } }; },
    resolveId(id) { if (id === 'virtual:pack-runtime') return '\0pack-runtime'; if (id === 'virtual:pack-plugins') return '\0pack-plugins'; },
    async load(id) {
      if (id === '\0pack-plugins') {
        const entries = await Promise.all(packs.map(async pack => {
          let names: string[] = [];
          try { const game = JSON.parse(await readFile(path.join(packDirectory(pack, root), 'game.json'), 'utf8')) as { plugins?: unknown };
            if (Array.isArray(game.plugins)) names = game.plugins.filter((name): name is string => typeof name === 'string' && /^[a-z][a-z0-9_]*$/.test(name));
          } catch { /* The shared validator reports malformed pack JSON. */ }
          const missing = [];
          const present: string[] = [];
          for (const [index, name] of names.entries()) {
            if (await stat(path.join(packDirectory(pack, root), 'plugins', name + '.ts')).then(item => item.isFile(), () => false)) present.push(name);
            else missing.push({ level: 'error', code: 'V3', file: 'game.json', pointer: `/plugins/${index}`, message: `Missing plugin: plugins/${name}.ts` });
          }
          const imports = present.map(name => `import(${JSON.stringify(path.join(packDirectory(pack, root), 'plugins', name + '.ts'))}).then(m => m.default)`);
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
      if (info) runtime.sceneImages = (await new FsSource(packDirectory(info.gameId, root)).listFiles()).filter(file => /\.(png|webp|jpe?g)$/i.test(file) && !/^(tests|films|plugins)\//.test(file));
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
      server.middlewares.use((request, response, next) => {
        const prefix = base + 'packs/', pathname = new URL(request.url ?? '', 'http://localhost').pathname;
        if (!pathname.startsWith(prefix)) { next(); return; }
        void (async () => {
          const pieces = pathname.slice(prefix.length).split('/'), id = decodeURIComponent(pieces.shift()!);
          if (!packs.includes(id)) { next(); return; }
          const relative = packPath('', decodeURIComponent(pieces.join('/'))), directory = packDirectory(id, root), file = await realpath(path.join(directory, relative));
          if (!file.startsWith(directory + path.sep) || !await stat(file).then(s => s.isFile())) throw new Error('Unsafe pack file');
          const mime: Record<string, string> = { '.json': 'application/json', '.tmj': 'application/json', '.tsj': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };
          response.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
          if (request.method === 'HEAD') response.end(); else createReadStream(file).on('error', next).pipe(response);
        })().catch(() => { response.statusCode = 404; response.end('Pack file not found'); });
      });
      server.middlewares.use('/__pack-files', (request, response, next) => {
        const id = new URL(request.url ?? '', 'http://localhost').searchParams.get('pack');
        if (!id || !packs.includes(id)) { response.statusCode = 400; response.end('Invalid pack'); return; }
        void new FsSource(packDirectory(id, root)).listFiles().then(files => {
          response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(files));
        }, next);
      });
    },
  };
}
