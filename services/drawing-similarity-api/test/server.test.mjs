// 統合テスト: server.js を実プロセスとして起動し、モックの Qdrant / kintone /
// Firestore に対して実 HTTP で検証する。
//
//   node --test test/
//
// 前提: pdftoppm (poppler-utils) がインストールされていること。
// 外部ネットワークには一切出ない。

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

// ---- モックバックエンド（Qdrant + kintone + Firestore を1サーバーで担当） ----
const startMockBackend = () => {
  const state = {
    collections: new Map(), // name -> { size }
    points: new Map(),      // id -> { id, vector, payload }
    captured: { upserts: [], searches: [], scrolls: [] },
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
        for (const id of body.points || []) state.points.delete(String(id));
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
