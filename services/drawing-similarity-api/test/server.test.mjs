// 統合テスト: server.js を実プロセスとして起動し、モックの Qdrant / kintone /
// Firestore に対して実 HTTP で検証する。
//
//   node --test test/
//
// 前提: pdftoppm (poppler-utils) と convert (imagemagick) がインストールされていること。
// 外部ネットワークには一切出ない。

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const serviceDir = dirname(dirname(fileURLToPath(import.meta.url)));

// ---- 最小PDF（xref は壊れていても poppler が再構築する） ----
const makePdf = (fill) => Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >> endobj
4 0 obj << /Length 40 >> stream
${fill} rg 20 20 160 160 re f
endstream
endobj
trailer << /Root 1 0 R >>
%%EOF`);

const PDF_A = makePdf('0 0 0');
const PDF_B = makePdf('1 0 0');

// ---- 最小TIFF（ImageMagick `convert` で実TIFFを生成してバッファ化。前提: convert がインストールされていること） ----
const makeTiff = () => {
  const dir = mkdtempSync(join(tmpdir(), 'drawing-similarity-test-tiff-'));
  const tifPath = join(dir, 'fixture.tif');
  try {
    execFileSync('convert', ['-size', '60x40', 'xc:white', tifPath]);
    return readFileSync(tifPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const TIFF_A = makeTiff();

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

// ---- モックバックエンド（Qdrant + kintone + Firestore を1サーバーで担当） ----
const startMockBackend = () => {
  const state = {
    collections: new Map(), // name -> { size }
    points: new Map(),      // id -> { id, vector, payload }
    captured: { upserts: [], searches: [], scrolls: [] },
    indexedFields: new Set(), // Qdrant の payload インデックス（フィルタに必須）
    kintoneFiles: new Map([['file-a', PDF_A], ['file-b', PDF_B]]),
    // Firestore: docId -> fields
    tenants: new Map([
      [sha256('key-a'), { tenantId: 'tenant-a', active: true }],
      ['legacy-key', { tenantId: 'tenant-b', active: true }],
      [sha256('inactive-key'), { tenantId: 'tenant-c', active: false }]
    ])
  };

  const toFirestoreFields = (obj) => {
    const fields = {};
    for (const [k, v] of Object.entries(obj)) {
      fields[k] = typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
    }
    return { fields };
  };

  const readBody = (req) => new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    // --- kintone ---
    if (url.pathname === '/k/v1/file.json') {
      const fileKey = url.searchParams.get('fileKey') || '';
      const buf = state.kintoneFiles.get(fileKey);
      if (!buf) return json(404, { code: 'GAIA_BL01', message: 'file not found' });
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      return res.end(buf);
    }

    // --- Firestore ---
    const fsMatch = url.pathname.match(/^\/v1\/projects\/[^/]+\/databases\/[^/]+\/documents\/tenants\/([^/]+)$/);
    if (fsMatch) {
      const doc = state.tenants.get(decodeURIComponent(fsMatch[1]));
      if (!doc) return json(404, { error: { code: 404 } });
      return json(200, toFirestoreFields(doc));
    }

    // --- Qdrant ---
    const colMatch = url.pathname.match(/^\/collections\/([^/]+)(\/.*)?$/);
    if (colMatch) {
      const name = decodeURIComponent(colMatch[1]);
      const sub = colMatch[2] || '';
      const body = req.method === 'GET' ? {} : JSON.parse((await readBody(req)) || '{}');

      if (sub === '' && req.method === 'GET') {
        const col = state.collections.get(name);
        if (!col) return json(404, { status: { error: 'not found' } });
        return json(200, { result: { config: { params: { vectors: { size: col.size } } } } });
      }
      if (sub === '' && req.method === 'PUT') {
        state.collections.set(name, { size: body.vectors?.size });
        return json(200, { result: true });
      }
      if (sub === '/index' && req.method === 'PUT') {
        if (body.field_name) state.indexedFields.add(body.field_name);
        return json(200, { result: true });
      }
      if (sub.startsWith('/points') && req.method === 'PUT') {
        state.captured.upserts.push(body);
        for (const p of body.points || []) state.points.set(String(p.id), p);
        return json(200, { result: {} });
      }
      if (sub.startsWith('/points/search') && req.method === 'POST') {
        state.captured.searches.push(body);
        const tenantFilter = body.filter?.must?.[0]?.match?.value;
        const hits = [...state.points.values()]
          .filter((p) => !tenantFilter || p.payload?.tenant_id === tenantFilter)
          .map((p, i) => ({ id: p.id, score: 0.99 - i * 0.01, payload: p.payload }));
        return json(200, { result: hits });
      }
      if (sub.startsWith('/points/scroll') && req.method === 'POST') {
        state.captured.scrolls.push(body);
        const tenantFilter = body.filter?.must?.[0]?.match?.value;
        const points = [...state.points.values()]
          .filter((p) => !tenantFilter || p.payload?.tenant_id === tenantFilter)
          .map((p) => ({ id: p.id, payload: p.payload }));
        return json(200, { result: { points, next_page_offset: null } });
      }
      if (sub.startsWith('/points/delete') && req.method === 'POST') {
        const filterKeys = (body.filter?.must || []).map((c) => c.key);
        const missing = filterKeys.find((k) => !state.indexedFields.has(k));
        if (missing) {
          return json(400, { status: { error: 'Bad request: Index required but not found for "' + missing + '" of one of the following types: [keyword].' } });
        }
        if (Array.isArray(body.points)) {
          for (const id of body.points) state.points.delete(String(id));
        } else if (body.filter) {
          const want = {};
          for (const c of (body.filter.must || [])) want[c.key] = c.match.value;
          for (const [id, p] of [...state.points]) {
            const hit = Object.entries(want).every(([k, v]) => String(p.payload?.[k]) === String(v));
            if (hit) state.points.delete(id);
          }
        }
        return json(200, { result: {} });
      }
      if (sub.startsWith('/points/payload') && req.method === 'POST') {
        for (const id of body.points || []) {
          const p = state.points.get(String(id));
          if (p) Object.assign(p.payload, body.payload);
        }
        return json(200, { result: {} });
      }
      if (sub === '/points' && req.method === 'POST') {
        const hits = (body.ids || [])
          .map((id) => state.points.get(String(id)))
          .filter(Boolean)
          .map((p) => ({ id: p.id, payload: p.payload, vector: p.vector }));
        return json(200, { result: hits });
      }
      return json(404, { status: { error: 'unhandled qdrant path ' + req.method + ' ' + url.pathname } });
    }

    json(404, { error: 'unhandled mock path: ' + req.method + ' ' + url.pathname });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, state, url: 'http://127.0.0.1:' + server.address().port });
    });
  });
};

// ---- 被験サーバー起動 ----
const startApiServer = (mockUrl, extraEnv = {}) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: serviceDir,
    env: {
      ...process.env,
      PORT: '0',
      QDRANT_URL: mockUrl,
      KINTONE_BASE_URL: mockUrl,
      KINTONE_API_TOKEN: 'test-kintone-token',
      FIRESTORE_BASE_URL: mockUrl,
      FIRESTORE_PROJECT_ID: 'test-project',
      GCP_ACCESS_TOKEN: 'test-gcp-token',
      EMBEDDING_PROVIDER: 'dummy',
      GOOGLE_OAUTH_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
      GOOGLE_CLOUD_PROJECT_NUMBER: '123456789012',
      ...extraEnv
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const onData = (chunk) => {
    output += chunk.toString();
    const match = output.match(/listening on port (\d+)/);
    if (match) {
      child.stdout.off('data', onData);
      resolve({ child, url: 'http://127.0.0.1:' + match[1] });
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', (c) => { output += c.toString(); });
  child.on('exit', (code) => reject(new Error('server exited early (' + code + '): ' + output)));
  setTimeout(() => reject(new Error('server start timeout: ' + output)), 10000).unref();
});

// PORT=0 だと実ポートがログに出ないため、空きポートを自前で選ぶ
let nextPort = 19100 + Math.floor(Math.random() * 300);
const startApi = async (mockUrl, extraEnv = {}) => {
  const port = String(nextPort++);
  return startApiServer(mockUrl, { ...extraEnv, PORT: port });
};

const postJson = (base, path, body, headers = {}) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });

// ================================================================
// Suite 1: 認証OFF（既存動作＋テナント名前空間）
// ================================================================
let mock, api;

before(async () => {
  mock = await startMockBackend();
  api = await startApi(mock.url);
});

after(() => {
  api?.child.kill();
  mock?.server.close();
});

test('health: 認証OFFでは runtime 詳細を返す', async () => {
  const res = await fetch(api.url + '/health');
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.runtime.embeddingProvider, 'dummy');
});

test('index: テナントA/B の同一 recordId が別ポイントIDになる（名前空間）', async () => {
  const resA = await postJson(api.url, '/index', {
    appId: '1', recordId: '1', tenantId: 'tenant-a',
    drawingNo: 'DWG-A-001', productName: 'part-a', fileKey: 'file-a', fileName: 'a.pdf'
  });
  assert.equal(resA.status, 202, await resA.text());

  const resB = await postJson(api.url, '/index', {
    appId: '2', recordId: '1', tenantId: 'tenant-b',
    drawingNo: 'DWG-B-001', productName: 'part-b', fileKey: 'file-b', fileName: 'b.pdf'
  });
  assert.equal(resB.status, 202, await resB.text());

  const ids = [...mock.state.points.keys()];
  assert.equal(ids.length, 2, 'ポイントが2つ（上書きされていない）: ' + JSON.stringify(ids));
  const payloads = [...mock.state.points.values()].map((p) => p.payload.tenant_id).sort();
  assert.deepEqual(payloads, ['tenant-a', 'tenant-b']);
});

test('similar: pdf_base64 アップロード検索が実検索になり、テナントで絞られる', async () => {
  const res = await postJson(api.url, '/similar', {
    appId: '1', tenantId: 'tenant-a',
    pdf_base64: PDF_A.toString('base64'), fileName: 'query.pdf', limit: 10
  });
  const text = await res.text();
  assert.equal(res.status, 200, text);
  const data = JSON.parse(text);
  assert.match(data.mode, /^qdrant-/, 'mock モードに落ちていない');
  assert.equal(data.qdrant.queryVectorSource, 'uploaded-pdf');
  assert.equal(data.results.length, 1, 'tenant-a の1件のみ');
  assert.equal(data.results[0].drawingNo, 'DWG-A-001');
  assert.ok(data.results[0].thumbToken, 'thumbToken が同梱される');
});

test('similar: インデックス済み recordId 検索は qdrant-indexed', async () => {
  const res = await postJson(api.url, '/similar', {
    appId: '1', recordId: '1', tenantId: 'tenant-a', limit: 10
  });
  const data = await res.json();
  assert.equal(data.mode, 'qdrant-indexed');
  // 自分自身は結果から除外される
  assert.equal(data.results.length, 0);
});

test('similar: pdf_base64 も fileKey も無ければ mock にフォールバック', async () => {
  const res = await postJson(api.url, '/similar', {
    tenantId: 'tenant-a', pdf_base64: '', fileKey: '', limit: 10
  });
  // pdf_base64 空 → fileKey も無し → mock モードにフォールバック（既存挙動）
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.mode, 'mock');
});

test('thumbnail: 認証OFFではトークン不要', async () => {
  const res = await fetch(api.url + '/thumbnail?fileKey=file-a');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.match(res.headers.get('cache-control') || '', /max-age/);
});

test('413: ボディ上限を超えると 413', async () => {
  const small = await startApi(mock.url, { MAX_JSON_BODY_BYTES: '1000' });
  try {
    const res = await postJson(small.url, '/similar', { pdf_base64: 'A'.repeat(5000) });
    assert.equal(res.status, 413);
  } finally {
    small.child.kill();
  }
});

test('index-status: テナント内の record_id と file_key を返す', async () => {
  const res = await fetch(api.url + '/index-status?tenantId=tenant-a&appId=1');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.configured, true);
  assert.equal(data.count, 1, 'tenant-a の1件のみ（tenant-b は含まれない）');
  assert.equal(data.items[0].recordId, '1');
  assert.equal(data.items[0].fileKey, 'file-a', 'PDF差し替え検知用の file_key を含む');
});

test('delete: レコード削除でテナント名前空間のポイントが消える', async () => {
  // suite冒頭の index テストで tenant-a/record1 と tenant-b/record1 が登録済み
  assert.equal(mock.state.points.size, 2);
  const res = await postJson(api.url, '/delete', { recordId: '1', tenantId: 'tenant-a' });
  assert.equal(res.status, 200, await res.text());
  assert.equal(mock.state.points.size, 1, 'tenant-a のポイントだけが消える');
  const remaining = [...mock.state.points.values()][0];
  assert.equal(remaining.payload.tenant_id, 'tenant-b');
});

test('delete: 旧スキーム（数値ID等）のポイントもフィルタ削除で消える', async () => {
  // Phase 2 以前の想定: ポイントIDが payload と無関係（例: 数値 recordId）
  mock.state.points.set('99', {
    id: 99, vector: [0, 0, 0],
    payload: { tenant_id: 'tenant-a', record_id: '99', file_key: 'legacy' }
  });
  const res = await postJson(api.url, '/delete', { recordId: '99', tenantId: 'tenant-a' });
  assert.equal(res.status, 200, await res.text());
  assert.equal(mock.state.points.has('99'), false, '数値IDの旧ポイントも消える');
});

test('delete: record_id インデックスが無くても自己修復して削除できる', async () => {
  // 旧コードで作られた「record_id 未インデックス」のコレクションを模擬
  mock.state.indexedFields.delete('record_id');
  mock.state.points.set('op1', {
    id: 'op1', vector: [0, 0, 0],
    payload: { tenant_id: 'tenant-a', record_id: '77', file_key: 'x' }
  });
  const res = await postJson(api.url, '/delete', { recordId: '77', tenantId: 'tenant-a' });
  assert.equal(res.status, 200, await res.text());
  assert.equal(mock.state.indexedFields.has('record_id'), true, 'インデックスが自動作成される');
  assert.equal(mock.state.points.has('op1'), false, '再試行で削除される');
});

test('archive-index: doc_type=archive と archive_rel_path をQdrantに書き込む', async () => {
  const res = await postJson(api.url, '/archive-index', {
    tenantId: 'tenant-a', appId: '1', docId: 'archive:abc123',
    relPath: '2019/Q3/DWG-9001.pdf', fileName: 'DWG-9001.pdf',
    pdf_base64: PDF_A.toString('base64')
  });
  const text = await res.text();
  assert.equal(res.status, 200, text);
  const data = JSON.parse(text);
  assert.equal(data.ok, true);
  assert.equal(data.docId, 'archive:abc123');

  const points = [...mock.state.points.values()].filter((p) => p.payload.record_id === 'archive:abc123');
  assert.ok(points.length > 0, 'ポイントが作成される');
  assert.equal(points[0].payload.doc_type, 'archive');
  assert.equal(points[0].payload.archive_rel_path, '2019/Q3/DWG-9001.pdf');
  assert.equal(points[0].payload.tenant_id, 'tenant-a');
});

test('archive-index: driveFileId を渡すと drive_file_id としてQdrantに書き込まれる', async () => {
  const res = await postJson(api.url, '/archive-index', {
    tenantId: 'tenant-a', appId: '1', docId: 'archive:gdrive-1',
    relPath: 'DWG-9002.pdf', fileName: 'DWG-9002.pdf', driveFileId: '1AbCdEfGhIjK',
    pdf_base64: PDF_A.toString('base64')
  });
  assert.equal(res.status, 200, await res.text());

  const points = [...mock.state.points.values()].filter((p) => p.payload.record_id === 'archive:gdrive-1');
  assert.ok(points.length > 0, 'ポイントが作成される');
  assert.equal(points[0].payload.drive_file_id, '1AbCdEfGhIjK');
});

test('archive-index: driveFileId 未指定では drive_file_id が空文字になる', async () => {
  const res = await postJson(api.url, '/archive-index', {
    tenantId: 'tenant-a', appId: '1', docId: 'archive:local-only',
    relPath: 'DWG-9003.pdf', fileName: 'DWG-9003.pdf',
    pdf_base64: PDF_A.toString('base64')
  });
  assert.equal(res.status, 200, await res.text());

  const points = [...mock.state.points.values()].filter((p) => p.payload.record_id === 'archive:local-only');
  assert.equal(points[0].payload.drive_file_id, '');
});

test('archive-status: アーカイブ取込済みの一覧をrecord_id単位で返す（他テナントは混ざらない）', async () => {
  const res = await fetch(api.url + '/archive-status?tenantId=tenant-a');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.configured, true);

  const gdriveItem = data.items.find((it) => it.docId === 'archive:gdrive-1');
  assert.ok(gdriveItem, 'Drive由来のアーカイブが一覧に含まれる');
  assert.equal(gdriveItem.driveFileId, '1AbCdEfGhIjK');
  assert.equal(gdriveItem.fileName, 'DWG-9002.pdf');

  const localItem = data.items.find((it) => it.docId === 'archive:local-only');
  assert.ok(localItem, 'ローカル由来のアーカイブも一覧に含まれる');
  assert.equal(localItem.driveFileId, '');
});

test('archive-status: 存在しないテナントは0件', async () => {
  const res = await fetch(api.url + '/archive-status?tenantId=tenant-nonexistent');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.count, 0);
});

test('google/oauth/popup: HTMLを返しクライアントIDを埋め込む', async () => {
  const res = await fetch(api.url + '/google/oauth/popup');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/html/);
  const html = await res.text();
  assert.match(html, /test-client-id\.apps\.googleusercontent\.com/);
  assert.match(html, /drive\.file/);
  assert.match(html, /123456789012/);
});

test('index-status: doc_type=archive の点は一覧に含まれない', async () => {
  const res = await fetch(api.url + '/index-status?tenantId=tenant-a&appId=1');
  assert.equal(res.status, 200);
  const data = await res.json();
  const archiveItem = data.items.find((it) => it.recordId === 'archive:abc123');
  assert.equal(archiveItem, undefined, 'アーカイブ点は index-status の一覧に出ない（孤児/未登録誤検知の防止）');
});

test('field-values: doc_type=archive の値は候補に含まれない', async () => {
  mock.state.points.set('archive-fv-test', {
    id: 'archive-fv-test', vector: [0, 0, 0],
    payload: { tenant_id: 'tenant-a', record_id: 'archive:fv-test', doc_type: 'archive', drawing_no: 'ARCHIVE-ONLY-999' }
  });
  const res = await fetch(api.url + '/field-values?tenantId=tenant-a');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(!data.drawingNos.includes('ARCHIVE-ONLY-999'), 'アーカイブ由来の図番はオートコンプリート候補に出ない');
});

test('similar: アーカイブ結果は docType=archive・thumbTokenなしで通常結果と混在する', async () => {
  const res = await postJson(api.url, '/similar', {
    tenantId: 'tenant-a', pdf_base64: PDF_A.toString('base64'), limit: 10
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  const archiveResult = data.results.find((r) => r.recordId === 'archive:abc123');
  assert.ok(archiveResult, 'アーカイブ結果が通常検索に混在して出る');
  assert.equal(archiveResult.docType, 'archive');
  assert.equal(archiveResult.thumbToken, '', 'アーカイブにはサムネトークンを発行しない');
  assert.equal(archiveResult.fileKey, '', 'アーカイブには kintone fileKey が無い');
  assert.equal(archiveResult.archiveRelPath, '2019/Q3/DWG-9001.pdf');
});

test('similar: Drive由来のアーカイブ結果には driveFileId が含まれる', async () => {
  const res = await postJson(api.url, '/similar', {
    tenantId: 'tenant-a', pdf_base64: PDF_A.toString('base64'), limit: 10
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  const gdriveResult = data.results.find((r) => r.recordId === 'archive:gdrive-1');
  assert.ok(gdriveResult, 'Drive由来のアーカイブ結果が出る');
  assert.equal(gdriveResult.driveFileId, '1AbCdEfGhIjK');

  const localResult = data.results.find((r) => r.recordId === 'archive:local-only');
  assert.equal(localResult.driveFileId, '', 'ローカル由来は driveFileId が空文字');
});

test('render-thumbnail: PDFの1ページ目をPNG化して返す（状態は持たない）', async () => {
  const res = await postJson(api.url, '/render-thumbnail', {
    pdf_base64: PDF_A.toString('base64')
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('render-thumbnail: pdf_base64 が無ければ400', async () => {
  const res = await postJson(api.url, '/render-thumbnail', {});
  assert.equal(res.status, 400);
});

// TIFF対応: kintone添付にTIF形式の図面があるため、入口の変換（pdftoppm→ImageMagick convert）
// だけTIFF用に分岐する。/analyze は実tesseractを要求しCI/開発環境に無いことがあるため、
// 変換パイプラインを通る /render-thumbnail と /similar で「TIFFバッファが変換できること」を検証する。
test('render-thumbnail: TIFの1ページ目もPNG化して返す', async () => {
  const res = await postJson(api.url, '/render-thumbnail', {
    pdf_base64: TIFF_A.toString('base64')
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.deepEqual(buf.subarray(0, 4), Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'PNGマジックバイトで始まる');
});

test('render-thumbnail: max_width を指定するとその幅でPNG化される', async () => {
  const res = await postJson(api.url, '/render-thumbnail', {
    pdf_base64: TIFF_A.toString('base64'), max_width: 100
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  const buf = Buffer.from(await res.arrayBuffer());
  // PNG IHDR: バイトオフセット 16-19 がビッグエンディアンの幅
  assert.equal(buf.readUInt32BE(16), 100);
});

test('render-thumbnail: max_width が不正でも既定幅で200', async () => {
  const res = await postJson(api.url, '/render-thumbnail', {
    pdf_base64: TIFF_A.toString('base64'), max_width: 'abc'
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
});

// バイナリ直送: base64化（+33%膨張）とJSON.stringifyの追加コピーを避けるため、
// /index と同じ方式で Content-Type: application/octet-stream のボディに生バイト列を
// そのまま送れる（プラグイン側のTIFプレビュー高速化用）。max_width はJSONボディが
// 無いため URLクエリパラメータで受け取る。
test('render-thumbnail: バイナリ直送でもPNG化できる', async () => {
  const res = await fetch(api.url + '/render-thumbnail?max_width=100', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: TIFF_A
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.deepEqual(buf.subarray(0, 4), Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'PNGマジックバイトで始まる');
  // PNG IHDR: バイトオフセット 16-19 がビッグエンディアンの幅
  assert.equal(buf.readUInt32BE(16), 100);
});

// CORS: プラグインはkintoneドメイン（クロスオリジン）から X-Index-Meta 付きで
// POSTするため、プリフライトの Allow-Headers に含まれていないとブラウザで
// 「Failed to fetch」になる（Node上のfetchはCORSを検証しないため、これを
// 明示的にヘッダー内容で検証する。実際に本番で発生した退行）。
test('cors: プリフライトの Allow-Headers に X-Index-Meta が含まれる', async () => {
  const res = await fetch(api.url + '/index', { method: 'OPTIONS' });
  assert.equal(res.status, 204);
  const allowHeaders = String(res.headers.get('access-control-allow-headers') || '').toLowerCase();
  assert.ok(allowHeaders.includes('x-api-key'), 'X-API-Key を許可');
  assert.ok(allowHeaders.includes('x-index-meta'), 'X-Index-Meta を許可');
});

test('render-thumbnail: バイナリ直送で max_width 未指定なら既定幅で200', async () => {
  const res = await fetch(api.url + '/render-thumbnail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: TIFF_A
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.deepEqual(buf.subarray(0, 4), Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'PNGマジックバイトで始まる');
});

test('similar: TIFファイルでもアップロード検索が実検索になる（TIFF→PNG変換）', async () => {
  const res = await postJson(api.url, '/similar', {
    appId: '1', tenantId: 'tenant-a',
    pdf_base64: TIFF_A.toString('base64'), fileName: 'query.tif', limit: 10
  });
  const text = await res.text();
  assert.equal(res.status, 200, text);
  const data = JSON.parse(text);
  assert.match(data.mode, /^qdrant-/, 'mock モードに落ちていない（TIFF変換に成功している）');
  assert.equal(data.qdrant.queryVectorSource, 'uploaded-pdf');
});

test('google/oauth/popup: mode=token ではPickerを起動せずトークン取得のみで完了する', async () => {
  const res = await fetch(api.url + '/google/oauth/popup?mode=token');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /tokenOnly/, 'mode=tokenの分岐ロジックが埋め込まれている');
});

// ================================================================
// Suite 2: 認証ON（キー検証・強制テナント・サムネトークン）
// ================================================================
let authMock, authApi;

before(async () => {
  authMock = await startMockBackend();
  authApi = await startApi(authMock.url, { TENANT_AUTH_ENABLED: 'true' });
});

after(() => {
  authApi?.child.kill();
  authMock?.server.close();
});

test('auth: キー無しは 401', async () => {
  const res = await postJson(authApi.url, '/similar', { tenantId: 'x' });
  assert.equal(res.status, 401);
});

test('auth: 無効キー・inactive キーは 401', async () => {
  const bad = await postJson(authApi.url, '/similar', {}, { 'X-API-Key': 'no-such-key' });
  assert.equal(bad.status, 401);
  const inactive = await postJson(authApi.url, '/similar', {}, { 'X-API-Key': 'inactive-key' });
  assert.equal(inactive.status, 401);
});

test('auth: health はキー無しで最小情報、有効キーで詳細', async () => {
  const anon = await (await fetch(authApi.url + '/health')).json();
  assert.equal(anon.ok, true);
  assert.equal(anon.runtime, undefined, '無認証に runtime を返さない');

  const authed = await (await fetch(authApi.url + '/health', {
    headers: { 'X-API-Key': 'key-a' }
  })).json();
  assert.ok(authed.runtime, '有効キーには runtime を返す');
});

test('auth: ハッシュIDドキュメントのキーが通る（Phase 2）', async () => {
  const res = await postJson(authApi.url, '/index', {
    appId: '1', recordId: '10', tenantId: '無視される値',
    drawingNo: 'DWG-A-010', fileKey: 'file-a', fileName: 'a.pdf'
  }, { 'X-API-Key': 'key-a' });
  assert.equal(res.status, 202, await res.text());

  // 強制テナント: クライアント送信の tenantId ではなく key-a の tenant-a が保存される
  const stored = [...authMock.state.points.values()];
  assert.equal(stored.length, 1);
  assert.equal(stored[0].payload.tenant_id, 'tenant-a');
});

test('auth: レガシー生キーIDドキュメントも後方互換で通る', async () => {
  const res = await postJson(authApi.url, '/index', {
    appId: '2', recordId: '20', tenantId: 'tenant-zzz',
    drawingNo: 'DWG-B-020', fileKey: 'file-b', fileName: 'b.pdf'
  }, { 'X-API-Key': 'legacy-key' });
  assert.equal(res.status, 202, await res.text());
  const tenants = [...authMock.state.points.values()].map((p) => p.payload.tenant_id).sort();
  assert.deepEqual(tenants, ['tenant-a', 'tenant-b'], 'legacy-key は tenant-b に強制される');
});

test('auth: similar はキーのテナントに強制され、他テナントは見えない', async () => {
  const res = await postJson(authApi.url, '/similar', {
    tenantId: 'tenant-b', // ← 攻撃者が別テナントを指定しても
    pdf_base64: PDF_A.toString('base64'), limit: 10
  }, { 'X-API-Key': 'key-a' });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.results.length, 1);
  assert.equal(data.results[0].drawingNo, 'DWG-A-010', 'tenant-a のデータだけが返る');
  assert.equal(data.query.tenantId, 'tenant-a');
});

test('auth: thumbnail はトークン必須・正しいトークンで取得可', async () => {
  const noToken = await fetch(authApi.url + '/thumbnail?fileKey=file-a');
  assert.equal(noToken.status, 401);

  const wrong = await fetch(authApi.url + '/thumbnail?fileKey=file-a&token=' + 'f'.repeat(32));
  assert.equal(wrong.status, 401);

  // /similar のレスポンスに同梱されたトークンで取得できる
  const search = await postJson(authApi.url, '/similar', {
    pdf_base64: PDF_A.toString('base64'), limit: 10
  }, { 'X-API-Key': 'key-a' });
  const { results } = await search.json();
  const { fileKey, thumbToken } = results[0];
  assert.ok(thumbToken);
  const ok = await fetch(authApi.url + '/thumbnail?fileKey=' + encodeURIComponent(fileKey) + '&token=' + thumbToken);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/png');

  // トークンは fileKey に紐づく（別 fileKey には使えない）
  const cross = await fetch(authApi.url + '/thumbnail?fileKey=file-b&token=' + thumbToken);
  assert.equal(cross.status, 401);
});

test('auth: delete もキーのテナントに強制され、他テナントのポイントは消せない', async () => {
  // tenant-a(record10) と tenant-b(record20) が登録済み。
  // key-a で tenant-b の record20 を消そうとしても、強制テナント(tenant-a)の
  // ポイントIDが計算されるため tenant-b のデータは残る。
  const before = authMock.state.points.size;
  const res = await postJson(authApi.url, '/delete', {
    recordId: '20', tenantId: 'tenant-b'
  }, { 'X-API-Key': 'key-a' });
  assert.equal(res.status, 200, await res.text());
  assert.equal(authMock.state.points.size, before, 'tenant-b のポイントは消えていない');

  // 自テナントの record10 は消せる
  const res2 = await postJson(authApi.url, '/delete', {
    recordId: '10'
  }, { 'X-API-Key': 'key-a' });
  assert.equal(res2.status, 200);
  const tenants = [...authMock.state.points.values()].map((p) => p.payload.tenant_id);
  assert.deepEqual(tenants, ['tenant-b'], 'tenant-a のポイントだけが消えた');
});

test('auth: 名前付きDB（FIRESTORE_DATABASE_ID）でもテナント解決できる', async () => {
  const namedMock = await startMockBackend();
  const namedApi = await startApi(namedMock.url, {
    TENANT_AUTH_ENABLED: 'true', FIRESTORE_DATABASE_ID: 'default'
  });
  try {
    const res = await fetch(namedApi.url + '/health', { headers: { 'X-API-Key': 'key-a' } });
    const data = await res.json();
    assert.ok(data.runtime, '名前付きDBでも有効キーとして解決される');
  } finally {
    namedApi.child.kill();
    namedMock.server.close();
  }
});

test('auth: index-status もキーのテナントに強制される', async () => {
  const res = await fetch(authApi.url + '/index-status?tenantId=tenant-b', {
    headers: { 'X-API-Key': 'key-a' }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.tenantId, 'tenant-a', 'クエリの tenant-b は無視される');
});

test('auth: tags はクエリの tenantId を無視してキーのテナントで絞る', async () => {
  const res = await fetch(authApi.url + '/tags?tenantId=tenant-b', {
    headers: { 'X-API-Key': 'key-a' }
  });
  assert.equal(res.status, 200);
  const lastScroll = authMock.state.captured.scrolls.at(-1);
  assert.equal(lastScroll.filter.must[0].match.value, 'tenant-a');
});

// このsuite最後の /index テスト。以降のテストはポイント件数を前提にしないため、
// ここでバイナリ直送の登録を行っても他テストのstateを壊さない。
test('index: バイナリ直送でもキーのテナントに強制される', async () => {
  const res = await fetch(authApi.url + '/index', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'x-index-meta': encodeURIComponent(JSON.stringify({
        appId: '1', recordId: '30', tenantId: 'tenant-b', // ← 攻撃者が別テナントを指定しても
        drawingNo: 'DWG-A-030', fileKey: 'file-bin-auth', fileName: 'a.pdf'
      })),
      'X-API-Key': 'key-a'
    },
    body: PDF_A
  });
  assert.equal(res.status, 202, await res.text());

  const stored = [...authMock.state.points.values()].find((p) => p.payload.file_key === 'file-bin-auth');
  assert.ok(stored, 'バイナリ直送でもポイントが作成される');
  assert.equal(stored.payload.tenant_id, 'tenant-a', 'メタの tenantId ではなくキーのテナントが保存される');
});

// ================================================================
// Suite 3: kintone未設定（プラグインが pdf_base64 を送る新方式の検証）
// サーバーが KINTONE_BASE_URL / KINTONE_API_TOKEN を一切持たない状態でも
// /index が pdf_base64 経路で動くこと、pdf_base64 も kintone 設定も無い
// 場合は分かりやすい 400 になることを確認する。
// 他suiteのmock/apiはそれぞれの before で非同期に初期化されるため（実行順は
// 保証されない）、参照せず専用のモック・APIサーバーを持つ。
// ================================================================
let noKintoneMock, noKintoneApi;

before(async () => {
  noKintoneMock = await startMockBackend();
  noKintoneApi = await startApi(noKintoneMock.url, { KINTONE_BASE_URL: '', KINTONE_API_TOKEN: '' });
});

after(() => {
  noKintoneApi?.child.kill();
  noKintoneMock?.server.close();
});

test('index: pdf_base64 を渡せば kintone 接続不要で登録できる', async () => {
  const res = await postJson(noKintoneApi.url, '/index', {
    appId: '9', recordId: '900', tenantId: 'tenant-nokintone',
    drawingNo: 'DWG-NK-001', fileKey: 'file-x', fileName: 'x.pdf',
    pdf_base64: PDF_A.toString('base64')
  });
  assert.equal(res.status, 202, await res.text());

  const stored = [...noKintoneMock.state.points.values()].find((p) => p.payload.tenant_id === 'tenant-nokintone');
  assert.ok(stored, 'ポイントが作成される（kintone未設定でも pdf_base64 経路で登録できる）');
  assert.equal(stored.payload.file_key, 'file-x', 'file_key はプラグインが送った fileKey がそのまま保存される');
});

test('index: pdf_base64 も kintone 設定も無ければ 400', async () => {
  const res = await postJson(noKintoneApi.url, '/index', {
    appId: '9', recordId: '901', tenantId: 'tenant-nokintone',
    drawingNo: 'DWG-NK-002', fileKey: 'file-y', fileName: 'y.pdf'
  });
  const text = await res.text();
  assert.equal(res.status, 400, text);
  const data = JSON.parse(text);
  assert.match(data.error, /pdf_base64 is required/);
});

// バイナリ直送: 一括登録が「PDF Blob → base64文字列 → JSON.stringify」という
// 大きな一時文字列を積み続けてブラウザが Out of Memory になる問題を防ぐため、
// Content-Type: application/octet-stream のボディに生のPDFバイト列を、
// メタデータを x-index-meta ヘッダーに載せて送る経路。
test('index: バイナリ直送（octet-stream + x-index-meta）で登録できる', async () => {
  const res = await fetch(noKintoneApi.url + '/index', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'x-index-meta': encodeURIComponent(JSON.stringify({
        appId: '9', recordId: '910', tenantId: 'tenant-nokintone',
        drawingNo: 'DWG-BIN-001', fileKey: 'file-bin', fileName: 'b.pdf'
      }))
    },
    body: PDF_A
  });
  const text = await res.text();
  assert.equal(res.status, 202, text);

  const stored = [...noKintoneMock.state.points.values()].find((p) => p.payload.file_key === 'file-bin');
  assert.ok(stored, 'バイナリ直送でもポイントが作成される');
  assert.equal(stored.payload.tenant_id, 'tenant-nokintone');
});

test('index: x-index-meta が壊れていれば400', async () => {
  const res = await fetch(noKintoneApi.url + '/index', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'x-index-meta': '%7Bnot-valid-json'
    },
    body: PDF_A
  });
  const text = await res.text();
  assert.equal(res.status, 400, text);
  const data = JSON.parse(text);
  assert.match(data.error, /x-index-meta/);
});
