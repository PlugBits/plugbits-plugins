import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, createHmac, createSign, timingSafeEqual } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = Number(process.env.PORT || 8080);
const kintoneBaseUrl = String(process.env.KINTONE_BASE_URL || '').replace(/\/+$/, '');
const kintoneApiToken = process.env.KINTONE_API_TOKEN || '';
const renderDpi = Number(process.env.PDF_RENDER_DPI || 160);
const ocrDpi = Number(process.env.OCR_DPI || 250);
const geminiDpi = Number(process.env.GEMINI_DPI || 150);
const qdrantUrl = String(process.env.QDRANT_URL || '').replace(/\/+$/, '');
const qdrantApiKey = process.env.QDRANT_API_KEY || '';
const defaultEmbeddingProvider = process.env.NODE_ENV === 'production' ? 'openclip' : 'dummy';
const embeddingProvider = String(process.env.EMBEDDING_PROVIDER || defaultEmbeddingProvider).toLowerCase();
const qdrantCollection = process.env.QDRANT_COLLECTION || (
  embeddingProvider === 'dinov2' ? 'drawing_similarity_dinov2' :
    embeddingProvider === 'openclip' ? 'drawing_similarity_openclip' : 'drawing_similarity'
);
const defaultVectorSize = embeddingProvider === 'openclip' ? 512 : 384;
const expectedVectorSize = Number(process.env.VECTOR_SIZE || defaultVectorSize);
const dummyVectorSize = expectedVectorSize;
const pythonBin = process.env.PYTHON_BIN || 'python';
const openClipScript = process.env.OPENCLIP_SCRIPT || join(process.cwd(), 'embed_openclip.py');
const embeddingEndpoint = String(process.env.EMBEDDING_ENDPOINT || '').replace(/\/+$/, '');
const embeddingImageMode = String(process.env.EMBED_IMAGE_MODE || 'full').toLowerCase();
const embeddingRotations = String(process.env.EMBED_ROTATIONS || '0')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value % 90 === 0)
  .map((value) => ((value % 360) + 360) % 360)
  .filter((value, index, values) => values.indexOf(value) === index);
if (!embeddingRotations.length) {
  embeddingRotations.push(0);
}
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const VERTEX_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.VERTEX_PROJECT_ID || '';
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const VERTEX_MODEL = process.env.VERTEX_MODEL || 'gemini-3.5-flash';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const SA_CREDENTIALS_JSON = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '';
const defaultOcrEngine = GEMINI_API_KEY ? 'gemini' : (VERTEX_PROJECT_ID || SA_CREDENTIALS_JSON) ? 'vertex' : (process.env.NODE_ENV === 'production' ? 'tesseract' : 'none');
const ocrEngine = String(process.env.OCR_ENGINE || defaultOcrEngine).toLowerCase();
const ocrLangs = String(process.env.OCR_LANGS || 'eng+jpn').trim();
const tesseractBin = process.env.TESSERACT_BIN || 'tesseract';
const configuredOcrTimeoutMs = Number(process.env.OCR_TIMEOUT_MS || 120000);
const ocrTimeoutMs = Number.isFinite(configuredOcrTimeoutMs) && configuredOcrTimeoutMs > 0
  ? configuredOcrTimeoutMs
  : 120000;
const defaultShapeEngine = process.env.NODE_ENV === 'production' ? 'simple' : 'none';
const shapeEngine = String(process.env.SHAPE_ENGINE || defaultShapeEngine).toLowerCase();
const shapeImageMode = String(process.env.SHAPE_IMAGE_MODE || embeddingImageMode).toLowerCase();
const shapeScript = process.env.SHAPE_SCRIPT || join(process.cwd(), 'extract_shape_profile.py');
const cropScript = process.env.CROP_SCRIPT || join(process.cwd(), 'crop_title_block.py');
const configuredShapeTimeoutMs = Number(process.env.SHAPE_TIMEOUT_MS || 120000);
const shapeTimeoutMs = Number.isFinite(configuredShapeTimeoutMs) && configuredShapeTimeoutMs > 0
  ? configuredShapeTimeoutMs
  : 120000;
const configuredOpenClipTimeoutMs = Number(process.env.OPENCLIP_TIMEOUT_MS || 180000);
const openClipTimeoutMs = Number.isFinite(configuredOpenClipTimeoutMs) && configuredOpenClipTimeoutMs > 0
  ? configuredOpenClipTimeoutMs
  : 180000;
const scoreVectorFloor = Number(process.env.SCORE_VECTOR_FLOOR || 0.87);
const scoreVectorCeiling = Number(process.env.SCORE_VECTOR_CEILING || 0.99);
const scoreVectorWeight = Number(process.env.SCORE_VECTOR_WEIGHT || 0.78);
const scoreMetadataWeight = Number(process.env.SCORE_METADATA_WEIGHT || 0.12);
const scoreShapeWeight = Number(process.env.SCORE_SHAPE_WEIGHT || 0.10);
const scoreTypeBonus = Number(process.env.SCORE_TYPE_BONUS || 0.05);
const scoreAiShapeTagBonus = Number(process.env.SCORE_AI_SHAPE_TAG_BONUS || 0.05);
const parseTags = (value) => String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
let payloadIndexesReady = false;

const FIRESTORE_PROJECT_ID = process.env.FIRESTORE_PROJECT_ID || VERTEX_PROJECT_ID || '';
const TENANT_AUTH_ENABLED = process.env.TENANT_AUTH_ENABLED === 'true';

const formatLogFields = (fields = {}) => Object.entries(fields)
  .filter(([, value]) => value !== undefined && value !== null && value !== '')
  .map(([key, value]) => key + '=' + String(value).replace(/\s+/g, ' ').slice(0, 1000))
  .join(' ');

const indexLog = (message, fields) => {
  const suffix = formatLogFields(fields);
  console.log('[index] ' + message + (suffix ? ' ' + suffix : ''));
};

const indexError = (message, fields) => {
  const suffix = formatLogFields(fields);
  console.error('[index] ' + message + (suffix ? ' ' + suffix : ''));
};

const attachStep = (error, step, status, extra = {}) => {
  if (!error.step) {
    error.step = step;
  }
  if (status && !error.status) {
    error.status = status;
  }
  Object.assign(error, extra);
  return error;
};

const createStepError = (message, step, status, extra = {}) => (
  attachStep(new Error(message), step, status, extra)
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatEndpointError = (error) => {
  const parts = [error.message];
  if (error.cause?.code) {
    parts.push('code=' + error.cause.code);
  }
  if (error.cause?.address) {
    parts.push('address=' + error.cause.address);
  }
  if (error.cause?.port) {
    parts.push('port=' + error.cause.port);
  }
  return parts.filter(Boolean).join(' ');
};

// pdf_base64 は base64 で約 4/3 に膨らむため、30MB 上限 ≒ 22MB 程度の PDF まで。
// 上限なしだと巨大ボディで OOM・OCR課金の乱用が可能になる。
const MAX_JSON_BODY_BYTES = Number(process.env.MAX_JSON_BODY_BYTES || 30 * 1024 * 1024);

const readJson = async (request) => {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_JSON_BODY_BYTES) {
      // destroy() するとレスポンスを返す前に接続が切れるので、読むのを止めて
      // 413 を throw する（残りのボディは捨てられる）。
      const error = new Error(
        'Request body too large (max ' + Math.round(MAX_JSON_BODY_BYTES / 1024 / 1024) + 'MB)'
      );
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  const parsed = text ? JSON.parse(text) : {};
  // Phase 2: 認証済みテナントの強制はここで一元適用する。各ハンドラに任せると
  // 新規エンドポイントでの適用漏れ＝テナント越えの温床になる。
  if (request._forcedTenantId) {
    parsed.tenantId = request._forcedTenantId;
  }
  return parsed;
};

const sendJson = (response, status, payload) => {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(payload));
};

// --- サムネイル用の短命トークン ---
// <img> はカスタムヘッダー（X-API-Key）を送れないため、認証有効時の /thumbnail は
// HMAC トークンをクエリで受ける。トークンは /similar のレスポンスに同梱され、
// テナントフィルタ済みの検索結果からしか得られない＝実質テナントスコープになる。
// 日単位バケットで署名するので URL が1日固定になり、ブラウザキャッシュも効く。
const thumbTokenSecret = process.env.THUMB_TOKEN_SECRET ||
  createHash('sha256').update('thumb:' + (process.env.KINTONE_API_TOKEN || 'no-secret')).digest('hex');

if (process.env.TENANT_AUTH_ENABLED === 'true' && !process.env.THUMB_TOKEN_SECRET) {
  // フォールバック秘密鍵は KINTONE_API_TOKEN 由来のため、kintone トークンを
  // ローテーションすると全サムネイルURLが即失効する。本番は明示設定を推奨。
  console.warn('[thumbnail] THUMB_TOKEN_SECRET not set — deriving from KINTONE_API_TOKEN. Rotating the kintone token will invalidate all thumbnail URLs; set THUMB_TOKEN_SECRET explicitly.');
}

const thumbDayBucket = (offsetDays = 0) => {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
};

const mintThumbToken = (fileKey, offsetDays = 0) =>
  createHmac('sha256', thumbTokenSecret)
    .update(String(fileKey) + ':' + thumbDayBucket(offsetDays))
    .digest('hex')
    .slice(0, 32);

const verifyThumbToken = (fileKey, token) => {
  if (!fileKey || !token || typeof token !== 'string') return false;
  const provided = Buffer.from(token);
  // 当日と前日のトークンを許容（日付境界での失効を防ぐ）
  for (const offset of [0, -1]) {
    const expected = Buffer.from(mintThumbToken(fileKey, offset));
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      return true;
    }
  }
  return false;
};

const sendBinary = (response, status, contentType, buffer, extraHeaders = {}) => {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  response.end(buffer);
};

const getRuntimeInfo = () => ({
  embeddingProvider,
  embeddingImageMode,
  embeddingRotations,
  expectedVectorSize,
  vectorSize: expectedVectorSize,
  qdrantConfigured: isQdrantConfigured(),
  qdrantCollection,
  dummyVectorSize,
  pythonCommand: pythonBin,
  openclipScript: openClipScript,
  embeddingEndpoint: embeddingEndpoint || null,
  openclipDevice: process.env.OPENCLIP_DEVICE || 'auto',
  openclipTimeoutMs: openClipTimeoutMs,
  ocrEngine,
  ocrLangs,
  tesseractBin,
  ocrTimeoutMs,
  shapeEngine,
  shapeImageMode,
  shapeScript,
  shapeTimeoutMs,
  timeout: {
    ocrMs: ocrTimeoutMs,
    shapeMs: shapeTimeoutMs,
    openclipMs: openClipTimeoutMs
  },
  scoring: {
    vectorFloor: scoreVectorFloor,
    vectorCeiling: scoreVectorCeiling,
    vectorWeight: scoreVectorWeight,
    metadataWeight: scoreMetadataWeight,
    shapeWeight: scoreShapeWeight,
    typeBonus: scoreTypeBonus,
    aiShapeTagBonus: scoreAiShapeTagBonus
  },
  nodeVersion: process.version,
  cwd: process.cwd(),
  openclip: {
    model: process.env.OPENCLIP_MODEL || 'ViT-B-32',
    pretrained: process.env.OPENCLIP_PRETRAINED || 'laion2b_s34b_b79k',
    device: process.env.OPENCLIP_DEVICE || 'auto'
  },
  dinov2: {
    model: process.env.DINO_MODEL || 'facebook/dinov2-small',
    device: process.env.OPENCLIP_DEVICE || 'auto'
  },
  renderDpi
});

// --- Google Drive OAuthポップアップ（過去図面アーカイブ取込のGoogle Drive連携） ---
// マルチテナントSaaSでkintoneの各サブドメインを個別にGoogle Cloud Consoleへ
// オリジン登録するのは非現実的なため、OAuth同意とPicker選択は当方サーバー自身が
// ホストする固定オリジンのこのページ内で完結させ、結果だけ postMessage で
// 呼び出し元（kintoneプラグイン）に返す。サーバー側は何も永続化しない
// （drive.file スコープの一時アクセストークンのみで完結）。
const googleOauthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const googlePickerApiKey = process.env.GOOGLE_PICKER_API_KEY || '';
// PickerBuilder.setAppId に必要な GCP プロジェクト番号。未設定だと Picker で選んだ
// ファイルが drive.file スコープの付与先として正しく登録されず、選択直後の
// files.get?alt=media が 404（アクセス不可）になることがある。
const googleCloudProjectNumber = process.env.GOOGLE_CLOUD_PROJECT_NUMBER || '';

const buildGoogleOAuthPopupHtml = () => `<!doctype html>
<html><head><meta charset="utf-8"><title>Google Driveと連携</title></head>
<body style="font-family:system-ui,sans-serif;padding:24px;color:#334155;">
<p id="status">Googleに接続しています...</p>
<script>
(function () {
  var CLIENT_ID = ${JSON.stringify(googleOauthClientId)};
  var API_KEY = ${JSON.stringify(googlePickerApiKey)};
  var APP_ID = ${JSON.stringify(googleCloudProjectNumber)};
  var params = new URLSearchParams(window.location.search);
  var targetOrigin = params.get('origin') || '*';
  var statusEl = document.getElementById('status');

  function finish(payload) {
    try {
      if (window.opener) window.opener.postMessage(payload, targetOrigin);
    } catch (e) {}
    window.close();
  }

  function fail(message) {
    statusEl.textContent = 'エラー: ' + message;
    finish({ ok: false, error: message });
  }

  function openPicker(accessToken) {
    statusEl.textContent = 'ファイルを選択してください...';
    gapi.load('picker', function () {
      var view = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setMimeTypes('application/pdf')
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false);
      var builder = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setCallback(function (data) {
          if (data.action === google.picker.Action.PICKED) {
            var files = (data.docs || []).map(function (doc) {
              // resourceKey: 共有リンク経由等の一部ファイルは fileId だけでは
              // files.get が404になり、Drive API の resourceKey 要件を満たす必要がある。
              return { id: doc.id, name: doc.name, resourceKey: doc.resourceKey || '' };
            });
            finish({ ok: true, accessToken: accessToken, files: files });
          } else if (data.action === google.picker.Action.CANCEL) {
            finish({ ok: false, error: 'cancelled' });
          }
        });
      if (API_KEY) builder.setDeveloperKey(API_KEY);
      if (APP_ID) builder.setAppId(APP_ID);
      builder.build().setVisible(true);
    });
  }

  function start() {
    if (!CLIENT_ID) {
      fail('サーバーにGoogle連携が設定されていません（GOOGLE_OAUTH_CLIENT_ID未設定）');
      return;
    }
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      fail('Googleライブラリの読み込みに失敗しました');
      return;
    }
    var tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: function (response) {
        if (response.error) {
          fail(response.error);
          return;
        }
        openPicker(response.access_token);
      }
    });
    tokenClient.requestAccessToken();
  }

  window.__onGsiLoad = start;
})();
</script>
<script src="https://accounts.google.com/gsi/client" async defer onload="window.__onGsiLoad()"></script>
<script src="https://apis.google.com/js/api.js"></script>
</body></html>
`;

const buildMockResults = (body) => {
  const base = Number(body.recordId || 1000);
  return Array.from({ length: Math.min(Number(body.limit || 10), 10) }, (_, index) => {
    const recordId = base + index + 1;
    return {
      recordId,
      drawingNo: 'DWG-' + String(recordId).padStart(5, '0'),
      productName: index === 0 ? body.productName || 'sample part' : 'similar candidate ' + (index + 1),
      customer: 'PoC',
      score: Number((0.92 - index * 0.035).toFixed(3))
    };
  });
};

const isQdrantConfigured = () => Boolean(qdrantUrl);

const buildVector = (buffer) => {
  const vector = [];
  let seed = createHash('sha256').update(buffer).digest();

  while (vector.length < dummyVectorSize) {
    seed = createHash('sha256').update(seed).digest();
    for (const byte of seed) {
      vector.push((byte / 127.5) - 1);
      if (vector.length === dummyVectorSize) {
        break;
      }
    }
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / norm).toFixed(8)));
};

const runJsonCommand = (command, args, options = {}) => new Promise((resolve, reject) => {
  const {
    log = null,
    errorLog = null,
    logLabel = 'command',
    step = 'command',
    timeoutMs = 0,
    timeoutMessage = command + ' timed out',
    ...spawnOptions
  } = options;
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...spawnOptions
  });
  const stdout = [];
  const stderr = [];
  let settled = false;
  let timedOut = false;
  let timeoutId = null;

  if (log) {
    log(logLabel + ' spawn start', { command, timeoutMs });
  }

  const settle = (callback, value) => {
    if (settled) {
      return;
    }
    settled = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    callback(value);
  };

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      if (errorLog) {
        errorLog(logLabel + ' timeout', { timeoutMs });
      }
      child.kill('SIGKILL');
    }, timeoutMs);
  }

  child.stdout.on('data', (chunk) => {
    stdout.push(chunk);
    if (log) {
      log(logLabel + ' stdout received', { bytes: chunk.length });
    }
  });
  child.stderr.on('data', (chunk) => {
    stderr.push(chunk);
    if (errorLog) {
      errorLog(logLabel + ' stderr received', {
        bytes: chunk.length,
        text: chunk.toString('utf8')
      });
    }
  });

  child.on('error', (error) => {
    if (errorLog) {
      errorLog(logLabel + ' spawn error', { error: error.message });
    }
    settle(reject, attachStep(error, step));
  });
  child.on('close', (code) => {
    if (log) {
      log(logLabel + ' exit code=' + code);
    }
    if (timedOut) {
      settle(reject, createStepError(timeoutMessage, step, 504, { timeoutMs }));
      return;
    }

    const output = Buffer.concat(stdout).toString('utf8');
    if (code !== 0) {
      settle(reject, createStepError(command + ' exited with ' + code + ': ' + Buffer.concat(stderr).toString('utf8'), step));
      return;
    }

    try {
      settle(resolve, JSON.parse(output));
    } catch (error) {
      settle(reject, attachStep(new Error('Failed to parse ' + command + ' JSON output: ' + error.message + ' output=' + output.slice(0, 300)), step));
    }
  });
});

const runTextCommand = (command, args, options = {}) => new Promise((resolve, reject) => {
  const {
    log = null,
    errorLog = null,
    logLabel = 'command',
    step = 'command',
    timeoutMs = 0,
    timeoutMessage = command + ' timed out',
    ...spawnOptions
  } = options;
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...spawnOptions
  });
  const stdout = [];
  const stderr = [];
  let settled = false;
  let timedOut = false;
  let timeoutId = null;

  if (log) {
    log(logLabel + ' spawn start', { command, timeoutMs });
  }

  const settle = (callback, value) => {
    if (settled) {
      return;
    }
    settled = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    callback(value);
  };

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      if (errorLog) {
        errorLog(logLabel + ' timeout', { timeoutMs });
      }
      child.kill('SIGKILL');
    }, timeoutMs);
  }

  child.stdout.on('data', (chunk) => {
    stdout.push(chunk);
    if (log) {
      log(logLabel + ' stdout received', { bytes: chunk.length });
    }
  });
  child.stderr.on('data', (chunk) => {
    stderr.push(chunk);
    if (errorLog) {
      errorLog(logLabel + ' stderr received', {
        bytes: chunk.length,
        text: chunk.toString('utf8')
      });
    }
  });

  child.on('error', (error) => {
    if (errorLog) {
      errorLog(logLabel + ' spawn error', { error: error.message });
    }
    settle(reject, attachStep(error, step));
  });
  child.on('close', (code) => {
    if (log) {
      log(logLabel + ' exit code=' + code);
    }
    if (timedOut) {
      settle(reject, createStepError(timeoutMessage, step, 504, { timeoutMs }));
      return;
    }
    if (code !== 0) {
      settle(reject, createStepError(command + ' exited with ' + code + ': ' + Buffer.concat(stderr).toString('utf8'), step));
      return;
    }
    settle(resolve, Buffer.concat(stdout).toString('utf8'));
  });
});

const normalizeEmbeddingResult = (data) => {
  if (!Array.isArray(data.vector) || !data.vector.length) {
    throw new Error('OpenCLIP returned an empty vector');
  }
  return {
    provider: data.provider || 'openclip',
    model: data.model || '',
    pretrained: data.pretrained || '',
    device: data.device || '',
    imageMode: data.image_mode || embeddingImageMode,
    image: data.image || null,
    vector: data.vector
  };
};

const buildOpenClipVectorViaEndpoint = async (buffer, context = {}) => {
  const startedAt = Date.now();
  let lastError = null;

  if (context.log) {
    context.log('openclip endpoint request start', { endpoint: embeddingEndpoint, timeoutMs: openClipTimeoutMs });
  }

  while (Date.now() - startedAt < openClipTimeoutMs) {
    const controller = new AbortController();
    const remainingMs = Math.max(1000, openClipTimeoutMs - (Date.now() - startedAt));
    const timeoutId = setTimeout(() => controller.abort(), remainingMs);
    try {
      const response = await fetch(embeddingEndpoint + '/embed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image_base64: buffer.toString('base64'),
          image_mode: embeddingImageMode,
          rotation: Number(context.rotation || 0)
        }),
        signal: controller.signal
      });
      const text = await response.text();
      if (context.log) {
        context.log('openclip endpoint response received', { status: response.status, bytes: text.length });
      }
      if (!response.ok) {
        throw createStepError('OpenCLIP endpoint failed with ' + response.status + ': ' + text.slice(0, 500), 'embedding', response.status === 504 ? 504 : 500);
      }
      return normalizeEmbeddingResult(JSON.parse(text));
    } catch (error) {
      lastError = error;
      if (error.name === 'AbortError') {
        throw createStepError('OpenCLIP embedding timed out', 'embedding', 504, { timeoutMs: openClipTimeoutMs });
      }
      if (context.errorLog) {
        context.errorLog('openclip endpoint retry', { endpoint: embeddingEndpoint, error: formatEndpointError(error) });
      }
      await sleep(1000);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (lastError) {
    throw attachStep(new Error('Embedding endpoint failed: ' + formatEndpointError(lastError)), 'embedding');
  }
  throw createStepError('OpenCLIP embedding timed out', 'embedding', 504, { timeoutMs: openClipTimeoutMs });
};

const buildOpenClipVector = async (buffer, context = {}) => {
  if (embeddingEndpoint) {
    return buildOpenClipVectorViaEndpoint(buffer, context);
  }

  const workDir = await mkdtemp(join(tmpdir(), 'drawing-embedding-'));
  const imagePath = join(workDir, 'page.png');

  try {
    await writeFile(imagePath, buffer);
    const data = await runJsonCommand(pythonBin, [openClipScript, imagePath], {
      env: {
        ...process.env,
        EMBED_IMAGE_MODE: embeddingImageMode
      },
      log: context.log,
      errorLog: context.errorLog,
      logLabel: 'openclip',
      step: 'embedding',
      timeoutMs: openClipTimeoutMs,
      timeoutMessage: 'OpenCLIP embedding timed out'
    });
    return normalizeEmbeddingResult(data);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

const GEMINI_OCR_PROMPT = [
  '{"drawingNo":"","productName":"","material":"","dimension":"","shapeComment":"","shapeTags":[]}',
  '',
  'This is a full-page engineering drawing image. Locate the title block (表題欄) — the bordered table usually at the bottom-right corner — then fill in the JSON above.',
  'YOUR ENTIRE RESPONSE MUST BE ONLY THE JSON — no explanation, no markdown, no other text.',
  '',
  'DRAWING NUMBER (図番 / DWG NO / DRAWING NUMBER):',
  '- The value is written one character per bordered cell, separated by thin grid lines.',
  '- CRITICAL: the grid lines between cells are NOT commas and NOT separators.',
  '- Read ALL characters left-to-right and JOIN them directly — no spaces, no commas.',
  '- CORRECT output: "K2054-0568K"',
  '- WRONG output:   "K,2,0,5,4,-,0,5,6,8,K"  ← never produce commas inside drawingNo',
  '- Pattern: starts with 1–2 capital letters (K, KM, KA…), then digits and hyphens.',
  '',
  'PRODUCT NAME (品名 / PART NAME):',
  '- Find the field labeled 品名 or PART NAME.',
  '- Return the value exactly as written — Japanese or English, whichever is present.',
  '- Example: "STAY (SEAT BELT, 2)" or "ステー（シートベルト，２）"',
  '- Note: commas INSIDE a product name are valid (e.g. "SEAT BELT, 2").',
  '',
  'MATERIAL (材質 / MATERIAL):',
  '- Find the field labeled 材質 or MATERIAL.',
  '- Return the material code/name only, WITHOUT any size value.',
  '- Examples: "S45C", "SUS304", "SPCC", "A5052P", "SS400", "SGD400-D", "冷延鋼板"',
  '- If the field contains both material and size (e.g. "SPCC t1.6" or "S45C φ28.6"), put only the material code here.',
  '',
  'DIMENSION (寸法 / 板厚 / 外径):',
  '- Extract the key dimension — whichever is present in the title block:',
  '  - Plate thickness (板厚): written as "t1.6", "t=2.0", "3.2mm" → return e.g. "t1.6"',
  '  - Outer diameter (外径/パイ/φ): written as "φ28.6", "ψ28.6", "Φ28" → return e.g. "φ28.6"',
  '- This value often appears right after the material code in the 材質 field.',
  '- If no dimension is found anywhere in the title block, return "".',
  '',
  'SHAPE COMMENT (shapeComment):',
  '- Look at the actual drawn shape/outline in the drawing area (ignore the title block here).',
  '- Write ONE short Japanese sentence describing the overall form: rough category (例: L字ブラケット, 円筒軸, 平板, パイプ, カバー) and notable features (穴の数や配置, 折り曲げ, スリット, フランジ等).',
  '- Example: "L字型のブラケットで、4隅に取付穴、中央に大きな丸穴が1つある"',
  '- This is a free-text reference comment for a human reviewer — it is NOT used for scoring, so describe what you actually see rather than guessing.',
  '- If you cannot make out the shape, return "".',
  '',
  'SHAPE TAGS (shapeTags):',
  '- Same shape you just described, but broken into 1–4 short keyword tags instead of a sentence.',
  '- Each tag should be a short noun phrase, no punctuation: rough category first (例: "L字ブラケット"), then notable features (例: "丸穴4", "曲げ2", "フランジ", "スリット").',
  '- These tags ARE used for similarity matching, so keep wording consistent and reusable across drawings — prefer the same tag text for the same feature instead of inventing new phrasing each time.',
  '- Example: ["L字ブラケット", "丸穴4", "曲げ2"]',
  '- If you cannot make out the shape, return [].',
  '',
  'Use "" for any field you cannot find.',
  'Output ONLY the JSON. Start with { and end with }.'
].join('\n');

const GEMINI_OCR_GENERATION_CONFIG = {
  temperature: 0,
  maxOutputTokens: 1024,
  thinkingConfig: { thinkingBudget: 0 }
};

const GEMINI_LOCATE_PROMPT = [
  '{"x":0,"y":0,"width":0,"height":0}',
  '',
  'Fill in the above JSON with the pixel coordinates of the title block (表題欄) in this engineering drawing image.',
  'The title block is the bordered table (usually bottom-right corner) containing fields like 図番, 品名, material, scale, etc.',
  'x and y are the top-left corner pixel coordinates. width and height are in pixels.',
  'IMPORTANT: Do NOT use markdown. Do NOT use code blocks. Do NOT use backticks. No ```json wrapper.',
  'Your entire response must be ONLY the raw JSON object — no other text before or after.',
  'Output ONLY the JSON. Start with { and end with }.'
].join('\n');

const extractGeminiJson = (raw) => {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return { drawingNo: '', productName: '', material: '', dimension: '', shapeComment: '', shapeTags: [] };
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { drawingNo: '', productName: '', material: '', dimension: '', shapeComment: '', shapeTags: [] };
  }
};

const buildOcrTextGemini = async (pngBuffer) => {
  if (!GEMINI_API_KEY) {
    const err = new Error('GEMINI_API_KEY environment variable is not set');
    err.status = 500;
    throw err;
  }
  const base64 = pngBuffer.toString('base64');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=` + GEMINI_API_KEY,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: GEMINI_OCR_PROMPT },
          { inline_data: { mime_type: 'image/png', data: base64 } }
        ]}],
        generationConfig: GEMINI_OCR_GENERATION_CONFIG
      })
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error('Gemini API HTTP ' + res.status + ': ' + errText.slice(0, 200));
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const raw = parts.filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
  console.log('[ocr] gemini finishReason=' + candidate?.finishReason + ' textLength=' + raw.length);
  const geminiExtracted = extractGeminiJson(raw);

  return {
    engine: 'gemini',
    langs: 'ja+en',
    text: raw,
    geminiExtracted
  };
};

let _gcpTokenCache = null;
let _geminiTokenCache = null;

const getGcpAccessTokenFromServiceAccountKey = async (keyJson, scope) => {
  const { client_email, private_key } = keyJson;
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp,
    iat
  })).toString('base64url');
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(private_key, 'base64url');
  const jwt = `${header}.${payload}.${signature}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
  });
  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    const err = new Error('SA key token exchange failed: ' + errText.slice(0, 200));
    err.status = 500;
    throw err;
  }
  return tokenRes.json();
};

const getGcpAccessToken = async () => {
  // テスト/ローカル開発用: 固定トークンを注入できる（本番では未設定）
  if (process.env.GCP_ACCESS_TOKEN) {
    return process.env.GCP_ACCESS_TOKEN;
  }
  const now = Date.now();
  if (_gcpTokenCache && _gcpTokenCache.expiresAt > now + 30000) {
    return _gcpTokenCache.token;
  }
  let data;
  if (SA_CREDENTIALS_JSON) {
    const keyJson = JSON.parse(Buffer.from(SA_CREDENTIALS_JSON, 'base64').toString('utf8'));
    data = await getGcpAccessTokenFromServiceAccountKey(keyJson, 'https://www.googleapis.com/auth/cloud-platform');
  } else {
    const res = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' } }
    );
    if (!res.ok) {
      const err = new Error('Failed to get GCP access token: HTTP ' + res.status);
      err.status = 500;
      throw err;
    }
    data = await res.json();
  }
  _gcpTokenCache = { token: data.access_token, expiresAt: now + (data.expires_in || 3599) * 1000 };
  return _gcpTokenCache.token;
};

// ---- Tenant authentication via Firestore ----

const _tenantCache = new Map(); // apiKey -> { tenant | null, expiresAt }
const TENANT_CACHE_TTL_MS = 5 * 60 * 1000;
const TENANT_CACHE_MISS_TTL_MS = 60 * 1000;

const parseFirestoreFields = (fields) => {
  if (!fields) return null;
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v.stringValue !== undefined) out[k] = v.stringValue;
    else if (v.booleanValue !== undefined) out[k] = v.booleanValue;
    else if (v.integerValue !== undefined) out[k] = Number(v.integerValue);
    else if (v.doubleValue !== undefined) out[k] = v.doubleValue;
  }
  return out;
};

// テスト用にエンドポイントを差し替え可能にする（本番は既定の googleapis.com）
const FIRESTORE_BASE_URL = String(process.env.FIRESTORE_BASE_URL || 'https://firestore.googleapis.com').replace(/\/+$/, '');
// Firestore のデータベースID。本来の既定DBは "(default)"（括弧つき）だが、
// 名前付きDB（例: "default"）を使う環境もあるため env で指定可能にする。
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || '(default)';

const fetchTenantDoc = async (docId, gcpToken) => {
  const docUrl = `${FIRESTORE_BASE_URL}/v1/projects/${FIRESTORE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents/tenants/${encodeURIComponent(docId)}`;
  const res = await fetch(docUrl, { headers: { Authorization: `Bearer ${gcpToken}` } });
  if (!res.ok) return null;
  const doc = await res.json();
  return parseFirestoreFields(doc.fields);
};

const resolveTenant = async (apiKey) => {
  if (!apiKey) return null;
  const now = Date.now();
  const cached = _tenantCache.get(apiKey);
  if (cached && cached.expiresAt > now) return cached.tenant;

  if (!FIRESTORE_PROJECT_ID) {
    console.warn('[auth] FIRESTORE_PROJECT_ID not set — cannot resolve tenant');
    return null;
  }
  try {
    const token = await getGcpAccessToken();
    // 推奨: ドキュメントID = SHA-256(APIキー)。Firestore 上にキーが平文で並ばない。
    // 移行期間の後方互換として、見つからなければ旧形式（生キーがID）も引く。
    const hashedId = createHash('sha256').update(apiKey).digest('hex');
    let tenant = await fetchTenantDoc(hashedId, token);
    if (!tenant) {
      tenant = await fetchTenantDoc(apiKey, token);
      if (tenant) {
        console.warn('[auth] legacy plaintext-key tenant doc used — migrate to sha256 doc id: ' + hashedId);
      }
    }
    if (!tenant || tenant.active === false) {
      _tenantCache.set(apiKey, { tenant: null, expiresAt: now + TENANT_CACHE_MISS_TTL_MS });
      return null;
    }
    _tenantCache.set(apiKey, { tenant, expiresAt: now + TENANT_CACHE_TTL_MS });
    return tenant;
  } catch (e) {
    console.error('[auth] Firestore lookup error:', e.message);
    return null;
  }
};

// ---- end Tenant authentication ----

const getGeminiAccessToken = async () => {
  const now = Date.now();
  if (_geminiTokenCache && _geminiTokenCache.expiresAt > now + 30000) {
    return _geminiTokenCache.token;
  }
  if (!SA_CREDENTIALS_JSON) {
    const err = new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON is required for Gemini API auth');
    err.status = 500;
    throw err;
  }
  const keyJson = JSON.parse(Buffer.from(SA_CREDENTIALS_JSON, 'base64').toString('utf8'));
  const data = await getGcpAccessTokenFromServiceAccountKey(keyJson, 'https://www.googleapis.com/auth/generative-language');
  _geminiTokenCache = { token: data.access_token, expiresAt: now + (data.expires_in || 3599) * 1000 };
  return _geminiTokenCache.token;
};

const buildOcrTextVertexAI = async (pngBuffer) => {
  if (!VERTEX_PROJECT_ID) {
    const err = new Error('GOOGLE_CLOUD_PROJECT (or VERTEX_PROJECT_ID) must be set for Vertex AI OCR');
    err.status = 500;
    throw err;
  }
  const base64 = pngBuffer.toString('base64');
  const accessToken = await getGcpAccessToken();
  // The global endpoint has no location prefix in the hostname (unlike regional endpoints).
  // Gemini 3.x models are often only served on the global endpoint, not regional ones.
  const vertexHost = VERTEX_LOCATION === 'global'
    ? 'aiplatform.googleapis.com'
    : `${VERTEX_LOCATION}-aiplatform.googleapis.com`;
  const endpoint = `https://${vertexHost}/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL}:generateContent`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [
        { text: GEMINI_OCR_PROMPT },
        { inline_data: { mime_type: 'image/png', data: base64 } }
      ]}],
      generationConfig: GEMINI_OCR_GENERATION_CONFIG
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error('Vertex AI HTTP ' + res.status + ': ' + errText.slice(0, 200));
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const raw = parts.filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
  console.log('[ocr] vertex finishReason=' + candidate?.finishReason + ' textLength=' + raw.length);
  const geminiExtracted = extractGeminiJson(raw);

  return { engine: 'vertex', langs: 'ja+en', text: raw, geminiExtracted };
};

const callGeminiVision = async (pngBuffer, prompt, maxOutputTokens = 256) => {
  const base64 = pngBuffer.toString('base64');
  const reqBody = JSON.stringify({
    contents: [{ parts: [
      { text: prompt },
      { inline_data: { mime_type: 'image/png', data: base64 } }
    ]}],
    generationConfig: { temperature: 0, maxOutputTokens }
  });

  let res;
  if (GEMINI_API_KEY) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=` + GEMINI_API_KEY,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody }
    );
  } else {
    const accessToken = await getGeminiAccessToken();
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken }, body: reqBody }
    );
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error('Gemini API HTTP ' + res.status + ': ' + errText.slice(0, 200));
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  return (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
};

const locateTitleBlock = async (pngBuffer) => {
  const rawFull = await callGeminiVision(pngBuffer, GEMINI_LOCATE_PROMPT, 128);
  // Strip markdown code fences if present (e.g. ```json\n{...}\n```)
  const raw = rawFull.replace(/^```[a-z]*\s*/i, '').replace(/\s*```\s*$/, '').trim();
  console.log('[ocr] locate pass1 raw=' + JSON.stringify(raw));
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    console.log('[ocr] locate pass1 no JSON found, fallback to full image');
    return null;
  }
  try {
    const bbox = JSON.parse(raw.slice(start, end + 1));
    const x = Number(bbox.x);
    const y = Number(bbox.y);
    const w = Number(bbox.width);
    const h = Number(bbox.height);
    if (!Number.isFinite(x) || !Number.isFinite(y) || w <= 0 || h <= 0) {
      console.log('[ocr] locate pass1 invalid bbox x=' + x + ' y=' + y + ' w=' + w + ' h=' + h);
      return null;
    }
    console.log('[ocr] locate pass1 bbox x=' + x + ' y=' + y + ' w=' + w + ' h=' + h);
    return { x, y, width: w, height: h };
  } catch (e) {
    console.log('[ocr] locate pass1 parse error=' + e.message + ' raw=' + JSON.stringify(raw));
    return null;
  }
};

const cropToRegion = async (pngBuffer, bbox) => {
  const workDir = await mkdtemp(join(tmpdir(), 'drawing-crop-'));
  const inputPath = join(workDir, 'page.png');
  const outputPath = join(workDir, 'cropped.png');
  try {
    await writeFile(inputPath, pngBuffer);
    await runCommand(pythonBin, [cropScript, inputPath, outputPath,
      String(Math.round(bbox.x)), String(Math.round(bbox.y)),
      String(Math.round(bbox.width)), String(Math.round(bbox.height))]);
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

const cropPngForOcr = async (pngBuffer) => {
  const workDir = await mkdtemp(join(tmpdir(), 'drawing-crop-'));
  const inputPath = join(workDir, 'page.png');
  const outputPath = join(workDir, 'cropped.png');
  try {
    await writeFile(inputPath, pngBuffer);
    // Read PNG dimensions from header (bytes 16-23) to detect landscape orientation
    const imgWidth = pngBuffer.readUInt32BE(16);
    const imgHeight = pngBuffer.readUInt32BE(20);
    const isLandscape = imgWidth > imgHeight;
    // Landscape A3: title block spans ~44% of page width — use wider crop
    const bottomFrac = isLandscape ? '0.28' : '0.25';
    const rightFrac = isLandscape ? '0.50' : '0.40';
    console.log('[ocr] crop orient=' + (isLandscape ? 'landscape' : 'portrait') + ' ' + imgWidth + 'x' + imgHeight + ' rightFrac=' + rightFrac);
    await runCommand(pythonBin, [cropScript, inputPath, outputPath, bottomFrac, rightFrac]);
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

const buildOcrText = async (pngBuffer, context = {}) => {
  // context.engine で呼び出し側が強制上書き可能（アーカイブ一括取込は件数が多く
  // Gemini/Vertex だとコスト・レート制限が問題になるため Tesseract に固定する）。
  const engine = context.engine || ocrEngine;
  if (engine === 'gemini') {
    return buildOcrTextGemini(pngBuffer);
  }
  if (engine === 'vertex') {
    return buildOcrTextVertexAI(pngBuffer);
  }
  if (engine === 'none') {
    return {
      engine: 'none',
      langs: '',
      text: '',
      imagePath: ''
    };
  }
  if (engine !== 'tesseract') {
    const error = new Error('Unsupported OCR_ENGINE: ' + engine);
    error.status = 500;
    throw error;
  }

  const workDir = await mkdtemp(join(tmpdir(), 'drawing-ocr-'));
  const imagePath = join(workDir, 'page.png');

  try {
    await writeFile(imagePath, pngBuffer);
    const text = await runTextCommand(tesseractBin, [imagePath, 'stdout', '--oem', '1', '--psm', '6', '-l', ocrLangs], {
      env: process.env,
      log: context.log,
      errorLog: context.errorLog,
      logLabel: 'tesseract',
      step: 'ocr',
      timeoutMs: ocrTimeoutMs,
      timeoutMessage: 'OCR timed out'
    });
    return {
      engine: 'tesseract',
      langs: ocrLangs,
      text: String(text || '').replace(/\u0000/g, '').trim(),
      imagePath
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

const buildShapeProfile = async (pngBuffer, context = {}) => {
  if (shapeEngine === 'none') {
    return {
      engine: 'none',
      mode: 'none',
      bbox: null,
      bboxAspectRatio: 0,
      bboxAreaRatio: 0,
      inkRatio: 0,
      centroidX: 0.5,
      centroidY: 0.5,
      edgeDensity: 0,
      verticalProfile: [],
      horizontalProfile: [],
      huMoments: []
    };
  }
  if (shapeEngine !== 'simple') {
    const error = new Error('Unsupported SHAPE_ENGINE: ' + shapeEngine);
    error.status = 500;
    throw error;
  }

  const workDir = await mkdtemp(join(tmpdir(), 'drawing-shape-'));
  const imagePath = join(workDir, 'page.png');

  try {
    await writeFile(imagePath, pngBuffer);
    const data = await runJsonCommand(pythonBin, [shapeScript, imagePath], {
      env: {
        ...process.env,
        SHAPE_ENGINE: shapeEngine,
        SHAPE_IMAGE_MODE: shapeImageMode,
        EMBED_IMAGE_MODE: embeddingImageMode
      },
      log: context.log,
      errorLog: context.errorLog,
      logLabel: 'shape',
      step: 'shape',
      timeoutMs: shapeTimeoutMs,
      timeoutMessage: 'Shape extraction timed out'
    });

    return {
      engine: data.engine || 'simple',
      mode: data.mode || shapeEngine,
      cropBox: data.cropBox || data.crop_box || null,
      width: Number(data.width || 0),
      height: Number(data.height || 0),
      sourceWidth: Number(data.sourceWidth || 0),
      sourceHeight: Number(data.sourceHeight || 0),
      bbox: data.bbox || null,
      bboxAspectRatio: Number(data.bboxAspectRatio || 0),
      bboxAreaRatio: Number(data.bboxAreaRatio || 0),
      inkRatio: Number(data.inkRatio || 0),
      centroidX: Number(data.centroidX || 0.5),
      centroidY: Number(data.centroidY || 0.5),
      edgeDensity: Number(data.edgeDensity || 0),
      verticalProfile: Array.isArray(data.verticalProfile) ? data.verticalProfile : [],
      horizontalProfile: Array.isArray(data.horizontalProfile) ? data.horizontalProfile : [],
      huMoments: Array.isArray(data.huMoments) ? data.huMoments : []
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

const normalizeOcrText = (text) => String(text || '')
  .replace(/\u0000/g, '')
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n')
  .split('\n')
  .map((line) => line.replace(/\s+/g, ' ').trim())
  .filter(Boolean)
  .join('\n')
  .trim();

const pickMatch = (text, patterns) => {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match) {
      return match[1] || match[0] || '';
    }
  }
  return '';
};

const inferShapeCategory = (text, productName) => {
  const source = ((text || '') + ' ' + (productName || '')).toLowerCase();
  const rules = [
    ['bracket', /bracket|stay|lever/i],
    ['plate', /plate|sheet|panel/i],
    ['shaft', /shaft|rod|pin/i],
    ['pipe', /pipe|tube/i],
    ['cover', /cover|cap/i],
    ['frame', /frame/i],
    ['housing', /housing|case|box/i]
  ];
  for (const [label, pattern] of rules) {
    if (pattern.test(source)) {
      return label;
    }
  }
  return '';
};

const extractOcrFields = (ocrText, body = {}) => {
  const text = normalizeOcrText(ocrText);
  const lines = text.split('\n').filter(Boolean);

  const drawingNo = String(body.drawingNo || pickMatch(text, [
    /(?:図番|DRAWING\s*NO\.?|DWG\.?\s*NO\.?|PART\s*NO\.?)\s*[:#\s]\s*([A-Z0-9][A-Z0-9\-\/_\.]{2,})/i,
    /\b([A-Z][0-9]{3,}[-_][0-9A-Z][0-9A-Z\-\/_\.]{3,})\b/
  ]) || '').trim();
  const productName = String(body.productName || pickMatch(text, [
    /(?:品名|TITLE|NAME|DESCRIPTION)\s*[:#\s]\s*([^\n]{2,60})/i
  ]) || '').trim();
  const material = String(body.material || pickMatch(text, [
    /(?:MATERIAL|MATL\.?|MAT\.?)\s*[:#-]?\s*([^\n]{2,80})/i,
    /\b(SUS\d{3,4}|SS4?0?0|SPCC|SPHC|AL(?:UMINUM)?|A\d{4}|S45C|SCM\d{2}|SKD\d{2}|CRS|SGCC|SUJ\d{2})\b/i
  ]) || '').trim();
  const dimension = String(body.dimension || pickMatch(text, [
    /[φΦψ]\s*([0-9]+(?:\.[0-9]+)?)/,
    /(?:THK|T)\s*[:#-]?\s*([0-9]+(?:\.[0-9]+)?\s*(?:mm)?)/i,
    /\bt\s*([0-9]+(?:\.[0-9]+)?\s*(?:mm)?)\b/i
  ]) || '').trim();
  const customer = String(body.customer || pickMatch(text, [
    /(?:CUSTOMER|CLIENT)\s*[:#-]?\s*([^\n]{2,80})/i
  ]) || '').trim();
  const revision = String(body.revision || pickMatch(text, [
    /(?:REV(?:ISION)?|REV\.)\s*[:#-]?\s*([A-Z0-9\-]+)/i
  ]) || '').trim();

  const extracted = {
    drawingNo,
    productName,
    material,
    dimension,
    customer,
    revision,
    shapeCategory: inferShapeCategory(text, productName || body.productName || ''),
    ocrText: text,
    ocrLines: lines,
    extractionConfidence: 0.25
  };

  const score = [drawingNo, productName, material, dimension, customer, revision].filter(Boolean).length;
  extracted.extractionConfidence = Number((0.25 + score * 0.12).toFixed(2));
  return extracted;
};

const normalizeArrayNumber = (value) => {
  let values = value;
  if (typeof values === 'string') {
    try {
      values = JSON.parse(values);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
};

const normalizeShapeProfile = (value) => {
  if (!value) {
    return null;
  }

  let profile = value;
  if (typeof value === 'string') {
    try {
      profile = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!profile || typeof profile !== 'object') {
    return null;
  }

  return {
    engine: String(profile.engine || 'simple'),
    mode: String(profile.mode || 'simple'),
    cropBox: profile.cropBox || profile.crop_box || null,
    width: Number(profile.width || 0),
    height: Number(profile.height || 0),
    sourceWidth: Number(profile.sourceWidth || profile.source_width || 0),
    sourceHeight: Number(profile.sourceHeight || profile.source_height || 0),
    bbox: typeof profile.bbox === 'string'
      ? (() => {
        try {
          const parsed = JSON.parse(profile.bbox);
          return parsed && typeof parsed === 'object' ? parsed : null;
        } catch {
          return null;
        }
      })()
      : profile.bbox && typeof profile.bbox === 'object'
        ? profile.bbox
        : null,
    bboxAspectRatio: Number(profile.bboxAspectRatio || 0),
    bboxAreaRatio: Number(profile.bboxAreaRatio || 0),
    inkRatio: Number(profile.inkRatio || 0),
    centroidX: Number(profile.centroidX || 0.5),
    centroidY: Number(profile.centroidY || 0.5),
    edgeDensity: Number(profile.edgeDensity || 0),
    verticalProfile: normalizeArrayNumber(profile.verticalProfile),
    horizontalProfile: normalizeArrayNumber(profile.horizontalProfile),
    huMoments: normalizeArrayNumber(profile.huMoments)
  };
};

const safeJsonStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

const ratioSimilarity = (left, right) => {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
    return null;
  }
  const diff = Math.abs(Math.log(a / b));
  return Math.max(0, 1 - Math.min(diff / 1.5, 1));
};

const boundedDifferenceSimilarity = (left, right) => {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return null;
  }
  return Math.max(0, 1 - Math.min(Math.abs(a - b), 1));
};

const profileSimilarity = (leftValues, rightValues) => {
  if (!Array.isArray(leftValues) || !Array.isArray(rightValues) || !leftValues.length || !rightValues.length) {
    return null;
  }
  const length = Math.min(leftValues.length, rightValues.length);
  let diff = 0;
  for (let index = 0; index < length; index += 1) {
    diff += Math.abs(Number(leftValues[index] || 0) - Number(rightValues[index] || 0));
  }
  return Math.max(0, 1 - Math.min(diff / 2, 1));
};

const huMomentSimilarity = (huA, huB) => {
  if (!Array.isArray(huA) || !Array.isArray(huB) || !huA.length || !huB.length) {
    return null;
  }
  const length = Math.min(huA.length, huB.length);
  let dist = 0;
  let count = 0;
  for (let i = 0; i < length; i += 1) {
    const a = Number(huA[i]);
    const b = Number(huB[i]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0 || b === 0) {
      continue;
    }
    dist += Math.abs(1 / Math.log10(Math.abs(a)) - 1 / Math.log10(Math.abs(b)));
    count += 1;
  }
  if (count === 0) {
    return null;
  }
  return Math.max(0, 1 - Math.min(dist / 2, 1));
};

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const calibrateVectorScore = (score) => {
  const raw = Number(score);
  if (!Number.isFinite(raw)) {
    return 0;
  }
  const floor = Number.isFinite(scoreVectorFloor) ? scoreVectorFloor : 0.75;
  const ceiling = Number.isFinite(scoreVectorCeiling) && scoreVectorCeiling > floor
    ? scoreVectorCeiling
    : floor + 0.01;
  return clamp01((raw - floor) / (ceiling - floor));
};

const scoreShapeCandidate = (candidatePayload = {}, queryShape = null) => {
  const candidateShape = normalizeShapeProfile(
    candidatePayload.shape_profile_json ||
    candidatePayload.shape_profile ||
    (candidatePayload.shape_bbox_aspect_ratio !== undefined ? {
      engine: candidatePayload.shape_engine || 'simple',
      mode: candidatePayload.shape_mode || 'simple',
      bbox: candidatePayload.shape_bbox_json || null,
      bboxAspectRatio: candidatePayload.shape_bbox_aspect_ratio,
      bboxAreaRatio: candidatePayload.shape_bbox_area_ratio,
      inkRatio: candidatePayload.shape_ink_ratio,
      centroidX: candidatePayload.shape_centroid_x,
      centroidY: candidatePayload.shape_centroid_y,
      edgeDensity: candidatePayload.shape_edge_density,
      verticalProfile: candidatePayload.shape_vertical_profile_json || [],
      horizontalProfile: candidatePayload.shape_horizontal_profile_json || []
    } : null)
  );

  if (!candidateShape || !queryShape) {
    return {
      score: 0,
      breakdown: {
        aspect: 0,
        area: 0,
        ink: 0,
        centroid: 0,
        edge: 0,
        projection: 0,
        hu: 0,
        total: 0
      },
      reasons: []
    };
  }

  const aspectSim = ratioSimilarity(queryShape.bboxAspectRatio, candidateShape.bboxAspectRatio);
  const areaSim = boundedDifferenceSimilarity(queryShape.bboxAreaRatio, candidateShape.bboxAreaRatio);
  const inkSim = boundedDifferenceSimilarity(queryShape.inkRatio, candidateShape.inkRatio);
  const centroidXSim = boundedDifferenceSimilarity(queryShape.centroidX, candidateShape.centroidX);
  const centroidYSim = boundedDifferenceSimilarity(queryShape.centroidY, candidateShape.centroidY);
  const edgeSim = boundedDifferenceSimilarity(queryShape.edgeDensity, candidateShape.edgeDensity);
  const verticalSim = profileSimilarity(queryShape.verticalProfile, candidateShape.verticalProfile);
  const horizontalSim = profileSimilarity(queryShape.horizontalProfile, candidateShape.horizontalProfile);
  const huSim = huMomentSimilarity(queryShape.huMoments, candidateShape.huMoments);

  const projectionSimValues = [verticalSim, horizontalSim].filter((value) => Number.isFinite(value));
  const projectionSim = projectionSimValues.length
    ? projectionSimValues.reduce((sum, value) => sum + value, 0) / projectionSimValues.length
    : null;

  const breakdown = {
    aspect: Number(((aspectSim || 0) * 0.03).toFixed(4)),
    area: Number(((areaSim || 0) * 0.03).toFixed(4)),
    ink: Number(((inkSim || 0) * 0.03).toFixed(4)),
    centroid: Number((((centroidXSim || 0) + (centroidYSim || 0)) / 2 * 0.03).toFixed(4)),
    edge: Number(((edgeSim || 0) * 0.02).toFixed(4)),
    projection: Number(((projectionSim || 0) * 0.09).toFixed(4)),
    hu: Number(((huSim || 0) * 0.06).toFixed(4)),
    total: 0
  };

  breakdown.total = Number((breakdown.aspect + breakdown.area + breakdown.ink + breakdown.centroid + breakdown.edge + breakdown.projection + breakdown.hu).toFixed(4));

  const reasons = [];
  if ((projectionSim || 0) >= 0.7) {
    reasons.push('profile similar');
  }
  if ((aspectSim || 0) >= 0.8 && (areaSim || 0) >= 0.7) {
    reasons.push('outline similar');
  }
  if ((edgeSim || 0) >= 0.7) {
    reasons.push('edge similar');
  }

  return {
    score: breakdown.total,
    breakdown,
    reasons
  };
};

const normalizeSearchText = (value) => String(value || '')
  .replace(/\u0000/g, '')
  .trim()
  .toLowerCase();

const parseThicknessValue = (value) => {
  const text = normalizeSearchText(value).replace(/,/g, '.');
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match) {
    return null;
  }
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : null;
};

const buildQueryProfile = (body = {}, indexedPayload = null) => ({
  drawingNo: String(indexedPayload?.drawing_no || indexedPayload?.ocr_drawing_no || body.drawingNo || '').trim(),
  productName: String(indexedPayload?.product_name || indexedPayload?.ocr_product_name || body.productName || '').trim(),
  material: String(indexedPayload?.ocr_material || body.material || '').trim(),
  dimension: String(indexedPayload?.ocr_dimension || indexedPayload?.ocr_thickness || body.dimension || '').trim(),
  customer: String(indexedPayload?.ocr_customer || body.customer || '').trim(),
  revision: String(indexedPayload?.ocr_revision || body.revision || '').trim(),
  shapeCategory: String(indexedPayload?.ocr_shape_category || body.shapeCategory || '').trim(),
  ocrText: String(indexedPayload?.ocr_text || body.ocrText || '').trim(),
  tags: parseTags(indexedPayload?.tags || body.tags || ''),
  shapeTags: parseTags(indexedPayload?.ocr_shape_tags || body.shapeTags || '')
});

const scoreCandidate = (candidatePayload = {}, query = {}) => {
  const reasons = [];
  const breakdown = {
    vector: 0,
    drawingNo: 0,
    productName: 0,
    material: 0,
    dimension: 0,
    customer: 0,
    revision: 0,
    shapeCategory: 0,
    shape: 0,
    bonus: 0,
    total: 0
  };

  const scoreFromVector = Number(candidatePayload.__vectorScore || 0);
  const calibratedVectorScore = calibrateVectorScore(scoreFromVector);
  breakdown.vectorRaw = Number.isFinite(scoreFromVector) ? Number(scoreFromVector.toFixed(4)) : 0;
  breakdown.vector = Number(calibratedVectorScore.toFixed(4));

  const candidateDrawingNo = normalizeSearchText(candidatePayload.drawing_no || candidatePayload.ocr_drawing_no);
  const candidateProductName = normalizeSearchText(candidatePayload.product_name || candidatePayload.ocr_product_name);
  const candidateMaterial = normalizeSearchText(candidatePayload.ocr_material);
  const candidateDimension = normalizeSearchText(candidatePayload.ocr_dimension || candidatePayload.ocr_thickness);
  const candidateCustomer = normalizeSearchText(candidatePayload.ocr_customer);
  const candidateRevision = normalizeSearchText(candidatePayload.ocr_revision);
  const candidateShapeCategory = normalizeSearchText(candidatePayload.ocr_shape_category);

  const queryDrawingNo = normalizeSearchText(query.drawingNo);
  const queryProductName = normalizeSearchText(query.productName);
  const queryMaterial = normalizeSearchText(query.material);
  const queryDimension = normalizeSearchText(query.dimension);
  const queryCustomer = normalizeSearchText(query.customer);
  const queryRevision = normalizeSearchText(query.revision);
  const queryShapeCategory = normalizeSearchText(query.shapeCategory);
  const shapeScore = scoreShapeCandidate(candidatePayload, query.shape || null);

  if (queryDrawingNo && candidateDrawingNo && queryDrawingNo === candidateDrawingNo) {
    breakdown.drawingNo = 0.15;
    reasons.push('drawingNo match');
  }
  if (queryProductName && candidateProductName && queryProductName === candidateProductName) {
    breakdown.productName = 0.1;
    reasons.push('productName match');
  }
  if (queryMaterial && candidateMaterial && queryMaterial === candidateMaterial) {
    breakdown.material = 0.08;
    reasons.push('material match');
  }
  if (queryCustomer && candidateCustomer && queryCustomer === candidateCustomer) {
    breakdown.customer = 0.06;
    reasons.push('customer match');
  }
  if (queryRevision && candidateRevision && queryRevision === candidateRevision) {
    breakdown.revision = 0.03;
    reasons.push('revision match');
  }
  if (queryShapeCategory && candidateShapeCategory && queryShapeCategory === candidateShapeCategory) {
    breakdown.shapeCategory = 0.08;
    reasons.push('shape category match');
  }
  if (shapeScore.score > 0) {
    breakdown.shape = Number(shapeScore.score.toFixed(4));
    reasons.push(...shapeScore.reasons);
  }

  const queryDimensionValue = parseThicknessValue(queryDimension);
  const candidateDimensionValue = parseThicknessValue(candidateDimension);
  if (queryDimensionValue !== null && candidateDimensionValue !== null) {
    const diff = Math.abs(queryDimensionValue - candidateDimensionValue);
    if (diff === 0) {
      breakdown.dimension = 0.08;
      reasons.push('dimension match');
    } else if (diff <= 0.2) {
      breakdown.dimension = 0.05;
      reasons.push('dimension close');
    } else if (diff <= 0.5) {
      breakdown.dimension = 0.02;
      reasons.push('dimension roughly close');
    }
  }

  const metadataBonus = breakdown.drawingNo + breakdown.productName + breakdown.material + breakdown.dimension + breakdown.customer + breakdown.revision + breakdown.shapeCategory;
  const metadataScore = clamp01(metadataBonus / 0.58);
  const normalizedShapeScore = clamp01(breakdown.shape / 0.29);
  const totalWeight = Math.max(0.01, scoreVectorWeight + scoreMetadataWeight + scoreShapeWeight);
  const weightedTotal = (
    calibratedVectorScore * scoreVectorWeight +
    metadataScore * scoreMetadataWeight +
    normalizedShapeScore * scoreShapeWeight
  ) / totalWeight;

  const queryTags = Array.isArray(query.tags) ? query.tags : [];
  const candidateTags = parseTags(candidatePayload.tags || '');
  let tagBonus = 0;
  if (queryTags.length > 0 && candidateTags.length > 0) {
    const sharedTags = queryTags.filter((t) => candidateTags.includes(t));
    if (sharedTags.length > 0) {
      tagBonus = scoreTypeBonus * sharedTags.length / Math.min(queryTags.length, candidateTags.length);
      reasons.push('tag:' + sharedTags.join(','));
    }
  }

  // AI（Vertex/Gemini）が登録時に推定した形状タグの一致度。ユーザーが手入力するtagsとは別軸の補助シグナル。
  const queryShapeTags = Array.isArray(query.shapeTags) ? query.shapeTags : [];
  const candidateShapeTags = parseTags(candidatePayload.ocr_shape_tags || '');
  let shapeTagBonus = 0;
  if (queryShapeTags.length > 0 && candidateShapeTags.length > 0) {
    const sharedShapeTags = queryShapeTags.filter((t) => candidateShapeTags.includes(t));
    if (sharedShapeTags.length > 0) {
      shapeTagBonus = scoreAiShapeTagBonus * sharedShapeTags.length / Math.min(queryShapeTags.length, candidateShapeTags.length);
      reasons.push('shapeTag:' + sharedShapeTags.join(','));
    }
  }

  breakdown.metadata = Number(metadataScore.toFixed(4));
  breakdown.bonus = Number((metadataBonus + breakdown.shape).toFixed(3));
  breakdown.tag = Number(tagBonus.toFixed(4));
  breakdown.shapeTag = Number(shapeTagBonus.toFixed(4));
  breakdown.total = Number(clamp01(weightedTotal + tagBonus + shapeTagBonus).toFixed(4));

  if (!reasons.length && candidatePayload.ocr_text) {
    reasons.push('ocr text available');
  }

  return {
    score: breakdown.total,
    scoreBreakdown: breakdown,
    reasons,
    shapeScoreBreakdown: shapeScore.breakdown
  };
};

const assertEmbeddingVector = (embedding) => {
  if (!Array.isArray(embedding.vector) || !embedding.vector.length) {
    throw new Error('Embedding provider returned an empty vector');
  }
  if (!Number.isFinite(expectedVectorSize) || expectedVectorSize <= 0) {
    throw new Error('VECTOR_SIZE must be a positive number');
  }
  if (embedding.vector.length !== expectedVectorSize) {
    const error = new Error(
      'Embedding vector size mismatch: provider=' + embedding.provider +
      ' actual=' + embedding.vector.length +
      ' expected=' + expectedVectorSize +
      '. Set VECTOR_SIZE=' + embedding.vector.length +
      ' and use a matching QDRANT_COLLECTION.'
    );
    error.status = 409;
    throw error;
  }
  return embedding;
};

const buildEmbedding = async (buffer, context = {}) => {
  if (embeddingImageMode !== 'full' && embeddingImageMode !== 'center_crop' && embeddingImageMode !== 'auto_roi') {
    const error = new Error('Unsupported EMBED_IMAGE_MODE: ' + embeddingImageMode);
    error.status = 500;
    throw error;
  }

  if (embeddingProvider === 'openclip' || embeddingProvider === 'dinov2') {
    if (embeddingProvider === 'dinov2' && !embeddingEndpoint) {
      const error = new Error('EMBEDDING_PROVIDER=dinov2 requires EMBEDDING_ENDPOINT');
      error.status = 500;
      throw error;
    }
    return assertEmbeddingVector(await buildOpenClipVector(buffer, context));
  }

  if (embeddingProvider !== 'dummy' && embeddingProvider !== 'sha256-dummy') {
    const error = new Error('Unsupported EMBEDDING_PROVIDER: ' + embeddingProvider);
    error.status = 500;
    throw error;
  }

  return assertEmbeddingVector({
    provider: 'sha256-dummy',
    model: '',
    pretrained: '',
    imageMode: embeddingImageMode,
    image: null,
    vector: buildVector(buffer)
  });
};

const qdrantHeaders = () => {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (qdrantApiKey) {
    headers['api-key'] = qdrantApiKey;
  }
  return headers;
};

const qdrantRequest = async (path, options = {}) => {
  const response = await fetch(qdrantUrl + path, {
    ...options,
    headers: {
      ...qdrantHeaders(),
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error('Qdrant request failed: ' + response.status + ' ' + body.slice(0, 300));
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return {};
  }

  return response.json();
};

const getCollectionVectorSize = (data) => {
  const vectors = data?.result?.config?.params?.vectors;
  if (!vectors) {
    return null;
  }
  if (typeof vectors.size === 'number') {
    return vectors.size;
  }
  if (vectors.default && typeof vectors.default.size === 'number') {
    return vectors.default.size;
  }
  return null;
};

const ensureCollection = async (size) => {
  if (!isQdrantConfigured()) {
    return false;
  }

  const collectionPath = '/collections/' + encodeURIComponent(qdrantCollection);
  const current = await fetch(qdrantUrl + collectionPath, {
    headers: qdrantHeaders()
  });

  if (current.ok) {
    const data = await current.json();
    const currentSize = getCollectionVectorSize(data);
    if (currentSize && currentSize !== size) {
      const error = new Error(
        'Qdrant collection vector size mismatch: collection=' + qdrantCollection +
        ' current=' + currentSize +
        ' requested=' + size +
        '. Use a new QDRANT_COLLECTION or recreate the collection.'
      );
      error.status = 409;
      throw error;
    }
    await ensurePayloadIndexes();
    return true;
  }

  if (current.status !== 404) {
    const body = await current.text();
    const error = new Error('Qdrant collection check failed: ' + current.status + ' ' + body.slice(0, 300));
    error.status = current.status;
    throw error;
  }

  await qdrantRequest('/collections/' + encodeURIComponent(qdrantCollection), {
    method: 'PUT',
    body: JSON.stringify({
      vectors: {
        size,
        distance: 'Cosine'
      }
    })
  });
  // コレクションを作り直したときは、既存の「作成済み」フラグを無効化して
  // 新しいコレクションに payload インデックスを確実に張り直す。
  payloadIndexesReady = false;
  await ensurePayloadIndexes();
  return true;
};

// フィルタ検索・フィルタ削除に使う payload フィールドは Qdrant 側でインデックスが必要。
// tenant_id（テナント絞り込み）と record_id（レコード単位の削除/再登録）の両方を張る。
const INDEXED_PAYLOAD_FIELDS = ['tenant_id', 'record_id', 'doc_type'];

const ensurePayloadIndexes = async () => {
  if (!isQdrantConfigured()) {
    return false;
  }
  if (payloadIndexesReady) {
    return true;
  }

  for (const field of INDEXED_PAYLOAD_FIELDS) {
    try {
      await qdrantRequest('/collections/' + encodeURIComponent(qdrantCollection) + '/index', {
        method: 'PUT',
        body: JSON.stringify({
          field_name: field,
          field_schema: 'keyword'
        })
      });
    } catch (error) {
      if (error.status !== 409) {
        throw error;
      }
    }
  }

  payloadIndexesReady = true;
  return true;
};

// テナント＋レコードIDのポイントを「フィルタで」削除する。ポイントIDを計算して
// 消す方式だと、Phase 2 以前に別スキームのIDで保存された古いポイントに命中せず
// 残ってしまう。payload の tenant_id + record_id で消せば新旧どちらのスキームでも
// 確実に除去できる（孤児削除・PDF差し替え時の旧ベクトル掃除に使用）。
const deleteRecordPoints = async (tenantId, recordId) => {
  if (!isQdrantConfigured()) {
    return false;
  }
  const runDelete = () => qdrantRequest(
    '/collections/' + encodeURIComponent(qdrantCollection) + '/points/delete?wait=true',
    {
      method: 'POST',
      body: JSON.stringify({
        filter: {
          must: [
            { key: 'tenant_id', match: { value: String(tenantId || 'default') } },
            { key: 'record_id', match: { value: String(recordId) } }
          ]
        }
      })
    }
  );
  try {
    await runDelete();
  } catch (error) {
    // record_id の payload インデックスが無いと 400 になる。既存コレクションが
    // 旧コードで作られていた場合に起きるので、その場でインデックスを張って1回だけ再試行する。
    if (error.status === 400 && /Index required/i.test(error.message || '')) {
      payloadIndexesReady = false;
      await ensurePayloadIndexes();
      await runDelete();
    } else {
      throw error;
    }
  }
  return true;
};

// Point ID はテナントで名前空間を分ける。これをしないと、異なるテナントで
// 同じ recordId（例: どちらも 1）が同一 point に衝突し、後勝ちで上書きされて
// テナント分離が崩れる。tenantId + recordId(+ rotation) をハッシュして一意化する。
const toPointId = (tenantId, recordId) =>
  createHash('sha256').update(String(tenantId || 'default') + ':' + String(recordId)).digest('hex').slice(0, 32);

const toPointIdWithRotation = (tenantId, recordId, rotation) => {
  const normalizedRotation = ((Number(rotation) || 0) % 360 + 360) % 360;
  if (normalizedRotation === 0) {
    return toPointId(tenantId, recordId);
  }
  return createHash('sha256')
    .update(String(tenantId || 'default') + ':' + String(recordId) + ':rot:' + normalizedRotation)
    .digest('hex')
    .slice(0, 32);
};
const getPointVector = (point) => {
  if (Array.isArray(point?.vector)) {
    return point.vector;
  }
  if (!point?.vector || typeof point.vector !== 'object') {
    return null;
  }
  return Object.values(point.vector).find((value) => Array.isArray(value)) || null;
};

const upsertDrawing = async (body, embedding, context = {}) => {
  if (!isQdrantConfigured()) {
    if (context.log) {
      context.log('qdrant upsert skipped', { configured: false });
    }
    return { configured: false, upserted: false };
  }

  const embeddings = Array.isArray(embedding) ? embedding : [embedding];
  const firstVector = embeddings[0]?.vector || [];
  if (context.log) {
    context.log('qdrant ensure collection start', { collection: qdrantCollection, vectorSize: firstVector.length });
  }
  try {
    await ensureCollection(firstVector.length);
  } catch (error) {
    throw attachStep(error, 'qdrant_ensure_collection');
  }
  if (context.log) {
    context.log('qdrant ensure collection done', { collection: qdrantCollection });
    context.log('qdrant upsert start', { collection: qdrantCollection, recordId: body.recordId, points: embeddings.length });
  }

  const basePayload = {
    tenant_id: body.tenantId || 'default',
    record_id: String(body.recordId),
    app_id: body.appId ? String(body.appId) : '',
    // 過去図面アーカイブ取込（kintone未登録）用。既存データは doc_type が
    // 欠損しているため、読み取り側は必ず === 'archive' の肯定比較で判定すること。
    doc_type: body.docType || 'drawing',
    archive_rel_path: body.relPath || '',
    // Google Drive経由で取り込んだアーカイブのみ設定。将来のDrive再アクセス（例:サムネイル）用の参照情報で、
    // フィルタ対象ではないため INDEXED_PAYLOAD_FIELDS には追加しない。
    drive_file_id: body.driveFileId || '',
    drawing_no: context.extracted?.drawingNo || body.drawingNo || '',
    product_name: context.extracted?.productName || body.productName || '',
    tags: Array.isArray(body.tags) ? body.tags.filter(Boolean).join(',') : String(body.tags || ''),
    part_name: context.extracted?.productName || body.productName || '',
    file_name: body.fileName || '',
    file_key: body.fileKey || '',
    indexed_at: new Date().toISOString(),
    ocr_engine: context.ocr?.engine || 'none',
    ocr_langs: context.ocr?.langs || '',
    ocr_text: context.ocr?.text || '',
    ocr_drawing_no: context.extracted?.drawingNo || '',
    ocr_product_name: context.extracted?.productName || '',
    ocr_material: context.extracted?.material || '',
    ocr_dimension: context.extracted?.dimension || '',
    ocr_customer: context.extracted?.customer || '',
    ocr_revision: context.extracted?.revision || '',
    ocr_shape_category: context.extracted?.shapeCategory || '',
    ocr_extraction_confidence: context.extracted?.extractionConfidence ?? null,
    ocr_shape_comment: context.shapeComment || '',
    ocr_shape_tags: Array.isArray(context.shapeTags) ? context.shapeTags.filter(Boolean).join(',') : '',
    shape_engine: context.shape?.engine || 'none',
    shape_mode: context.shape?.mode || 'none',
    shape_image_mode: shapeImageMode,
    shape_roi_json: context.shape?.cropBox ? safeJsonStringify(context.shape.cropBox) : '',
    shape_width: context.shape?.width ?? null,
    shape_height: context.shape?.height ?? null,
    shape_source_width: context.shape?.sourceWidth ?? null,
    shape_source_height: context.shape?.sourceHeight ?? null,
    shape_profile_json: context.shape ? safeJsonStringify(context.shape) : '',
    shape_bbox_json: context.shape?.bbox ? safeJsonStringify(context.shape.bbox) : '',
    shape_bbox_aspect_ratio: context.shape?.bboxAspectRatio ?? null,
    shape_bbox_area_ratio: context.shape?.bboxAreaRatio ?? null,
    shape_ink_ratio: context.shape?.inkRatio ?? null,
    shape_centroid_x: context.shape?.centroidX ?? null,
    shape_centroid_y: context.shape?.centroidY ?? null,
    shape_edge_density: context.shape?.edgeDensity ?? null,
    shape_vertical_profile_json: context.shape?.verticalProfile ? safeJsonStringify(context.shape.verticalProfile) : '',
    shape_horizontal_profile_json: context.shape?.horizontalProfile ? safeJsonStringify(context.shape.horizontalProfile) : ''
  };

  try {
    // 再登録（PDF差し替え等）で古いポイントが残らないよう、upsert 前に
    // このレコードの既存ポイントをフィルタ削除する（旧スキームのIDも掃除される）。
    await deleteRecordPoints(body.tenantId, body.recordId).catch((error) => {
      throw attachStep(error, 'qdrant_delete_old');
    });
    await qdrantRequest('/collections/' + encodeURIComponent(qdrantCollection) + '/points?wait=true', {
      method: 'PUT',
      body: JSON.stringify({
        points: embeddings.map((entry) => ({
          id: toPointIdWithRotation(body.tenantId, body.recordId, entry.rotation || 0),
          vector: entry.vector,
          payload: {
            ...basePayload,
            embedding_provider: entry.provider,
            embedding_model: entry.model || '',
            embedding_pretrained: entry.pretrained || '',
            embedding_image_mode: entry.imageMode || embeddingImageMode,
            embedding_rotation: Number(entry.rotation || 0),
            embedding_image_json: entry.image ? safeJsonStringify(entry.image) : '',
            embedding_rotations: embeddingRotations.join(','),
            embedding_vector_size: entry.vector.length
          }
        }))
      })
    });
  } catch (error) {
    throw attachStep(error, 'qdrant_upsert');
  }
  if (context.log) {
    context.log('qdrant upsert done', { collection: qdrantCollection, recordId: body.recordId, points: embeddings.length });
  }

  return {
    configured: true,
    upserted: true,
    collection: qdrantCollection,
    vectorSize: firstVector.length,
    points: embeddings.length,
    rotations: embeddings.map((entry) => Number(entry.rotation || 0))
  };
};

const getIndexedDrawingVector = async (body) => {
  if (!isQdrantConfigured() || !body.recordId) {
    return null;
  }

  try {
    const ids = embeddingRotations.map((rotation) => toPointIdWithRotation(body.tenantId, body.recordId, rotation));
    const data = await qdrantRequest('/collections/' + encodeURIComponent(qdrantCollection) + '/points', {
      method: 'POST',
      body: JSON.stringify({
        ids,
        with_payload: true,
        with_vector: true
      })
    });
    const points = Array.isArray(data.result) ? data.result : [];
    if (!points.length) {
      return null;
    }

    const vectors = [];
    let selectedPayload = null;
    let selectedPointId = null;
    for (const point of points) {
      const payload = point.payload || {};
      if (String(payload.tenant_id || 'default') !== String(body.tenantId || 'default')) {
        continue;
      }
      if (body.appId && payload.app_id && String(payload.app_id) !== String(body.appId)) {
        continue;
      }
      const pointVector = getPointVector(point);
      if (!Array.isArray(pointVector) || !pointVector.length) {
        continue;
      }
      vectors.push(pointVector);
      selectedPayload = selectedPayload || payload;
      selectedPointId = selectedPointId || point.id;
    }

    if (!vectors.length) {
      return null;
    }

    return {
      pointId: selectedPointId,
      payload: selectedPayload || {},
      vector: vectors.length === 1 ? vectors[0] : vectors,
      vectors
    };
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
};

const searchDrawings = async (body, vector, queryProfile = {}) => {
  if (!isQdrantConfigured()) {
    return null;
  }

  const queryVectors = Array.isArray(vector) && Array.isArray(vector[0]) ? vector : [vector];
  await ensureCollection(queryVectors[0].length);
  const limit = Math.min((Number(body.limit || 10) + 1) * Math.max(1, queryVectors.length) * 4, 100);
  const byRecord = new Map();

  for (let queryIndex = 0; queryIndex < queryVectors.length; queryIndex += 1) {
    const queryVector = queryVectors[queryIndex];
    const queryRotation = embeddingRotations[queryIndex] ?? queryIndex;
    const data = await qdrantRequest('/collections/' + encodeURIComponent(qdrantCollection) + '/points/search', {
      method: 'POST',
      body: JSON.stringify({
        vector: queryVector,
        limit,
        with_payload: true,
        filter: {
          must: [
            {
              key: 'tenant_id',
              match: {
                value: body.tenantId || 'default'
              }
            }
          ]
        }
      })
    });

    for (const item of data.result || []) {
      const payload = item.payload || {};
      if (String(payload.record_id || '') === String(body.recordId || '')) {
        continue;
      }
      const key = String(payload.record_id || item.id);
      const score = Number(item.score || 0);
      const rotationScore = {
        queryRotation,
        candidateRotation: Number(payload.embedding_rotation ?? 0),
        vectorRaw: Number(score.toFixed(4)),
        pointId: item.id
      };
      const existing = byRecord.get(key);
      if (existing) {
        existing.rotationScores.push(rotationScore);
        if (score > Number(existing.item.score || 0)) {
          existing.item = item;
          existing.queryRotation = queryRotation;
          existing.candidateRotation = rotationScore.candidateRotation;
        }
      } else {
        byRecord.set(key, {
          item,
          queryRotation,
          candidateRotation: rotationScore.candidateRotation,
          rotationScores: [rotationScore]
        });
      }
    }
  }

  return Array.from(byRecord.values())
    .map((entry) => {
      const item = entry.item;
      const payload = item.payload || {};
      const scored = scoreCandidate({
        ...payload,
        __vectorScore: Number(item.score || 0)
      }, queryProfile);
      const isArchive = payload.doc_type === 'archive';
      return {
        recordId: payload.record_id || item.id,
        docType: isArchive ? 'archive' : 'drawing',
        // アーカイブ点には kintone ファイルが無いのでサムネイル取得・リンクの材料を出さない。
        fileKey: isArchive ? '' : (payload.file_key || ''),
        thumbToken: isArchive || !payload.file_key ? '' : mintThumbToken(payload.file_key),
        archiveRelPath: isArchive ? (payload.archive_rel_path || '') : '',
        archiveFileName: isArchive ? (payload.file_name || '') : '',
        // アーカイブ点は kintone record ではないので、図番未抽出時のフォールバックに内部IDを出さない
        // （呼び出し側は drawingNo || archiveFileName でファイル名にフォールバックする）。
        drawingNo: payload.drawing_no || (isArchive ? '' : 'record ' + item.id),
        productName: payload.product_name || '',
        customer: payload.file_name || '',
        material: payload.ocr_material || '',
        dimension: payload.ocr_dimension || payload.ocr_thickness || '',
        revision: payload.ocr_revision || '',
        shapeCategory: payload.ocr_shape_category || '',
        shapeComment: payload.ocr_shape_comment || '',
        shapeTags: parseTags(payload.ocr_shape_tags || ''),
        ocrText: payload.ocr_text || '',
        shape: normalizeShapeProfile(payload.shape_profile_json || payload.shape_profile || null),
        vectorRaw: scored.scoreBreakdown.vectorRaw,
        vectorScore: scored.scoreBreakdown.vector,
        embeddingRotation: entry.candidateRotation ?? payload.embedding_rotation ?? null,
        embeddingImage: (() => { try { return payload.embedding_image_json ? JSON.parse(payload.embedding_image_json) : null; } catch { return null; } })(),
        queryEmbeddingRotation: entry.queryRotation ?? null,
        rotationScores: entry.rotationScores
          .sort((a, b) => b.vectorRaw - a.vectorRaw)
          .slice(0, 20),
        score: scored.score,
        scoreBreakdown: scored.scoreBreakdown,
        shapeScoreBreakdown: scored.shapeScoreBreakdown,
        reasons: scored.reasons
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(Number(body.limit || 10), 10));
};

const buildMatchConfidence = (results = []) => {
  const topScore = Number(results[0]?.scoreBreakdown?.vectorRaw || 0);
  const secondScore = Number(results[1]?.scoreBreakdown?.vectorRaw || 0);
  const margin = Number(Math.max(0, topScore - secondScore).toFixed(4));
  let level = 'low';
  if (topScore >= 0.9 && margin >= 0.03) {
    level = 'high';
  } else if (topScore >= 0.87 && margin >= 0.015) {
    level = 'medium';
  }
  return {
    level,
    topScore: Number(topScore.toFixed(4)),
    secondScore: Number(secondScore.toFixed(4)),
    margin
  };
};
const assertKintoneConfig = () => {
  const missing = [];
  if (!kintoneBaseUrl) {
    missing.push('KINTONE_BASE_URL');
  }
  if (!kintoneApiToken) {
    missing.push('KINTONE_API_TOKEN');
  }
  if (missing.length) {
    const error = new Error('Missing environment variables: ' + missing.join(', '));
    error.status = 501;
    throw error;
  }
};

const fetchKintoneFile = async (fileKey) => {
  assertKintoneConfig();

  const url = new URL('/k/v1/file.json', kintoneBaseUrl);
  url.searchParams.set('fileKey', fileKey);

  const response = await fetch(url, {
    headers: {
      'X-Cybozu-API-Token': kintoneApiToken
    }
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error('kintone file download failed: ' + response.status + ' ' + body.slice(0, 200));
    error.status = response.status;
    throw error;
  }

  return Buffer.from(await response.arrayBuffer());
};

const runCommand = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    stdio: ['ignore', 'ignore', 'pipe']
  });
  const stderr = [];

  child.stderr.on('data', (chunk) => {
    stderr.push(chunk);
  });

  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) {
      resolve();
      return;
    }

    reject(new Error(command + ' exited with ' + code + ': ' + Buffer.concat(stderr).toString('utf8')));
  });
});

const convertPdfFirstPageToPng = async (pdfBuffer, dpi = renderDpi) => {
  const workDir = await mkdtemp(join(tmpdir(), 'drawing-similarity-'));
  const pdfPath = join(workDir, 'source.pdf');
  const outputBase = join(workDir, 'page');
  const imagePath = outputBase + '.png';

  try {
    await writeFile(pdfPath, pdfBuffer);
    await runCommand('pdftoppm', ['-f', '1', '-singlefile', '-png', '-r', String(dpi), pdfPath, outputBase]);
    return {
      pngBuffer: await readFile(imagePath),
      imagePath
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

const thumbnailMaxWidth = Number(process.env.THUMBNAIL_MAX_WIDTH || 480);

// 縮小PNGをその場でレンダリングして返すだけで、どこにも保存しない（kintoneを正本のまま保つ）。
const convertPdfFirstPageToThumbnailPng = async (pdfBuffer, maxWidth = thumbnailMaxWidth) => {
  const workDir = await mkdtemp(join(tmpdir(), 'drawing-similarity-thumb-'));
  const pdfPath = join(workDir, 'source.pdf');
  const outputBase = join(workDir, 'thumb');
  const imagePath = outputBase + '.png';

  try {
    await writeFile(pdfPath, pdfBuffer);
    await runCommand('pdftoppm', ['-f', '1', '-singlefile', '-png', '-scale-to-x', String(maxWidth), '-scale-to-y', '-1', pdfPath, outputBase]);
    return readFile(imagePath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

const loadRecordImage = async (body) => {
  if (!body.recordId) {
    const error = new Error('recordId is required');
    error.status = 400;
    throw error;
  }
  if (!body.fileKey) {
    const error = new Error('fileKey is required');
    error.status = 400;
    throw error;
  }

  const pdfBuffer = await fetchKintoneFile(body.fileKey);
  const { pngBuffer } = await convertPdfFirstPageToPng(pdfBuffer);
  return { pdfBuffer, pngBuffer };
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    // runtime 詳細（モデル・タイムアウト・コレクション名など）は内部情報なので、
    // 認証有効時は有効な API キーを持つ相手にだけ返す。死活確認は誰でも可能。
    if (TENANT_AUTH_ENABLED) {
      const tenant = await resolveTenant(request.headers['x-api-key'] || '');
      if (!tenant) {
        sendJson(response, 200, { ok: true, service: 'drawing-similarity-api' });
        return;
      }
    }
    sendJson(response, 200, {
      ok: true,
      service: 'drawing-similarity-api',
      runtime: getRuntimeInfo()
    });
    return;
  }

  // Google Drive OAuthポップアップ。kintoneの各テナントサブドメインではなく
  // 当方サーバー自身のオリジンから開くページなので、APIキー認証の対象外
  // （テナントに紐づく情報は一切扱わない）。
  if (request.method === 'GET' && url.pathname === '/google/oauth/popup') {
    sendBinary(response, 200, 'text/html; charset=utf-8', Buffer.from(buildGoogleOAuthPopupHtml(), 'utf-8'));
    return;
  }

  // /thumbnail は <img> から呼ばれヘッダーを送れないため、ヘッダー認証の対象外。
  // 代わりにハンドラ内で HMAC トークンを検証する。
  if (TENANT_AUTH_ENABLED && url.pathname !== '/thumbnail') {
    const apiKey = request.headers['x-api-key'] || '';
    const tenant = await resolveTenant(apiKey);
    if (!tenant) {
      sendJson(response, 401, { error: 'Invalid or missing API key' });
      return;
    }
    request._tenant = tenant;
    // Phase 2: テナントの境界は API キーで決める。クライアント送信の tenantId は
    // 信用せず、Firestore のテナントドキュメントに紐付いた tenantId を正とする。
    // 後方互換: ドキュメントに tenantId 系フィールドが無い場合は上書きしない
    //（従来どおりクライアント値にフォールバック）。
    const boundTenantId = tenant.tenantId || tenant.tenant_id || tenant.id;
    if (boundTenantId) {
      request._forcedTenantId = String(boundTenantId);
    }
  }

  if (request.method === 'POST' && url.pathname === '/analyze') {
    try {
      const body = await readJson(request);
      const pdfBase64 = String(body.pdf_base64 || '');
      if (!pdfBase64) {
        sendJson(response, 400, { error: 'pdf_base64 is required' });
        return;
      }
      const pdfBuffer = Buffer.from(pdfBase64, 'base64');
      if (!pdfBuffer.length) {
        sendJson(response, 400, { error: 'Empty PDF content' });
        return;
      }

      const { pngBuffer } = await convertPdfFirstPageToPng(pdfBuffer);

      const useGemini = ocrEngine === 'gemini' || ocrEngine === 'vertex';
      let ocrBuffer;
      let debugBbox = null;
      let debugOcrPath = 'full';
      if (useGemini) {
        const { pngBuffer: geminiPng } = await convertPdfFirstPageToPng(pdfBuffer, geminiDpi);
        ocrBuffer = geminiPng;
        debugOcrPath = 'full-gemini';
        console.log('[ocr] gemini full image bytes=' + ocrBuffer.length + ' dpi=' + geminiDpi);
      } else {
        ocrBuffer = await cropPngForOcr(pngBuffer).catch(() => pngBuffer);
      }

      const [ocr, shape] = await Promise.all([
        buildOcrText(ocrBuffer, {}),
        buildShapeProfile(pngBuffer, {})
      ]);
      console.log('[ocr] pass2 raw=' + JSON.stringify(ocr.text) + ' extracted=' + JSON.stringify(ocr.geminiExtracted));

      const isGemini = ocr.engine === 'gemini' || ocr.engine === 'vertex';
      const extracted = isGemini
        ? ocr.geminiExtracted
        : extractOcrFields(ocr.text, {});
      const ocrLines = String(ocr.text || '')
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter((line) => line.length >= 2 && line.length <= 80);

      const highConfidence = isGemini || (extracted.extractionConfidence >= 0.4);
      sendJson(response, 200, {
        ok: true,
        drawingNo: highConfidence ? (extracted.drawingNo || '') : '',
        productName: highConfidence ? (extracted.productName || '') : '',
        material: highConfidence ? (extracted.material || '') : '',
        dimension: highConfidence ? (extracted.dimension || '') : '',
        ocrLines,
        ocr: {
          engine: ocr.engine,
          langs: ocr.langs || '',
          textLength: String(ocr.text || '').length
        },
        extracted,
        shape: {
          bboxAspectRatio: shape.bboxAspectRatio,
          inkRatio: shape.inkRatio,
          edgeDensity: shape.edgeDensity
        },
        debug: {
          ocrPath: debugOcrPath,
          titleBlockBbox: debugBbox,
          geminiRawText: ocr.text || ''
        }
      });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        error: error.message,
        step: error.step || 'analyze'
      });
    }
    return;
  }

  // 過去図面アーカイブの一括取込。kintone には一切書き込まない
  // （fileKey も recordId も kintone 由来ではない）。クライアントが選んだ
  // フォルダ内PDFを1件ずつ pdf_base64 で受け取り、doc_type='archive' として
  // Qdrant にだけ登録する。件数が多くなりうるため、有料OCR（Gemini/Vertex）
  // からは Tesseract へ強制ダウングレードする（コスト・レート制限対策）。
  // 運用が OCR_ENGINE=none/tesseract を選んでいる場合はその設定を尊重する
  // （tesseract バイナリが無い最小構成デプロイを壊さないため）。
  if (request.method === 'POST' && url.pathname === '/archive-index') {
    try {
      const body = await readJson(request);
      const docId = String(body.docId || '').trim();
      if (!docId) {
        sendJson(response, 400, { error: 'docId is required' });
        return;
      }
      const pdfBase64 = String(body.pdf_base64 || '');
      if (!pdfBase64) {
        sendJson(response, 400, { error: 'pdf_base64 is required' });
        return;
      }
      const pdfBuffer = Buffer.from(pdfBase64, 'base64');
      if (!pdfBuffer.length) {
        sendJson(response, 400, { error: 'Empty PDF content' });
        return;
      }

      const { pngBuffer } = await convertPdfFirstPageToPng(pdfBuffer);
      const ocrBuffer = await cropPngForOcr(pngBuffer).catch(() => pngBuffer);
      const archiveOcrEngine = (ocrEngine === 'gemini' || ocrEngine === 'vertex') ? 'tesseract' : ocrEngine;

      const [ocr, shape] = await Promise.all([
        buildOcrText(ocrBuffer, { engine: archiveOcrEngine }),
        buildShapeProfile(pngBuffer, {})
      ]);
      const extracted = extractOcrFields(ocr.text, body);

      const embeddings = [];
      for (const rotation of embeddingRotations) {
        const entry = await buildEmbedding(pngBuffer, { rotation });
        entry.rotation = rotation;
        embeddings.push(entry);
      }

      await upsertDrawing({
        tenantId: body.tenantId,
        appId: body.appId,
        recordId: docId,
        docType: 'archive',
        relPath: body.relPath || '',
        fileName: body.fileName || '',
        driveFileId: body.driveFileId || ''
      }, embeddings, { extracted, ocr, shape });

      sendJson(response, 200, {
        ok: true,
        docId,
        extracted: {
          drawingNo: extracted.drawingNo || '',
          productName: extracted.productName || '',
          material: extracted.material || '',
          dimension: extracted.dimension || ''
        }
      });
    } catch (error) {
      sendJson(response, error.status || 500, { error: error.message, step: error.step || 'archive-index' });
    }
    return;
  }

  if (request.method === 'GET' && url.pathname === '/tags') {
    if (!isQdrantConfigured()) {
      sendJson(response, 200, { tags: [] });
      return;
    }
    try {
      const tenantId = request._forcedTenantId || url.searchParams.get('tenantId') || 'default';
      const filter = {
        must: [{ key: 'tenant_id', match: { value: tenantId } }]
      };
      const tagSet = new Set();
      let nextOffset = null;
      let hasMore = true;
      while (hasMore) {
        const scrollBody = { limit: 250, with_payload: ['tags'], filter };
        if (nextOffset != null) {
          scrollBody.offset = nextOffset;
        }
        const data = await qdrantRequest(
          '/collections/' + encodeURIComponent(qdrantCollection) + '/points/scroll',
          { method: 'POST', body: JSON.stringify(scrollBody) }
        );
        for (const point of (data.result?.points || [])) {
          parseTags(point.payload?.tags).forEach((t) => tagSet.add(t));
        }
        nextOffset = data.result?.next_page_offset ?? null;
        hasMore = nextOffset != null;
      }
      sendJson(response, 200, { tags: [...tagSet].sort() });
    } catch (error) {
      sendJson(response, error.status || 500, { error: error.message });
    }
    return;
  }

  // テナント内のインデックス済み一覧（record_id と file_key）を返す。
  // プラグイン側で kintone レコードと突き合わせ、未登録・要更新（PDF差し替え）・
  // 孤児（レコード削除済み）を検知するための材料。
  if (request.method === 'GET' && url.pathname === '/index-status') {
    if (!isQdrantConfigured()) {
      sendJson(response, 200, { configured: false, items: [] });
      return;
    }
    try {
      const tenantId = request._forcedTenantId || url.searchParams.get('tenantId') || 'default';
      const appId = url.searchParams.get('appId') || '';
      const must = [{ key: 'tenant_id', match: { value: tenantId } }];
      const byRecord = new Map(); // record_id -> file_key（回転違いは同一レコードに集約）
      let nextOffset = null;
      let hasMore = true;
      while (hasMore) {
        const scrollBody = {
          limit: 250,
          with_payload: ['record_id', 'app_id', 'file_key', 'doc_type'],
          filter: { must }
        };
        if (nextOffset != null) {
          scrollBody.offset = nextOffset;
        }
        const data = await qdrantRequest(
          '/collections/' + encodeURIComponent(qdrantCollection) + '/points/scroll',
          { method: 'POST', body: JSON.stringify(scrollBody) }
        );
        for (const point of (data.result?.points || [])) {
          const payload = point.payload || {};
          // アーカイブ点は kintone レコードが存在しないのが正常なので、
          // 未登録/要更新/孤児の判定対象から外す（含めると永久に「孤児」誤検知になる）。
          if (payload.doc_type === 'archive') {
            continue;
          }
          if (appId && payload.app_id && String(payload.app_id) !== String(appId)) {
            continue;
          }
          if (payload.record_id) {
            byRecord.set(String(payload.record_id), String(payload.file_key || ''));
          }
        }
        nextOffset = data.result?.next_page_offset ?? null;
        hasMore = nextOffset != null;
      }
      sendJson(response, 200, {
        configured: true,
        tenantId,
        count: byRecord.size,
        items: [...byRecord.entries()].map(([recordId, fileKey]) => ({ recordId, fileKey }))
      });
    } catch (error) {
      sendJson(response, error.status || 500, { error: error.message });
    }
    return;
  }

  if (request.method === 'GET' && url.pathname === '/field-values') {
    if (!isQdrantConfigured()) {
      sendJson(response, 200, { drawingNos: [], productNames: [], materials: [], dimensions: [] });
      return;
    }
    try {
      const tenantId = request._forcedTenantId || url.searchParams.get('tenantId') || 'default';
      const filter = {
        must: [{ key: 'tenant_id', match: { value: tenantId } }]
      };
      const drawingNoSet = new Set();
      const productNameSet = new Set();
      const materialSet = new Set();
      const dimensionSet = new Set();
      let nextOffset = null;
      let hasMore = true;
      while (hasMore) {
        const scrollBody = {
          limit: 250,
          with_payload: ['drawing_no', 'product_name', 'ocr_material', 'ocr_dimension', 'doc_type'],
          filter
        };
        if (nextOffset != null) {
          scrollBody.offset = nextOffset;
        }
        const data = await qdrantRequest(
          '/collections/' + encodeURIComponent(qdrantCollection) + '/points/scroll',
          { method: 'POST', body: JSON.stringify(scrollBody) }
        );
        for (const point of (data.result?.points || [])) {
          const payload = point.payload || {};
          // アーカイブ由来の値が新規登録フォームの候補を埋め尽くさないよう除外する。
          if (payload.doc_type === 'archive') {
            continue;
          }
          if (payload.drawing_no) drawingNoSet.add(String(payload.drawing_no).trim());
          if (payload.product_name) productNameSet.add(String(payload.product_name).trim());
          if (payload.ocr_material) materialSet.add(String(payload.ocr_material).trim());
          if (payload.ocr_dimension) dimensionSet.add(String(payload.ocr_dimension).trim());
        }
        nextOffset = data.result?.next_page_offset ?? null;
        hasMore = nextOffset != null;
      }
      sendJson(response, 200, {
        drawingNos: [...drawingNoSet].filter(Boolean).sort(),
        productNames: [...productNameSet].filter(Boolean).sort(),
        materials: [...materialSet].filter(Boolean).sort(),
        dimensions: [...dimensionSet].filter(Boolean).sort()
      });
    } catch (error) {
      sendJson(response, error.status || 500, { error: error.message });
    }
    return;
  }

  if (request.method === 'GET' && url.pathname === '/thumbnail') {
    const fileKey = url.searchParams.get('fileKey') || '';
    if (!fileKey) {
      sendJson(response, 400, { error: 'fileKey is required' });
      return;
    }
    if (TENANT_AUTH_ENABLED && !verifyThumbToken(fileKey, url.searchParams.get('token') || '')) {
      sendJson(response, 401, { error: 'Invalid or missing thumbnail token' });
      return;
    }
    try {
      const pdfBuffer = await fetchKintoneFile(fileKey);
      const thumbBuffer = await convertPdfFirstPageToThumbnailPng(pdfBuffer);
      // kintone の fileKey は内容に対して不変なのでブラウザに長期キャッシュさせる。
      // 再検索・再表示のたびに PDF レンダリングが走るのを防ぐ。
      sendBinary(response, 200, 'image/png', thumbBuffer, {
        'Cache-Control': 'public, max-age=86400, immutable'
      });
    } catch (error) {
      sendJson(response, 502, { error: error.message });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/tag') {
    try {
      const body = await readJson(request);
      if (!body.recordId) {
        sendJson(response, 400, { error: 'recordId is required' });
        return;
      }
      if (!isQdrantConfigured()) {
        sendJson(response, 200, { ok: true, configured: false });
        return;
      }
      const tags = parseTags(body.tags);
      const tagsStr = tags.join(',');
      const qdrantPayload = { tags: tagsStr };
      if (typeof body.shapeTags === 'string') {
        qdrantPayload.ocr_shape_tags = parseTags(body.shapeTags);
      }
      const pointIds = embeddingRotations.map((rot) => toPointIdWithRotation(body.tenantId, body.recordId, rot));
      await qdrantRequest(
        '/collections/' + encodeURIComponent(qdrantCollection) + '/points/payload?wait=true',
        { method: 'POST', body: JSON.stringify({ payload: qdrantPayload, points: pointIds }) }
      );
      sendJson(response, 200, { ok: true, recordId: body.recordId, tags });
    } catch (error) {
      sendJson(response, error.status || 500, { error: error.message });
    }
    return;
  }

  // レコード削除時に対応する Qdrant ポイントを削除する（孤児ポイント対策）。
  // 削除しないと、消えたレコードへのリンクが検索結果に出続ける。
  if (request.method === 'POST' && url.pathname === '/delete') {
    try {
      const body = await readJson(request);
      if (!body.recordId) {
        sendJson(response, 400, { error: 'recordId is required' });
        return;
      }
      if (!isQdrantConfigured()) {
        sendJson(response, 200, { ok: true, configured: false });
        return;
      }
      await deleteRecordPoints(body.tenantId, body.recordId);
      sendJson(response, 200, { ok: true, recordId: body.recordId });
    } catch (error) {
      sendJson(response, error.status || 500, { error: error.message });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/similar') {
    try {
      const body = await readJson(request);
      if (isQdrantConfigured()) {
        const indexed = await getIndexedDrawingVector(body);
        let vector = indexed?.vector || null;
        let embedding = null;
        let queryVectorSource = 'indexed';
        const queryProfile = buildQueryProfile(body, indexed?.payload || null);
        queryProfile.shape = normalizeShapeProfile(
          indexed?.payload?.shape_profile_json ||
          indexed?.payload?.shape_profile ||
          null
        );

        if (!vector && body.pdf_base64) {
          const pdfBuffer = Buffer.from(String(body.pdf_base64 || ''), 'base64');
          if (!pdfBuffer.length) {
            sendJson(response, 400, { error: 'Empty PDF content' });
            return;
          }
          const { pngBuffer } = await convertPdfFirstPageToPng(pdfBuffer);
          const shape = await buildShapeProfile(pngBuffer);
          queryProfile.shape = shape;
          const queryEmbeddings = [];
          for (const rotation of embeddingRotations) {
            const queryEmbedding = await buildEmbedding(pngBuffer, { rotation });
            queryEmbedding.rotation = rotation;
            queryEmbeddings.push(queryEmbedding);
          }
          embedding = queryEmbeddings[0];
          vector = queryEmbeddings.map((entry) => entry.vector);
          queryVectorSource = 'uploaded-pdf';
        }

        if (!vector && body.fileKey) {
          const { pngBuffer } = await loadRecordImage(body);
          const shape = await buildShapeProfile(pngBuffer);
          queryProfile.shape = shape;
          const queryEmbeddings = [];
          for (const rotation of embeddingRotations) {
            const queryEmbedding = await buildEmbedding(pngBuffer, { rotation });
            queryEmbedding.rotation = rotation;
            queryEmbeddings.push(queryEmbedding);
          }
          embedding = queryEmbeddings[0];
          vector = queryEmbeddings.map((entry) => entry.vector);
          queryVectorSource = 'rendered-pdf';
        }

        if (vector) {
          const results = await searchDrawings(body, vector, queryProfile);
          const matchConfidence = buildMatchConfidence(results || []);
          sendJson(response, 200, {
            mode: indexed ? 'qdrant-indexed' : 'qdrant-' + embedding.provider,
            query: {
              tenantId: body.tenantId || 'default',
              appId: body.appId,
              recordId: body.recordId,
              drawingNo: queryProfile.drawingNo || body.drawingNo || '',
              productName: queryProfile.productName || body.productName || '',
              material: queryProfile.material || body.material || '',
              dimension: queryProfile.dimension || body.dimension || '',
              customer: queryProfile.customer || body.customer || '',
              revision: queryProfile.revision || body.revision || '',
              shapeCategory: queryProfile.shapeCategory || body.shapeCategory || '',
              shape: queryProfile.shape || null
            },
            qdrant: {
              collection: qdrantCollection,
              vectorSize: Array.isArray(vector[0]) ? vector[0].length : vector.length,
              queryRotations: embeddingRotations,
              queryVectorSource,
              queryPointId: indexed?.pointId || null
            },
            matchConfidence,
            extracted: indexed?.payload ? {
              drawingNo: indexed.payload.ocr_drawing_no || indexed.payload.drawing_no || '',
              productName: indexed.payload.ocr_product_name || indexed.payload.product_name || '',
              material: indexed.payload.ocr_material || '',
              dimension: indexed.payload.ocr_dimension || indexed.payload.ocr_thickness || '',
              customer: indexed.payload.ocr_customer || '',
              revision: indexed.payload.ocr_revision || '',
              shapeCategory: indexed.payload.ocr_shape_category || '',
              shapeComment: indexed.payload.ocr_shape_comment || '',
              shapeTags: parseTags(indexed.payload.ocr_shape_tags || ''),
              ocrTextLength: String(indexed.payload.ocr_text || '').length,
              shape: normalizeShapeProfile(indexed?.payload?.shape_profile_json || indexed?.payload?.shape_profile || null)
            } : null,
            results
          });
          return;
        }
      }

      sendJson(response, 200, {
        mode: 'mock',
        query: {
          tenantId: body.tenantId || 'default',
          appId: body.appId,
          recordId: body.recordId,
          drawingNo: body.drawingNo || ''
        },
        results: buildMockResults(body)
      });
    } catch (error) {
      sendJson(response, error.status || 500, { error: error.message });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/index') {
    let step = 'start';
    indexLog('start');
    try {
      step = 'payload';
      const body = await readJson(request);
      indexLog('payload received', {
        recordId: body.recordId,
        tenantId: body.tenantId || 'default'
      });

      if (!body.recordId) {
        throw createStepError('recordId is required', step, 400);
      }
      if (!body.fileKey) {
        throw createStepError('fileKey is required', step, 400);
      }

      step = 'fetch_kintone_file';
      indexLog('fetch kintone file start', { recordId: body.recordId });
      const pdfBuffer = await fetchKintoneFile(body.fileKey).catch((error) => {
        throw attachStep(error, step);
      });
      indexLog('fetch kintone file done', { bytes: pdfBuffer.length });

      step = 'pdf_render';
      indexLog('pdf render start', { bytes: pdfBuffer.length, dpi: renderDpi });
      const { pngBuffer, imagePath } = await convertPdfFirstPageToPng(pdfBuffer).catch((error) => {
        throw attachStep(error, step);
      });
      indexLog('pdf render done', {
        imagePath,
        bytes: pngBuffer.length
      });

      step = 'ocr';
      indexLog('ocr start', {
        engine: ocrEngine,
        langs: ocrLangs
      });
      const ocr = await buildOcrText(pngBuffer, {
        log: indexLog,
        errorLog: indexError
      }).catch((error) => {
        if (ocrEngine === 'none') {
          return {
            engine: 'none',
            langs: '',
            text: ''
          };
        }
        throw attachStep(error, step);
      });
      indexLog('ocr done', {
        engine: ocr.engine,
        textLength: ocr.text.length
      });

      step = 'shape';
      indexLog('shape start', {
        engine: shapeEngine
      });
      const shape = await buildShapeProfile(pngBuffer, {
        log: indexLog,
        errorLog: indexError
      }).catch((error) => {
        if (shapeEngine === 'none') {
          return {
            engine: 'none',
            mode: 'none',
            bbox: null,
            bboxAspectRatio: 0,
            bboxAreaRatio: 0,
            inkRatio: 0,
            centroidX: 0.5,
            centroidY: 0.5,
            edgeDensity: 0,
            verticalProfile: [],
            horizontalProfile: [],
            huMoments: []
          };
        }
        throw attachStep(error, step);
      });
      indexLog('shape done', {
        engine: shape.engine,
        bboxAspectRatio: shape.bboxAspectRatio,
        edgeDensity: shape.edgeDensity
      });

      step = 'extraction';
      indexLog('extraction start');
      const extracted = extractOcrFields(ocr.text, body);
      // Vertex/Gemini本体への形状コメント・形状タグ依頼は、表題欄テキスト抽出（extractOcrFields）とは独立に
      // geminiExtracted から直接取り出す。shapeCommentは表示専用、shapeTagsはscoreCandidateの補助ボーナスに使う。
      const shapeComment = String(ocr.geminiExtracted?.shapeComment || '').trim();
      const geminiShapeTags = Array.isArray(ocr.geminiExtracted?.shapeTags)
        ? ocr.geminiExtracted.shapeTags.map((tag) => String(tag).trim()).filter(Boolean)
        : [];
      // 登録モーダルでユーザーがAI形状タグを編集した場合はそちらを優先する。
      // 一括登録など shapeTags を送らない呼び出し元は、Geminiの抽出結果をそのまま使う。
      const shapeTags = typeof body.shapeTags === 'string'
        ? parseTags(body.shapeTags).slice(0, 6)
        : geminiShapeTags.slice(0, 6);
      indexLog('extraction done', {
        drawingNo: extracted.drawingNo,
        material: extracted.material,
        dimension: extracted.dimension,
        customer: extracted.customer,
        revision: extracted.revision,
        shapeCategory: extracted.shapeCategory,
        confidence: extracted.extractionConfidence,
        shapeComment,
        shapeTags
      });

      step = 'embedding';
      indexLog('embedding start', {
        provider: embeddingProvider,
        imageMode: embeddingImageMode
      });
      const embeddings = [];
      for (const rotation of embeddingRotations) {
        indexLog('embedding rotation start', { rotation });
        const entry = await buildEmbedding(pngBuffer, {
          log: indexLog,
          errorLog: indexError,
          rotation
        }).catch((error) => {
          throw attachStep(error, step);
        });
        entry.rotation = rotation;
        embeddings.push(entry);
      }
      const embedding = embeddings[0];
      indexLog('embedding done', {
        dimension: embedding.vector.length,
        provider: embedding.provider,
        imageMode: embedding.imageMode || embeddingImageMode,
        rotations: embeddings.map((entry) => entry.rotation).join(',')
      });

      step = 'qdrant_upsert';
      const qdrant = await upsertDrawing(body, embeddings, {
        log: indexLog,
        errorLog: indexError,
        ocr,
        extracted,
        shape,
        shapeComment,
        shapeTags
      });

      sendJson(response, 202, {
        ok: true,
        mode: qdrant.upserted ? 'qdrant-' + embedding.provider : 'pdf-ready',
        accepted: true,
        tenantId: body.tenantId || 'default',
        appId: body.appId || null,
        recordId: body.recordId,
        drawingNo: body.drawingNo || '',
        productName: body.productName || '',
        fileName: body.fileName || '',
        ocr: {
          engine: ocr.engine,
          langs: ocr.langs,
          textLength: ocr.text.length
        },
        extracted: {
          drawingNo: extracted.drawingNo,
          productName: extracted.productName,
          material: extracted.material,
          dimension: extracted.dimension,
          customer: extracted.customer,
          revision: extracted.revision,
          shapeCategory: extracted.shapeCategory,
          extractionConfidence: extracted.extractionConfidence,
          shapeComment,
          shapeTags
        },
        shape: {
          engine: shape.engine,
          mode: shape.mode,
          imageMode: shapeImageMode,
          cropBox: shape.cropBox || null,
          width: shape.width || null,
          height: shape.height || null,
          sourceWidth: shape.sourceWidth || null,
          sourceHeight: shape.sourceHeight || null,
          bboxAspectRatio: shape.bboxAspectRatio,
          bboxAreaRatio: shape.bboxAreaRatio,
          inkRatio: shape.inkRatio,
          centroidX: shape.centroidX,
          centroidY: shape.centroidY,
          edgeDensity: shape.edgeDensity
        },
        shapeProfiles: {
          vertical: shape.verticalProfile,
          horizontal: shape.horizontalProfile
        },
        pdf: {
          bytes: pdfBuffer.length
        },
        image: {
          format: 'png',
          page: 1,
          dpi: renderDpi,
          bytes: pngBuffer.length,
          widthHint: Math.round(8.27 * renderDpi)
        },
        vector: {
          provider: embedding.provider,
          model: embedding.model,
          pretrained: embedding.pretrained,
          device: embedding.device || '',
          imageMode: embedding.imageMode || embeddingImageMode,
          image: embedding.image || null,
          size: embedding.vector.length,
          rotations: embeddings.map((entry) => entry.rotation),
          images: embeddings.map((entry) => ({ rotation: entry.rotation, image: entry.image || null }))
        },
        qdrant,
        next: qdrant.upserted
          ? (
            embedding.provider === 'sha256-dummy'
              ? 'Set EMBEDDING_PROVIDER=openclip to use OpenCLIP embeddings.'
              : 'OpenCLIP embedding was stored. Register more drawings and run similarity search.'
          )
          : 'Set QDRANT_URL to enable vector upsert.'
      });
      indexLog('response sent', { status: 202 });
    } catch (error) {
      const failedStep = error.step || step;
      const status = error.status || 500;
      indexError('failed', {
        step: failedStep,
        status,
        error: error.message
      });
      const payload = {
        ok: false,
        error: error.message,
        step: failedStep
      };
      if (error.timeoutMs) {
        payload.timeoutMs = error.timeoutMs;
      }
      sendJson(response, status, payload);
      indexLog('response sent', { status, step: failedStep });
    }
    return;
  }

  sendJson(response, 404, { error: 'not found' });
});

server.listen(port, () => {
  console.log('drawing-similarity-api listening on port ' + port);
});
