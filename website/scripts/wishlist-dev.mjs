import http from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../backend/worker.mjs';
import { database } from '../tests/d1-local.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(path.join(root, '.local'), { recursive: true });
const DB = database(path.join(root, '.local/wishlist.sqlite'));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.csv': 'text/csv',
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1:4173');
      if (url.pathname.startsWith('/api/')) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const response = await worker.fetch(
          new Request('http://local' + url.pathname.slice(4) + url.search, {
            method: req.method,
            headers: req.headers,
            ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}),
          }),
          { DB, ALLOW_LOCAL: 'true', GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '' },
          { waitUntil: (p) => p.catch(() => {}) },
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      let file = path.join(root, 'dist', decodeURIComponent(url.pathname));
      if (!file.startsWith(path.join(root, 'dist') + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      res.writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'text/plain',
        'Cache-Control': 'no-store',
      });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  })
  .listen(4173, '127.0.0.1', () =>
    console.log('Wishlist preview: http://127.0.0.1:4173/wishlist/'),
  );
