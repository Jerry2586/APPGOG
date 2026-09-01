// Opt-in isolated UI fixture. Never imported by the production app or API.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { createServer } = await import(pathToFileURL(requireWeb.resolve('vite')).href);
const root = fileURLToPath(new URL('../apps/web', import.meta.url));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=', 'base64');
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5174, strictPort: true }, plugins: [{
  name: 'stage7-isolated-ui-fixture',
  configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      if (request.url?.startsWith('/api/v1/public/media/test-')) {
        response.setHeader('Content-Type', 'image/png'); response.end(png); return;
      }
      if (request.url !== '/__stage7-media-test') return next();
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(await vite.transformIndexHtml(request.url, '<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>APPGOG 第七阶段独立测试</title></head><body><div id="app"></div><script type="module" src="/tests/media-browser.ts"></script></body></html>'));
    });
  }
}] });
await server.listen();
console.log('Stage 7 UI fixture (in-memory API only): http://127.0.0.1:5174/__stage7-media-test');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
