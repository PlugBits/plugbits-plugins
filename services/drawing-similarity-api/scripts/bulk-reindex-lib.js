/**
 * サーバ主導の一括再インデックス（bulk-reindex.js）の純粋ロジック集。
 *
 * kintone REST / drawing-similarity API への通信・ファイルIOには一切依存しない
 * （eval/marubatsu/lib.js と同じ設計思想）。bulk-reindex.js がこれらの関数を
 * import して使い、テストは node:test でこのファイルだけを対象に行う。
 */

// --- field-map ---

// field-map の既知キー -> /index の X-Index-Meta 上のキー名。
// shapeTagField は「プラグイン設定と同じキー名にする」という要件のため field-map
// では受け付けるが、値は意図的に /index へは送らない（下記 buildIndexMeta 参照）。
// pdfFileField はテキストメタデータではなく添付フィールドなので null。
export const KNOWN_FIELD_MAP_KEYS = {
  drawingNoField: 'drawingNo',
  productNameField: 'productName',
  materialField: 'material',
  dimensionField: 'dimension',
  processField: 'processes',
  tagField: 'tags',
  shapeTagField: null,
  pdfFileField: null
};

export const REQUIRED_FIELD_MAP_KEYS = ['pdfFileField'];

// field-map JSON を検証する。ok:false のときは errors に理由が入る。
// warnings は処理を止めないが利用者に伝えるべき事項（未知キー等）。
export const validateFieldMap = (fieldMap) => {
  const errors = [];
  const warnings = [];

  if (!fieldMap || typeof fieldMap !== 'object' || Array.isArray(fieldMap)) {
    return { ok: false, errors: ['field-map は JSON オブジェクトである必要があります'], warnings };
  }

  for (const key of REQUIRED_FIELD_MAP_KEYS) {
    const value = fieldMap[key];
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(key + ' は必須です（kintone のフィールドコードを指定してください）');
    }
  }

  const knownKeys = Object.keys(KNOWN_FIELD_MAP_KEYS);
  for (const [key, value] of Object.entries(fieldMap)) {
    if (!knownKeys.includes(key)) {
      warnings.push('未知の field-map キーです（無視されます）: ' + key);
      continue;
    }
    if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
      errors.push(key + ' はフィールドコード文字列を指定してください（空文字は不可）');
    }
  }

  return { ok: errors.length === 0, errors, warnings };
};

// field-map から、kintone レコード取得（cursor API）に必要なフィールドコード配列を作る。
// $id は常に含める（recordId の取得に必須）。
export const fieldMapToKintoneFields = (fieldMap) => {
  const codes = new Set(['$id']);
  for (const key of Object.keys(KNOWN_FIELD_MAP_KEYS)) {
    const code = fieldMap && fieldMap[key];
    if (code) {
      codes.add(code);
    }
  }
  return [...codes];
};

// --- kintone レコードからの値取り出し ---

// 添付フィールドの中から「図面として扱う先頭のファイル」を返す。
// plugin.js の getFirstFile と同じ基準（拡張子が pdf/tif の最初の添付）。
// 該当ファイルが無ければ null（Excel等しか添付されていないレコード）。
export const pickFirstAttachment = (record, pdfFileFieldCode) => {
  const field = record && pdfFileFieldCode ? record[pdfFileFieldCode] : null;
  const value = field && field.value;
  if (!Array.isArray(value) || !value.length) {
    return null;
  }
  const drawing = value.find((f) => /\.(pdf|tiff?)$/i.test(String((f && f.name) || '')));
  return drawing || null;
};

// テキスト系フィールドの値を文字列として取り出す。CHECK_BOX 等の配列値はカンマ結合。
// fieldCode が未指定（field-map にそのキーが無い）なら常に空文字を返す。
export const extractRecordFieldValue = (record, fieldCode) => {
  if (!fieldCode) {
    return '';
  }
  const field = record && record[fieldCode];
  if (!field) {
    return '';
  }
  const value = field.value;
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(',');
  }
  return value === undefined || value === null ? '' : String(value);
};

// --- X-Index-Meta の組み立て ---

// plugin.js の一括インデックス（app/plugin.js 1654行付近）と同じ形式のメタデータを
// 組み立てる。shapeTags はここでは送らない — server.js の /index は body.shapeTags が
// 文字列でなければ Gemini/Vertex OCR が抽出した shapeTags をそのまま使う設計であり
// （プラグインの一括登録処理も同じ理由で shapeTags を送っていない）、一括再インデックスは
// 毎回OCRをやり直すため、常に最新のAI抽出タグを使わせるのが正しい。
export const buildIndexMeta = ({ appId, recordId, tenantId, record, fieldMap, file, thumbKey }) => {
  const meta = {
    recordId: String(recordId),
    tenantId: tenantId || 'default',
    appId: String(appId),
    drawingNo: extractRecordFieldValue(record, fieldMap.drawingNoField),
    productName: extractRecordFieldValue(record, fieldMap.productNameField),
    material: extractRecordFieldValue(record, fieldMap.materialField),
    dimension: extractRecordFieldValue(record, fieldMap.dimensionField),
    processes: extractRecordFieldValue(record, fieldMap.processField),
    tags: extractRecordFieldValue(record, fieldMap.tagField),
    fileKey: file.fileKey,
    fileName: file.name || ''
  };
  if (thumbKey) {
    meta.thumbKey = thumbKey;
  }
  return meta;
};

// --- 進捗ファイル（JSONL） ---

// 進捗ファイルをパースし、recordId -> 最新エントリ の Map を返す。
// 同じ recordId が複数行あれば後勝ち（再実行のたびに追記していく前提のため）。
// 壊れた行（途中で書き込みが止まった等）は無視する。
export const parseProgressLog = (jsonlText) => {
  const map = new Map();
  const lines = String(jsonlText || '').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!entry || entry.recordId === undefined || entry.recordId === null) {
      continue;
    }
    map.set(String(entry.recordId), entry);
  }
  return map;
};

// 進捗ファイルの内容から、このレコードを今回スキップしてよいか判定する。
// --force のときは常に false（進捗を無視して必ず処理する）。
// 成功済み（success）・添付なしで恒久的にスキップ対象（skipped）は再処理不要。
// failed は再試行すべきなのでスキップしない。
export const shouldSkipRecord = (progressMap, recordId, force) => {
  if (force) {
    return false;
  }
  const entry = progressMap.get(String(recordId));
  if (!entry) {
    return false;
  }
  return entry.status === 'success' || entry.status === 'skipped';
};

export const formatProgressLine = (entry) => JSON.stringify(entry) + '\n';

// --- リトライのバックオフ ---

// 指数バックオフ + ±25%ジッタ。server.js の fetchAiWithRetry と同じジッタ幅。
// randomFn を差し替えられるようにしてテストを決定的にする（既定は Math.random）。
export const computeRetryDelayMs = (attempt, options = {}) => {
  const { baseMs = 1000, maxMs = 15000, randomFn = Math.random } = options;
  const exp = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempt - 1)));
  const jitterFactor = 1 + (randomFn() * 0.5 - 0.25);
  return Math.max(0, Math.round(exp * jitterFactor));
};

// --- ETA計算 ---

// 開始時刻・現在時刻・処理済み件数・全体件数から、残り時間とETA(ISO文字列)を推定する。
// done が 0 の間は remainingMs/etaAt を null にする（推定不能なため）。
export const estimateEta = ({ startedAt, now, done, total }) => {
  const elapsedMs = Math.max(0, now - startedAt);
  if (!done || done <= 0 || !total || total <= 0) {
    return { elapsedMs, remainingMs: null, etaAt: null };
  }
  const perItemMs = elapsedMs / done;
  const remaining = Math.max(0, total - done);
  const remainingMs = perItemMs * remaining;
  return { elapsedMs, remainingMs, etaAt: new Date(now + remainingMs).toISOString() };
};

// ミリ秒を「n時間n分n秒」形式の日本語文字列にする。負値・非数は '-'。
export const formatDurationMs = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) {
    return '-';
  }
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (h) parts.push(h + '時間');
  if (h || m) parts.push(m + '分');
  parts.push(s + '秒');
  return parts.join('');
};

// --- 並行実行 ---

// items を concurrency 件ずつ worker(item, index) で処理する最小限のワーカープール。
// kintoneファイル取得 + /index 送信をひとつの worker 呼び出しにまとめることで、
// 「API呼び出し全体でconcurrency上限」を自然に満たす（kintone用・API用に別プールを
// 作らない）。失敗した item の扱い（リトライ・記録）は呼び出し側の worker が担う
// （ここでは1件の失敗で全体を止めない — worker が例外を投げなければそれでよい）。
export const runWithConcurrency = async (items, concurrency, worker) => {
  const list = Array.isArray(items) ? items : [];
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, list.length || 1));
  let nextIndex = 0;

  const runOne = async () => {
    while (nextIndex < list.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(list[index], index);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runOne()));
};
