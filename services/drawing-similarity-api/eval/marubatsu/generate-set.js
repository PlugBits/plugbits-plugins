/* global process, fetch, Buffer, URL */
/**
 * マルバツ判定ゲーム 出題セット生成スクリプト
 *
 * 使い方:
 *   node eval/marubatsu/generate-set.js --seed 20260725 [--queries 100] [--top 5] [--split dev] [--out eval/marubatsu/out]
 *
 * 環境変数:
 *   API_BASE_URL       drawing-similarity API のベースURL (default: http://localhost:8080)
 *   TENANT_ID          テナントID                        (default: default)
 *   API_KEY            X-API-Key ヘッダー（テナント認証有効時のみ必要。任意）
 *   KINTONE_BASE_URL   kintone サブドメインのベースURL（サムネイル取得に必須）
 *   KINTONE_API_TOKEN  kintone REST APIトークン（サムネイル取得に必須）
 *
 * 処理の流れ:
 *   1. GET /index-status で登録済み全レコード（record_id + file_key）を取得
 *   2. seed付きPRNG（mulberry32, lib.js）でクエリを無作為抽出
 *   3. 各クエリで POST /similar を呼び、上位 top 件を「system候補」にする
 *   4. 各クエリにランダム候補を1枚追加
 *   5. 全trialの5%を再出題（repeat）として複製
 *   6. 全問シャッフル（re出題は後半にのみ挿入。lib.js の scheduleTrials 参照）
 *   7. trials.json を出力（メタデータは判定ページでは見せないが、ファイルには全部残す）
 *   8. サムネイルを事前生成し out/thumbs/<recordId>.png にキャッシュ
 *   9. 生成サマリを out/manifest.json と標準出力に出す
 */

import { parseArgs } from 'node:util';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mulberry32, sampleWithoutReplacement, scheduleTrials } from './lib.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- CLI引数 ---

const { values: args } = parseArgs({
  options: {
    queries: { type: 'string', default: '100' },
    seed: { type: 'string' },
    top: { type: 'string', default: '5' },
    split: { type: 'string' },
    out: { type: 'string' }
  }
});

if (!args.seed || !/^-?\d+$/.test(args.seed.trim())) {
  console.error('エラー: --seed <整数> は必須です（再現性のため必ず記録してください）');
  process.exit(1);
}

const SEED = Number(args.seed);
const QUERY_COUNT = Math.max(1, Number(args.queries) || 100);
const TOP_K = Math.max(1, Number(args.top) || 5);
const SPLIT = args.split || '';
const OUT_DIR = args.out ? args.out : join(__dirname, 'out');
const THUMBS_DIR = join(OUT_DIR, 'thumbs');
const REPEAT_RATE = 0.05;
const THUMB_MAX_WIDTH = 600;

// --- 環境変数 ---

const apiBaseUrl = String(process.env.API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
const tenantId = process.env.TENANT_ID || 'default';
const apiKey = process.env.API_KEY || '';
const kintoneBaseUrl = String(process.env.KINTONE_BASE_URL || '').replace(/\/+$/, '');
const kintoneApiToken = process.env.KINTONE_API_TOKEN || '';

if (!kintoneBaseUrl || !kintoneApiToken) {
  console.error('エラー: KINTONE_BASE_URL と KINTONE_API_TOKEN の両方が必要です（サムネイル生成に使用）');
  process.exit(1);
}

const apiHeaders = (extra = {}) => ({
  'Content-Type': 'application/json',
  ...(apiKey ? { 'X-API-Key': apiKey } : {}),
  ...extra
});

const hr = (char = '─', len = 62) => char.repeat(len);

// --- API呼び出しヘルパー ---
// generate-set.js は素朴なCLIスクリプトなので、失敗したら理由を出して即終了する
// （リトライやバックオフは既存 server.js のGemini呼び出し等ほど厳密にしなくてよい想定）。

const fetchIndexStatus = async () => {
  const url = new URL('/index-status', apiBaseUrl);
  url.searchParams.set('tenantId', tenantId);
  const res = await fetch(url, { headers: apiHeaders() });
  const data = await res.json();
  if (!res.ok) {
    throw new Error('index-status 取得失敗: HTTP ' + res.status + ' ' + (data.error || ''));
  }
  if (!data.configured) {
    throw new Error('index-status が configured:false を返しました（Qdrant未設定の可能性）');
  }
  return data.items || [];
};

const fetchSimilar = async (recordId, limit) => {
  const res = await fetch(new URL('/similar', apiBaseUrl), {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ tenantId, recordId, limit })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error('similar 取得失敗 (recordId=' + recordId + '): HTTP ' + res.status + ' ' + (data.error || ''));
  }
  return data;
};

// kintone から直接PDFを取得する（server.js の fetchKintoneFile と同じ経路。
// このスクリプトは server.js を経由せず kintone REST API を直接叩く —
// 検証ツールが本番APIサーバーの kintone接続設定に依存しないようにするための判断。
// PNG化だけは既存の /render-thumbnail を再利用する（PDFレンダリングロジックの
// 二重実装を避けるため。ルール文書の「/render-thumbnail 流用」指示通り）。
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

const renderThumbnail = async (pdfBuffer) => {
  const res = await fetch(new URL('/render-thumbnail', apiBaseUrl), {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ pdf_base64: pdfBuffer.toString('base64'), max_width: THUMB_MAX_WIDTH })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error('render-thumbnail 失敗: HTTP ' + res.status + ' ' + (data.error || ''));
  }
  return Buffer.from(await res.arrayBuffer());
};

const fileExists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

// --- メイン処理 ---

const main = async () => {
  console.log(hr('='));
  console.log('  マルバツ判定ゲーム 出題セット生成');
  console.log(hr('='));
  console.log('  API      :', apiBaseUrl);
  console.log('  tenant   :', tenantId);
  console.log('  seed     :', SEED);
  console.log('  queries  :', QUERY_COUNT, '  top:', TOP_K, '  split:', SPLIT || '(なし)');
  console.log('  out      :', OUT_DIR);
  console.log(hr());

  const rng = mulberry32(SEED);

  // 1. 登録済みレコード一覧
  const allItems = await fetchIndexStatus();
  const eligibleItems = allItems.filter((item) => item.fileKey);
  const excludedNoFileKeyCount = allItems.length - eligibleItems.length;
  if (excludedNoFileKeyCount > 0) {
    console.warn(
      '  ⚠ file_key が無いレコード ' + excludedNoFileKeyCount + ' 件を出題プールから除外しました' +
      '（アーカイブ由来などkintoneファイルが紐付かないレコードの可能性）'
    );
  }
  console.log('  登録済みレコード:', allItems.length, ' (出題プール対象:', eligibleItems.length + ')');

  if (!eligibleItems.length) {
    throw new Error('出題プールが空です（file_key付きの登録済みレコードがありません）');
  }

  const actualQueryCount = Math.min(QUERY_COUNT, eligibleItems.length);
  if (actualQueryCount < QUERY_COUNT) {
    console.warn('  ⚠ 要求クエリ数 ' + QUERY_COUNT + ' に対し、出題プールが ' + eligibleItems.length + ' 件しかないため ' + actualQueryCount + ' 件に縮小します');
  }

  const queries = sampleWithoutReplacement(eligibleItems, actualQueryCount, rng);

  const rawTrials = [];
  const thumbTargets = new Map(); // recordId -> fileKey
  let excludedArchiveCandidateCount = 0;
  let shortSystemCandidateQueries = 0;

  for (let i = 0; i < queries.length; i += 1) {
    const query = queries[i];
    process.stdout.write('  [' + (i + 1) + '/' + queries.length + '] query=' + query.recordId + '\r');

    let similarData;
    try {
      similarData = await fetchSimilar(query.recordId, TOP_K + 5);
    } catch (e) {
      console.warn('\n  ⚠ query=' + query.recordId + ' の /similar 呼び出しに失敗、このクエリをスキップ: ' + e.message);
      continue;
    }

    if (similarData.mode === 'mock') {
      console.warn('\n  ⚠ query=' + query.recordId + ' は未インデックス(mode=mock)、スキップ');
      continue;
    }

    const results = Array.isArray(similarData.results) ? similarData.results : [];

    // クエリ自身の除外（保険）・アーカイブ由来やfile_key欠落の候補の除外
    const filtered = [];
    for (const item of results) {
      if (String(item.recordId) === String(query.recordId)) continue;
      if (item.docType === 'archive' || !item.fileKey) {
        excludedArchiveCandidateCount += 1;
        continue;
      }
      filtered.push(item);
    }

    const systemCandidates = filtered.slice(0, TOP_K);
    if (systemCandidates.length < TOP_K) {
      shortSystemCandidateQueries += 1;
      console.warn(
        '\n  ⚠ query=' + query.recordId + ' はsystem候補が ' + systemCandidates.length + '/' + TOP_K + ' 件しか確保できませんでした'
      );
    }

    const usedCandidateIds = new Set(systemCandidates.map((c) => String(c.recordId)));

    systemCandidates.forEach((candidate, index) => {
      rawTrials.push({
        trialId: 'sys-' + query.recordId + '-' + (index + 1),
        queryRecordId: String(query.recordId),
        candidateRecordId: String(candidate.recordId),
        source: 'system',
        rank: index + 1,
        score: candidate.score,
        scoreBreakdown: candidate.scoreBreakdown,
        vectorRaw: candidate.vectorRaw,
        split: SPLIT,
        seed: SEED
      });
      thumbTargets.set(String(candidate.recordId), candidate.fileKey);
    });

    // ランダム候補: クエリ自身とこのクエリのsystem候補を除いたプールから1枚
    const randomPool = eligibleItems.filter((item) => {
      const id = String(item.recordId);
      return id !== String(query.recordId) && !usedCandidateIds.has(id);
    });
    const [randomCandidate] = sampleWithoutReplacement(randomPool, 1, rng);
    if (randomCandidate) {
      rawTrials.push({
        trialId: 'rnd-' + query.recordId,
        queryRecordId: String(query.recordId),
        candidateRecordId: String(randomCandidate.recordId),
        source: 'random',
        rank: null,
        score: null,
        scoreBreakdown: null,
        vectorRaw: null,
        split: SPLIT,
        seed: SEED
      });
      thumbTargets.set(String(randomCandidate.recordId), randomCandidate.fileKey);
    }

    thumbTargets.set(String(query.recordId), query.fileKey);
  }
  console.log(); // \r で潰した行の後で改行

  if (!rawTrials.length) {
    throw new Error('有効なtrialが1件も生成できませんでした（全クエリでエラーまたはスキップ）');
  }

  // --- 再出題の織り込み＋シャッフル ---
  const finalTrials = scheduleTrials(rawTrials, rng, REPEAT_RATE);
  const repeatCount = finalTrials.filter((t) => t.source === 'repeat').length;

  // --- サムネイル事前生成 ---
  await mkdir(THUMBS_DIR, { recursive: true });
  console.log('  サムネイル生成対象:', thumbTargets.size, '件');
  let thumbGenerated = 0;
  let thumbSkippedCached = 0;
  let thumbFailed = 0;
  let done = 0;
  for (const [recordId, fileKey] of thumbTargets) {
    done += 1;
    const dest = join(THUMBS_DIR, recordId + '.png');
    process.stdout.write('  [' + done + '/' + thumbTargets.size + '] thumb recordId=' + recordId + '\r');
    if (await fileExists(dest)) {
      thumbSkippedCached += 1;
      continue;
    }
    try {
      const pdfBuffer = await fetchKintoneFile(fileKey);
      const pngBuffer = await renderThumbnail(pdfBuffer);
      await writeFile(dest, pngBuffer);
      thumbGenerated += 1;
    } catch (e) {
      thumbFailed += 1;
      console.warn('\n  ⚠ recordId=' + recordId + ' のサムネイル生成に失敗: ' + e.message);
    }
  }
  console.log();

  // --- 出力 ---
  await mkdir(OUT_DIR, { recursive: true });
  const trialsPath = join(OUT_DIR, 'trials.json');
  const manifestPath = join(OUT_DIR, 'manifest.json');

  await writeFile(trialsPath, JSON.stringify(finalTrials, null, 2));

  const manifest = {
    generatedAt: new Date().toISOString(),
    seed: SEED,
    split: SPLIT || null,
    apiBaseUrl,
    tenantId,
    requestedQueries: QUERY_COUNT,
    actualQueries: queries.length,
    top: TOP_K,
    repeatRate: REPEAT_RATE,
    trialCount: finalTrials.length,
    systemTrialCount: finalTrials.filter((t) => t.source === 'system').length,
    randomTrialCount: finalTrials.filter((t) => t.source === 'random').length,
    repeatTrialCount: repeatCount,
    excludedNoFileKeyCount,
    excludedArchiveCandidateCount,
    shortSystemCandidateQueries,
    thumbnails: {
      target: thumbTargets.size,
      generated: thumbGenerated,
      cachedSkipped: thumbSkippedCached,
      failed: thumbFailed
    }
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(hr());
  console.log('  生成サマリー');
  console.log(hr());
  console.log('  クエリ数        :', queries.length, '/', QUERY_COUNT, '要求');
  console.log('  trial数         :', finalTrials.length,
    '(system:', manifest.systemTrialCount, ' random:', manifest.randomTrialCount, ' repeat:', repeatCount + ')');
  console.log('  除外(file_key無):', excludedNoFileKeyCount);
  console.log('  除外(アーカイブ候補):', excludedArchiveCandidateCount);
  console.log('  system候補不足クエリ:', shortSystemCandidateQueries);
  console.log('  サムネイル      : 生成', thumbGenerated, ' キャッシュ流用', thumbSkippedCached, ' 失敗', thumbFailed);
  console.log('  seed            :', SEED);
  console.log('  出力            :', trialsPath);
  console.log('                   ', manifestPath);
  console.log(hr('='));

  if (thumbFailed > 0) {
    console.warn('  ⚠ サムネイル生成に失敗した図面があります。judge.html で画像が表示されません。上記の警告を確認してください。');
  }
};

main().catch((error) => {
  console.error('エラー:', error.message);
  process.exit(1);
});
