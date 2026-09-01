// Stage13 loopback-only theme fixture. It never starts Xboard or connects to a database/API.
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const routes = new Map([
  ['/', new URL('scripts/fixtures/xboard-theme.html', root)],
  ['/theme/APPGOG/assets/appgog.css', new URL('integrations/xboard-theme/APPGOG/assets/appgog.css', root)],
  ['/theme/APPGOG/assets/appgog-shell.js', new URL('integrations/xboard-theme/APPGOG/assets/appgog-shell.js', root)]
]);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const file = routes.get(pathname) || routes.get('/');
    response.writeHead(200, { 'content-type': types[extname(file.pathname)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(await readFile(file));
  } catch {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('fixture failed');
  }
});
server.listen(5180, '127.0.0.1', () => console.log('Stage13 isolated fixture: http://127.0.0.1:5180/'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
