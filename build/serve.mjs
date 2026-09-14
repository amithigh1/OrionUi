#!/usr/bin/env node
/**
 * Tiny static server for the docs and templates (no dependencies).
 *   node build/serve.mjs [--port=8080]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.webmanifest': 'application/manifest+json',
  '.geojson': 'application/geo+json', '.md': 'text/markdown; charset=utf-8',
};

/** createServer({ port, bundle }) -> Promise<{ server, url }> ; `bundle` remaps /dist/orion.js */
export function createServer({ port = 0, bundle = null, root = ROOT } = {}) {
  const server = http.createServer((req, res) => {
    try {
      let url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (url === '/') url = '/docs/index.html';
      let file = path.join(root, url);
      if (bundle && /^\/dist\/orion\.js$/.test(url)) file = path.resolve(root, bundle);
      if (bundle && /^\/dist\/orion\.js\.lines\.json$/.test(url)) file = path.resolve(root, bundle) + '.lines.json';
      if (!file.startsWith(root) && !(bundle && file === path.resolve(root, bundle))) { res.writeHead(403); return res.end(); }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found: ' + url); }
      const ext = path.extname(file).toLowerCase();
      const size = fs.statSync(file).size;
      const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store', 'accept-ranges': 'bytes' };
      if (url.endsWith('sw.js') || url.endsWith('orion.js')) headers['service-worker-allowed'] = '/';
      // Range requests: required for seeking in <video>/<audio> served over HTTP.
      const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (range) {
        let start = range[1] ? parseInt(range[1], 10) : 0;
        let end = range[2] ? parseInt(range[2], 10) : size - 1;
        if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= size) {
          if (start >= size) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
          end = Math.min(end, size - 1);
        }
        res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
      res.writeHead(200, { ...headers, 'content-length': size });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = +(process.argv.find(a => a.startsWith('--port=')) || '--port=8080').split('=')[1];
  const { url } = await createServer({ port });
  console.log(`Orion Admin docs: ${url}/docs/index.html`);
  console.log(`Templates:        ${url}/templates/index.html`);
}
