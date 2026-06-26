/**
 * 類似図面検索 評価スクリプト
 *
 * 使い方:
 *   node eval/eval.js
 *
 * 環境変数:
 *   API_BASE_URL   APIのベースURL          (default: http://localhost:8080)
 *   TENANT_ID      テナントID               (default: default)
 *   APP_ID         kintone アプリID         (optional)
 *   LIMIT          /similar に渡す件数      (default: 10)
 *
 * 事前準備:
 *   eval/pairs.json に正解ペアを記載してください。
 *   queryRecordId  : 検索元のレコードID
 *   label          : 識別用ラベル（任意）
 *   similarRecordIds : 類似と判断するレコードIDの配列
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const apiBaseUrl = String(process.env.API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
const tenantId = process.env.TENANT_ID || 'default';
const appId = process.env.APP_ID || '';
const limit = Number(process.env.LIMIT || 10);
const K_VALUES = [1, 3, 5, 10].filter((k) => k <= limit);

// --- ユーティリティ ---

const fmt4 = (v) => Number(v || 0).toFixed(4);
const hr = (char = '─', len = 62) => char.repeat(len);

const arrayStats = (values) => {
  if (!values.length) return { avg: 0, min: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    avg: values.reduce((s, v) => s + v, 0) / values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1]
  };
};

// --- pairs.json 読み込み ---

const pairsPath = join(__dirname, 'pairs.json');
let pairs;
try {
  pairs = JSON.parse(readFileSync(pairsPath, 'utf8'));
} catch (e) {
  console.error('pairs.json を読み込めませんでした:', e.message);
  process.exit(1);
}

if (!Array.isArray(pairs) || !pairs.length) {
  console.error('pairs.json が空です。正解ペアを追加してください。');
  process.exit(1);
}

// --- API 疎通確認 ---

try {
  const res = await fetch(apiBaseUrl + '/health');
  if (!res.ok) throw new Error('HTTP ' + res.status);
} catch (e) {
  console.error('APIに接続できませんでした:', apiBaseUrl, '/', e.message);
  process.exit(1);
}

// --- 評価実行 ---

console.log(hr('='));
console.log('  類似図面検索 評価レポート');
console.log(hr('='));
console.log('  API      :', apiBaseUrl);
console.log('  tenant   :', tenantId);
console.log('  appId    :', appId || '(未設定)');
console.log('  クエリ数  :', pairs.length);
console.log('  k        :', K_VALUES.join(', '));
console.log(hr());

const evalResults = [];

for (let i = 0; i < pairs.length; i++) {
  const pair = pairs[i];
  const queryId = String(pair.queryRecordId);
  const expectedSet = new Set((pair.similarRecordIds || []).map(String));
  const label = pair.label ? ' (' + pair.label + ')' : '';

  process.stdout.write('[' + (i + 1) + '/' + pairs.length + '] query=' + queryId + label + '\n');

  // /similar 呼び出し
  let apiResult;
  try {
    const res = await fetch(apiBaseUrl + '/similar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        ...(appId ? { appId } : {}),
        recordId: queryId,
        limit
      })
    });
    apiResult = await res.json();
    if (!res.ok) {
      throw new Error(apiResult.error || 'HTTP ' + res.status + (apiResult.step ? ' [' + apiResult.step + ']' : ''));
    }
  } catch (e) {
    console.log('  ✗ APIエラー:', e.message, '\n');
    evalResults.push({ queryId, error: e.message });
    continue;
  }

  // mode=mock は未インデックスを意味する
  if (apiResult.mode === 'mock') {
    console.log('  ⚠ 未インデックス (mode=mock) — スキップ\n');
    evalResults.push({ queryId, skipped: true });
    continue;
  }

  const items = Array.isArray(apiResult.results) ? apiResult.results : [];
  const resultIds = items.map((r) => String(r.recordId));
  const vectorRaws = items.map((r) => Number(r.vectorRaw || r.scoreBreakdown?.vectorRaw || 0));

  // 期待値の表示
  console.log('  期待  :', [...expectedSet].join(', ') || '(なし)');

  // 結果の表示 (上位5件、✓で正解をマーク)
  const topDisplay = items.slice(0, 5).map((r) => {
    const mark = expectedSet.has(String(r.recordId)) ? '✓' : ' ';
    return mark + String(r.recordId) + '(' + fmt4(r.vectorRaw || 0) + ')';
  });
  console.log('  結果  :', topDisplay.join('  ') + (items.length > 5 ? '  ...' : ''));

  // Hit@k の計算と表示
  const hitAtK = {};
  for (const k of K_VALUES) {
    hitAtK[k] = resultIds.slice(0, k).filter((id) => expectedSet.has(id)).length;
  }
  const hitLine = K_VALUES
    .map((k) => 'Hit@' + k + ' ' + (hitAtK[k] > 0 ? hitAtK[k] + '/' + expectedSet.size : '✗'))
    .join('  ');
  console.log('  ' + hitLine);

  // vectorRaw 上位3件
  if (vectorRaws.length > 0) {
    console.log('  vectorRaw top3:', vectorRaws.slice(0, 3).map(fmt4).join(' / '));
  }

  // 正解が圏外なら表示
  const missing = [...expectedSet].filter((id) => !resultIds.includes(id));
  if (missing.length > 0) {
    console.log('  ✗ top' + limit + '圏外:', missing.join(', '));
  }

  console.log();
  evalResults.push({ queryId, expectedSet, resultIds, vectorRaws, hitAtK });
}

// --- サマリー計算 ---

const valid = evalResults.filter((r) => !r.error && !r.skipped && r.hitAtK);
const skippedCount = evalResults.filter((r) => r.skipped).length;
const errorCount = evalResults.filter((r) => r.error).length;

console.log(hr());
console.log('  サマリー');
console.log(hr());
console.log(
  '  クエリ数  :',
  pairs.length,
  '  (有効:', valid.length,
  '/ スキップ:', skippedCount,
  '/ エラー:', errorCount + ')'
);
console.log();

for (const k of K_VALUES) {
  // Hit@k : top-k に正解が1件以上あったクエリの割合
  const hitQueries = valid.filter((r) => (r.hitAtK[k] || 0) >= 1).length;
  const hitRate = valid.length > 0 ? (hitQueries / valid.length).toFixed(3) : '-';

  // Precision@k : top-k 中の正解割合の平均
  const precSum = valid.reduce((s, r) => {
    const expected = r.expectedSet.size;
    if (!expected) return s;
    return s + (r.hitAtK[k] || 0) / Math.min(k, expected);
  }, 0);
  const precAvg = valid.length > 0 ? (precSum / valid.length).toFixed(3) : '-';

  const pad = k < 10 ? ' ' : '';
  console.log(
    '  Hit@' + k + pad + '      : ' + hitRate + ' (' + hitQueries + '/' + valid.length + ')',
    ' '.repeat(4),
    'Precision@' + k + pad + ' : ' + precAvg
  );
}

// --- vectorRaw 分布（DINOv2較正の参考） ---

const top1Raws = valid.map((r) => r.vectorRaws[0]).filter(Boolean);
const top3Raws = valid.flatMap((r) => r.vectorRaws.slice(0, 3)).filter(Boolean);

if (top1Raws.length > 0) {
  const s1 = arrayStats(top1Raws);
  const s3 = arrayStats(top3Raws);
  console.log();
  console.log('  vectorRaw 分布  (FLOOR / CEILING 較正の参考)');
  console.log('  top1  avg:', fmt4(s1.avg), ' min:', fmt4(s1.min), ' max:', fmt4(s1.max));
  console.log('  top3  avg:', fmt4(s3.avg), ' min:', fmt4(s3.min), ' max:', fmt4(s3.max));
  console.log();
  console.log('  ▶ SCORE_VECTOR_FLOOR  の目安:', fmt4(Math.max(0, s3.avg - 0.05)));
  console.log('  ▶ SCORE_VECTOR_CEILING の目安:', fmt4(s1.max * 0.99));
}

console.log(hr('='));
