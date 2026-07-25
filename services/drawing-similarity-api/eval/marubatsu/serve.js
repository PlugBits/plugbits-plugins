/* global process, URL */
/**
 * マルバツ判定ゲーム 判定ページ配信用の最小静的サーバー
 *
 * node:http だけで完結する（依存パッケージ追加なし）。judge.html と、
 * generate-set.js が出力した out/（trials.json・thumbs/*.png）をそのまま配信する。
 *
 * 使い方:
 *   node eval/marubatsu/serve.js
 *   → http://localhost:8090/judge.html を判定者に開いてもらう
 *
 * 環境変数:
 *   PORT   listenポート (default: 8090)
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname; // judge.html と out/ の親ディレクトリ（このファイルの場所）
const port = Number(process.env.PORT || 8090);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8'
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/judge.html';

    // パストラバーサル対策: 正規化した絶対パスが ROOT の外に出ないことを確認する。
    const resolved = normalize(join(ROOT, pathname));
    if (!resolved.startsWith(ROOT)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    const info = await stat(resolved).catch(() => null);
    if (!info || !info.isFile()) {
      response.writeHead(404);
      response.end('Not Found: ' + pathname);
      return;
    }

    const body = await readFile(resolved);
    const contentType = CONTENT_TYPES[extname(resolved).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    response.end(body);
  } catch (error) {
    response.writeHead(500);
    response.end('Internal error: ' + error.message);
  }
});

server.listen(port, () => {
  console.log('マルバツ判定ページ配信中: http://localhost:' + port + '/judge.html');
  console.log('  配信ルート:', ROOT);
});
