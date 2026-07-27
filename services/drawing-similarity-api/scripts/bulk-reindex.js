/* global process, fetch, Buffer, URL */
/**
 * サーバ主導の一括再インデックス CLI
 *
 * kintone に登録済みの図面（数千件規模）を、ブラウザ（kintoneプラグイン）を使わずに
 * drawing-similarity API の /index へ一括で（再）登録する。用途:
 *   1. EMBED_IMAGE_MODE の A/B実験 — 実験用デプロイ（別Qdrantコレクション）へ全量登録し、
 *      eval/eval.js で現行と数字を比較する（詳細は同ディレクトリの bulk-reindex.md 参照）
 *   2. 将来の加工方法フィールド反映など、任意タイミングでの再インデックス
 *
 * 一晩で完走できること・途中で落ちても再開できることを前提に設計している:
 *   - 進捗は JSONL に1行ずつ追記する（プロセスが落ちても直前までの結果は残る）
 *   - 再実行時は進捗ファイルを読み、成功済み・添付なしのレコードを自動でスキップする
 *
 * 使い方:
 *   node scripts/bulk-reindex.js --app 123 --field-map ./field-map.json
 *   node scripts/bulk-reindex.js --app 123 --field-map ./field-map.json --limit 10 --dry-run
 *
 * 環境変数:
 *   KINTONE_BASE_URL   kintone サブドメインのベースURL（必須）
 *   KINTONE_API_TOKEN  kintone REST APIトークン（必須。レコード一覧・ファイル取得の両方に使う）
 *   TARGET_API_BASE_URL 登録先の drawing-similarity API のベースURL（必須。実験用デプロイ等）
 *   API_KEY            X-API-Key ヘッダー（任意。テナント認証有効時のみ必要）
 *   TENANT_ID          テナントID                          (既定 default)
 *   THUMB_KEY          暗号化サムネイル鍵（プラグイン設定の thumbEncKey と同じ base64
 *                      文字列。指定時のみ /index に thumbKey として同梱する。未指定なら
 *                      サムネイルなしで登録される — server.js の /index は thumbKey が
 *                      無ければ暗号化サムネイルの生成・保存を一切行わない）
 *
 * CLI引数:
 *   --app <appId>            kintone アプリID（必須）
 *   --field-map <path>       フィールドコードのマッピングJSON（必須。bulk-reindex.md 参照）
 *   --concurrency <N>        並行実行数（既定 3。kintone REST・登録先APIの双方の負荷になる）
 *   --limit <N>               先頭N件のみ処理（スモークテスト用）
 *   --records <id,id,...>    指定レコードのみ処理
 *   --progress <path>        進捗ファイルのパス（既定 scripts/bulk-reindex-progress.jsonl）
 *   --dry-run                取得と対象一覧表示のみ。/index は一切呼ばない
 *   --force                  進捗ファイルを無視して全件処理する
 */

import { parseArgs } from 'node:util';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateFieldMap,
  fieldMapToKintoneFields,
  pickFirstAttachment,
  buildIndexMeta,
  parseProgressLog,
  shouldSkipRecord,
  formatProgressLine,
  computeRetryDelayMs,
  estimateEta,
  formatDurationMs,
  runWithConcurrency
} from './bulk-reindex-lib.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hr = (char = '─', len = 62) => char.repeat(len);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- CLI引数 ---

const { values: args } = parseArgs({
  options: {
    app: { type: 'string' },
    'field-map': { type: 'string' },
    concurrency: { type: 'string', default: '3' },
    limit: { type: 'string' },
    records: { type: 'string' },
    progress: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false }
  }
});

if (!args.app || !/^\d+$/.test(String(args.app).trim())) {
  console.error('エラー: --app <appId> は必須です（数値のkintoneアプリID）');
  process.exit(1);
}
if (!args['field-map']) {
  console.error('エラー: --field-map <path> は必須です（フィールドコードのマッピングJSON）');
  process.exit(1);
}

const APP_ID = String(args.app).trim();
const FIELD_MAP_PATH = resolve(process.cwd(), args['field-map']);
const CONCURRENCY = Math.max(1, Number(args.concurrency) || 3);
const LIMIT = args.limit ? Math.max(1, Number(args.limit) || 0) : null;
const ONLY_RECORD_IDS = args.records
  ? String(args.records).split(',').map((s) => s.trim()).filter(Boolean)
  : null;
const PROGRESS_PATH = args.progress
  ? resolve(process.cwd(), args.progress)
  : join(__dirname, 'bulk-reindex-progress.jsonl');
const DRY_RUN = Boolean(args['dry-run']);
const FORCE = Boolean(args.force);
const MAX_ATTEMPTS = 3; // 初回 + リトライ2回

// --- 環境変数 ---

const kintoneBaseUrl = String(process.env.KINTONE_BASE_URL || '').replace(/\/+$/, '');
const kintoneApiToken = process.env.KINTONE_API_TOKEN || '';
const targetApiBaseUrl = String(process.env.TARGET_API_BASE_URL || '').replace(/\/+$/, '');
const apiKey = process.env.API_KEY || '';
const tenantId = process.env.TENANT_ID || 'default';
const thumbKey = process.env.THUMB_KEY || '';

if (!kintoneBaseUrl || !kintoneApiToken) {
  console.error('エラー: KINTONE_BASE_URL と KINTONE_API_TOKEN の両方が必要です');
  process.exit(1);
}
if (!targetApiBaseUrl) {
  console.error('エラー: TARGET_API_BASE_URL が必要です（登録先の drawing-similarity API）');
  process.exit(1);
}
if (thumbKey) {
  // 32バイトでなくてもサーバー側は例外を投げず「サムネイルなしで登録続行」に
  // フォールバックするだけだが、設定ミスに早めに気づけるようここで警告しておく。
  const decodedLength = Buffer.from(thumbKey, 'base64').length;
  if (decodedLength !== 32) {
    console.warn(
      '⚠ THUMB_KEY の base64 デコード後の長さが ' + decodedLength + ' バイトです（期待値32）。' +
      'サーバー側でサムネイル暗号化がスキップされます（登録自体は続行されます）。'
    );
  }
}

const kintoneHeaders = {
  'X-Cybozu-API-Token': kintoneApiToken,
  'Content-Type': 'application/json'
};

// --- field-map 読み込み ---

let fieldMap;
try {
  fieldMap = JSON.parse(await readFile(FIELD_MAP_PATH, 'utf8'));
} catch (e) {
  console.error('エラー: field-map の読み込みに失敗しました (' + FIELD_MAP_PATH + '): ' + e.message);
  process.exit(1);
}

const fieldMapCheck = validateFieldMap(fieldMap);
for (const warning of fieldMapCheck.warnings) {
  console.warn('⚠ ' + warning);
}
if (!fieldMapCheck.ok) {
  console.error('エラー: field-map が不正です:');
  for (const error of fieldMapCheck.errors) {
    console.error('  - ' + error);
  }
  process.exit(1);
}

// --- kintone REST ヘルパー ---
// generate-set.js と同じく、このスクリプトも kintone REST API を直接叩く
// （drawing-similarity API サーバーの kintone接続設定に依存しないようにするため）。

const createCursor = async (fields, query) => {
  const res = await fetch(new URL('/k/v1/records/cursor.json', kintoneBaseUrl), {
    method: 'POST',
    headers: kintoneHeaders,
    body: JSON.stringify({ app: APP_ID, fields, size: 500, ...(query ? { query } : {}) })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error('cursor作成失敗: HTTP ' + res.status + ' ' + (data.message || JSON.stringify(data)));
  }
  return data; // { id, totalCount }
};

const fetchCursorPage = async (cursorId) => {
  const url = new URL('/k/v1/records/cursor.json', kintoneBaseUrl);
  url.searchParams.set('id', cursorId);
  const res = await fetch(url, { headers: kintoneHeaders });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error('cursor取得失敗: HTTP ' + res.status + ' ' + (data.message || JSON.stringify(data)));
  }
  return data; // { records, next }
};

const fetchAllRecords = async () => {
  const fields = fieldMapToKintoneFields(fieldMap);
  const query = ONLY_RECORD_IDS
    ? '$id in (' + ONLY_RECORD_IDS.map((id) => String(id).replace(/[^0-9]/g, '')).filter(Boolean).join(',') + ')'
    : '';
  const cursor = await createCursor(fields, query);
  const records = [];
  let next = true;
  while (next) {
    const page = await fetchCursorPage(cursor.id);
    records.push(...page.records);
    process.stdout.write('  レコード取得中... ' + records.length + '/' + cursor.totalCount + '\r');
    next = Boolean(page.next);
  }
  console.log('  レコード取得完了: ' + records.length + '件' + ' '.repeat(20));
  return records;
};

const fetchKintoneFile = async (fileKey) => {
  const url = new URL('/k/v1/file.json', kintoneBaseUrl);
  url.searchParams.set('fileKey', fileKey);
  const res = await fetch(url, { headers: { 'X-Cybozu-API-Token': kintoneApiToken } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('kintone file.json 取得失敗 (fileKey=' + fileKey + '): HTTP ' + res.status + ' ' + body.slice(0, 200));
  }
  return Buffer.from(await res.arrayBuffer());
};

// --- 登録先 drawing-similarity API ---

const postIndex = async (pdfBuffer, meta) => {
  const res = await fetch(new URL('/index', targetApiBaseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      // メタデータはヘッダーで送る（plugin.js の一括登録処理と同じ経路。
      // 数千件連続でPDFをbase64化しないためのバイナリ直送）。
      'X-Index-Meta': encodeURIComponent(JSON.stringify(meta)),
      ...(apiKey ? { 'X-API-Key': apiKey } : {})
    },
    body: pdfBuffer
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'HTTP ' + res.status + (data.step ? ' [' + data.step + ']' : ''));
  }
  return data;
};

// --- 進捗ファイル ---

await mkdir(dirname(PROGRESS_PATH), { recursive: true });

let progressMap = new Map();
try {
  const existing = await readFile(PROGRESS_PATH, 'utf8');
  progressMap = parseProgressLog(existing);
} catch {
  // 初回実行はファイルが無くて当然
}

const appendProgress = async (entry) => {
  await appendFile(PROGRESS_PATH, formatProgressLine(entry));
};

// --- メイン処理 ---

const main = async () => {
  console.log(hr('='));
  console.log('  drawing-similarity 一括再インデックス');
  console.log(hr('='));
  console.log('  kintone     :', kintoneBaseUrl);
  console.log('  app         :', APP_ID);
  console.log('  登録先API    :', targetApiBaseUrl);
  console.log('  tenant      :', tenantId);
  console.log('  thumbKey    :', thumbKey ? '設定あり（暗号化サムネイルを生成）' : '未設定（サムネイルなし）');
  console.log('  concurrency :', CONCURRENCY);
  console.log('  progress    :', PROGRESS_PATH);
  console.log('  dry-run     :', DRY_RUN);
  console.log('  force       :', FORCE);
  if (LIMIT) console.log('  limit       :', LIMIT);
  if (ONLY_RECORD_IDS) console.log('  records     :', ONLY_RECORD_IDS.join(','));
  console.log(hr());

  let records = await fetchAllRecords();
  if (LIMIT) {
    records = records.slice(0, LIMIT);
    console.log('  --limit により先頭 ' + records.length + ' 件に絞り込み');
  }

  // 対象の分類: 添付あり/なし・進捗ファイルによるスキップ対象
  const noAttachmentRecords = [];
  const alreadyDoneRecords = [];
  const targetRecords = [];
  for (const record of records) {
    const recordId = String(record['$id'].value);
    if (shouldSkipRecord(progressMap, recordId, FORCE)) {
      alreadyDoneRecords.push(recordId);
      continue;
    }
    const file = pickFirstAttachment(record, fieldMap.pdfFileField);
    if (!file) {
      noAttachmentRecords.push(recordId);
      continue;
    }
    targetRecords.push({ record, recordId, file });
  }

  console.log(hr());
  console.log('  取得レコード数     :', records.length);
  console.log('  進捗ファイルでスキップ:', alreadyDoneRecords.length, '（success/skipped済み。--force で無視）');
  console.log('  添付なし(要スキップ) :', noAttachmentRecords.length);
  console.log('  今回の処理対象      :', targetRecords.length);
  console.log(hr());

  if (DRY_RUN) {
    console.log('  [dry-run] /index は呼び出しません。上記の対象一覧のみ表示しました。');
    if (targetRecords.length) {
      console.log('  対象recordId (先頭20件):', targetRecords.slice(0, 20).map((t) => t.recordId).join(', '));
    }
    return;
  }

  if (!targetRecords.length) {
    console.log('  処理対象がありません。終了します。');
    return;
  }

  // --- 並行実行本体 ---

  const startedAt = Date.now();
  const counts = { success: 0, fail: 0, skip: 0 };
  const failures = [];
  let done = 0;

  const printProgress = (recordId, resultLabel) => {
    done += 1;
    const eta = estimateEta({ startedAt, now: Date.now(), done, total: targetRecords.length });
    const etaText = eta.remainingMs === null ? '算出中' : formatDurationMs(eta.remainingMs) + '後';
    console.log(
      '  [' + done + '/' + targetRecords.length + '] recordId=' + recordId + ' ' + resultLabel +
      '  (成功' + counts.success + ' 失敗' + counts.fail + ' スキップ' + counts.skip + ')' +
      '  経過' + formatDurationMs(eta.elapsedMs) + ' ETA:' + etaText
    );
  };

  const processRecord = async ({ record, recordId, file }) => {
    const meta = buildIndexMeta({ appId: APP_ID, recordId, tenantId, record, fieldMap, file, thumbKey });

    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const pdfBuffer = await fetchKintoneFile(file.fileKey);
        await postIndex(pdfBuffer, meta);
        counts.success += 1;
        await appendProgress({ recordId, status: 'success', at: new Date().toISOString() });
        printProgress(recordId, '成功');
        return;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_ATTEMPTS) {
          const delayMs = computeRetryDelayMs(attempt);
          console.warn(
            '  ⚠ recordId=' + recordId + ' 失敗（試行' + attempt + '/' + MAX_ATTEMPTS + '）: ' +
            error.message + ' — ' + delayMs + 'ms後に再試行'
          );
          await sleep(delayMs);
        }
      }
    }

    counts.fail += 1;
    const message = lastError ? lastError.message : '不明なエラー';
    failures.push({ recordId, message });
    await appendProgress({ recordId, status: 'failed', at: new Date().toISOString(), error: message });
    printProgress(recordId, '失敗: ' + message);
  };

  // 添付なしレコードも進捗ファイルには記録しておく（次回実行時に毎回同じ判定を
  // やり直さずスキップできるようにするため）。/index は呼ばない。
  for (const recordId of noAttachmentRecords) {
    counts.skip += 1;
    await appendProgress({ recordId, status: 'skipped', at: new Date().toISOString(), error: 'no attachment' });
  }

  await runWithConcurrency(targetRecords, CONCURRENCY, processRecord);

  // --- サマリ ---

  console.log(hr('='));
  console.log('  完了サマリー');
  console.log(hr('='));
  console.log('  成功       :', counts.success);
  console.log('  失敗       :', counts.fail);
  console.log('  添付なしskip:', counts.skip);
  console.log('  既存skip   :', alreadyDoneRecords.length);
  console.log('  所要時間    :', formatDurationMs(Date.now() - startedAt));
  console.log(hr());

  if (failures.length) {
    console.log('  失敗一覧:');
    for (const f of failures) {
      console.log('   - recordId=' + f.recordId + ': ' + f.message);
    }
    console.log(hr());
    console.log('  再実行すれば失敗分のみ自動的にリトライされます（進捗ファイル: ' + PROGRESS_PATH + '）');
  }
};

main().catch((error) => {
  console.error('エラー:', error.message);
  process.exit(1);
});
