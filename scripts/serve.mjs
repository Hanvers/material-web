import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...headers,
  });
  response.end(body);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

export function startServer({ directory, port = 4173, host = '127.0.0.1' } = {}) {
  const root = path.resolve(directory || path.join(PROJECT_ROOT, 'dist'));

  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      let pathname;
      try {
        pathname = decodeURIComponent(requestUrl.pathname);
      } catch {
        send(response, 400, 'Bad request', { 'Content-Type': 'text/plain; charset=utf-8' });
        return;
      }

      if (pathname.includes('\0')) {
        send(response, 400, 'Bad request', { 'Content-Type': 'text/plain; charset=utf-8' });
        return;
      }

      let filePath = path.resolve(root, `.${pathname}`);
      if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
        send(response, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
        return;
      }

      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch {
        stat = null;
      }

      if (stat?.isDirectory()) {
        if (!pathname.endsWith('/')) {
          send(response, 301, '', { Location: `${pathname}/` });
          return;
        }
        filePath = path.join(filePath, 'index.html');
        try {
          stat = await fs.stat(filePath);
        } catch {
          stat = null;
        }
      }

      if (!stat?.isFile()) {
        const notFound = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>404</title><style>body{font-family:system-ui,sans-serif;padding:10vh 8vw;background:#f4f1e8;color:#19231e}a{color:#963718}</style><h1>404 / 未找到</h1><p>本地预览中没有这个文件。请检查构建是否成功。</p><p><a href="/">返回首页</a></p></html>`;
        send(response, 404, notFound, { 'Content-Type': 'text/html; charset=utf-8' });
        return;
      }

      const extension = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[extension] || 'application/octet-stream';
      const headers = {
        'Content-Type': contentType,
        'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=0, must-revalidate',
      };

      if (request.method === 'HEAD') {
        response.writeHead(200, { ...headers, 'Content-Length': stat.size });
        response.end();
        return;
      }

      const content = await fs.readFile(filePath);
      response.writeHead(200, { ...headers, 'Content-Length': content.length });
      response.end(content);
    } catch (error) {
      console.error('[serve]', error);
      send(response, 500, 'Internal server error', {
        'Content-Type': 'text/plain; charset=utf-8',
      });
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      const address = server.address();
      console.log(`[serve] http://${host}:${address.port}/`);
      resolve(server);
    });
  });
}

const isCli = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isCli) {
  const port = Number(process.env.PORT) || 4173;
  const directory = path.join(PROJECT_ROOT, 'dist');
  startServer({ directory, port }).catch((error) => {
    console.error(`[serve] 启动失败：${error.message}`);
    process.exitCode = 1;
  });
}
