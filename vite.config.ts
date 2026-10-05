import { FsSource } from './tools/fsSource';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [{ name: 'pack-inventory', configureServer(server) {
    server.middlewares.use('/__pack-files', (request, response, next) => {
      const id = new URL(request.url ?? '', 'http://localhost').searchParams.get('pack');
      if (!id || !/^[a-z][a-z0-9_]*$/.test(id)) { response.statusCode = 400; response.end('Invalid pack'); return; }
      void new FsSource(`packs/${id}`).listFiles().then(files => {
        response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(files));
      }, next);
    });
  } }],
  resolve: { alias: { '@engine/api': fileURLToPath(new URL('./engine/api/index.ts', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
