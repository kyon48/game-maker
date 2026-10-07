import type { Plugin } from 'vite';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { FsSource } from './fsSource';
import type { BuildInfo, PackRuntime } from '../engine/data/buildInfo';
export function packRuntimePlugin(info?: BuildInfo): Plugin {
  let root = process.cwd(), base = '/';
  return {
    name: 'pack-runtime',
    configResolved(config) { root = config.root; base = config.base; },
    resolveId(id) { if (id === 'virtual:pack-runtime') return '\0pack-runtime'; },
    async load(id) {
      if (id !== '\0pack-runtime') return;
      const engine = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { version: string };
      const runtime: PackRuntime = { fixedPackId: info?.gameId ?? null, buildInfo: info ?? null,
        roots: {}, inventory: info ? null : base + '__pack-files', cacheKey: info ? `${info.gameVersion}-${info.commit}` : null, engineVersion: engine.version };
      if (!info) for (const entry of await readdir(path.join(root, 'packs'), { withFileTypes: true })) {
        if (entry.isDirectory() && /^[a-z][a-z0-9_]*$/.test(entry.name)) runtime.roots[entry.name] = base + 'packs/' + encodeURIComponent(entry.name) + '/';
      }
      return `export default ${JSON.stringify(runtime)};`;
    },
    configureServer(server) {
      server.middlewares.use('/__pack-files', (request, response, next) => {
        const id = new URL(request.url ?? '', 'http://localhost').searchParams.get('pack');
        if (!id || !/^[a-z][a-z0-9_]*$/.test(id)) { response.statusCode = 400; response.end('Invalid pack'); return; }
        void new FsSource(path.join(root, 'packs', id)).listFiles().then(files => {
          response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(files));
        }, next);
      });
    },
  };
}
