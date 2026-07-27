/* global process */
/**
 * マルバツ判定ゲーム 集計スクリプト
 *
 * 使い方:
 *   node eval/marubatsu/aggregate.js --trials eval/marubatsu/out/trials.json \
 *     --judgments judgments-主判定者-....json \
 *     [--judgments judgments-副判定者-....json] \
 *     [--out eval/marubatsu/out] [--bootstrap-seed 42]
 *
 * --judgments は複数回指定できる（主判定者を最初に指定すること。1つ目のファイルが
 * Precision/有用率/ランダム対比/再出題一致率の計算に使う「主判定者」として扱われる。
 * 2つ目以降は判定者間一致率の計算にのみ使う）。
 *
 * 出力:
 *   標準出力にレポート、out/report.json、out/failures.csv、out/random_hits.csv
 */

import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';

import {
  mulberry32,
  precisionAtK,
  usefulnessAt5,
  randomBaselineRate,
  repeatConsistency,
  interRaterAgreement,
  bootstrapMeanCI,
  toCsv
} from './lib.js';

const { values: args } = parseArgs({
  options: {
    trials: { type: 'string' },
    judgments: { type: 'string', multiple: true },
    out: { type: 'string' },
    'bootstrap-seed': { type: 'string', default: '42' }
  }
});

if (!args.trials) {
  console.error('エラー: --trials <trials.jsonのパス> は必須です');
  process.exit(1);
}
if (!args.judgments || !args.judgments.length) {
  console.error('エラー: --judgments <判定結果jsonのパス> を少なくとも1つ指定してください');
  process.exit(1);
}

const trialsPath = args.trials;
const judgmentPaths = args.judgments;
const outDir = args.out || dirname(trialsPath);
const bootstrapSeed = Number(args['bootstrap-seed']) || 42;

const hr = (char = '─', len = 62) => char.repeat(len);
const pct = (v) => (v === null || v === undefined ? '-' : (v * 100).toFixed(1) + '%');
const ciStr = (ci) => (ci.lower === null ? '-' : pct(ci.lower) + ' 〜 ' + pct(ci.upper));

const loadJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const main = async () => {
  console.log(hr('='));
  console.log('  マルバツ判定ゲーム 集計レポート');
  console.log(hr('='));

  const trials = await loadJson(trialsPath);
  console.log('  trials.json      :', trialsPath, '(' + trials.length + ' trial)');

  const judgmentFiles = [];
  for (const path of judgmentPaths) {
    const data = await loadJson(path);
    judgmentFiles.push({ path, judgerName: data.judgerName || basename(path), judgments: data.trials || [] });
  }

  const primary = judgmentFiles[0];
  console.log('  主判定者          :', primary.judgerName, '(' + primary.path + ', ' + primary.judgments.length + '件判定)');
  for (const jf of judgmentFiles.slice(1)) {
    console.log('  副判定者          :', jf.judgerName, '(' + jf.path + ', ' + jf.judgments.length + '件判定)');
  }

  // trialId -> 主判定者の判定
  const primaryByTrialId = new Map(primary.judgments.map((j) => [j.trialId, j]));

  // trialId -> [{judgerName, judgment}, ...]（全判定者。判定者間一致率用）
  const allByTrialId = new Map();
  for (const jf of judgmentFiles) {
    for (const j of jf.judgments) {
      if (!allByTrialId.has(j.trialId)) allByTrialId.set(j.trialId, []);
      allByTrialId.get(j.trialId).push({ judgerName: jf.judgerName, judgment: j.judgment });
    }
  }

  const trialIdsInTrialsJson = new Set(trials.map((t) => t.trialId));
  const unknownJudgedIds = [...primaryByTrialId.keys()].filter((id) => !trialIdsInTrialsJson.has(id));
  if (unknownJudgedIds.length) {
    console.warn('  ⚠ trials.jsonに存在しないtrialIdの判定が ' + unknownJudgedIds.length + ' 件あります（無視します）');
  }

  // trialsに主判定者の判定を付与
  const judgedTrials = trials.map((t) => {
    const j = primaryByTrialId.get(t.trialId);
    return { ...t, judgment: j ? j.judgment : undefined, judgedAt: j ? j.judgedAt : undefined };
  });

  const judgedCount = judgedTrials.filter((t) => t.judgment).length;
  const oCount = judgedTrials.filter((t) => t.judgment === 'o').length;
  const xCount = judgedTrials.filter((t) => t.judgment === 'x').length;
  const skipCount = judgedTrials.filter((t) => t.judgment === 'skip').length;
  console.log('  主判定者の判定済み:', judgedCount, '/', trials.length,
    ' (○', oCount, ' ×', xCount, ' ？', skipCount + ')');
  console.log(hr());

  // --- 指標計算 ---
  const bootstrapRng = mulberry32(bootstrapSeed);

  const useful5 = usefulnessAt5(judgedTrials);
  const useful5CI = bootstrapMeanCI(useful5.perQuery.map((q) => q.useful), bootstrapRng);

  const prec1 = precisionAtK(judgedTrials, 1);
  const prec1CI = bootstrapMeanCI(prec1.perQuery.map((q) => q.value), bootstrapRng);

  const prec3 = precisionAtK(judgedTrials, 3);
  const prec3CI = bootstrapMeanCI(prec3.perQuery.map((q) => q.value), bootstrapRng);

  const prec5 = precisionAtK(judgedTrials, 5);
  const prec5CI = bootstrapMeanCI(prec5.perQuery.map((q) => q.value), bootstrapRng);

  const randomRate = randomBaselineRate(judgedTrials);

  const repeatResult = repeatConsistency(judgedTrials);

  const interRaterEntries = [...allByTrialId.entries()]
    .filter(([, judgments]) => judgments.length >= 2)
    .map(([trialId, judgments]) => ({ trialId, judgments }));
  const interRater = interRaterAgreement(interRaterEntries);

  console.log('  有用率@5          :', pct(useful5.value), ' (95%CI:', ciStr(useful5CI) + ')',
    ' n=' + useful5.perQuery.length);
  console.log('  Precision@1       :', pct(prec1.value), ' (95%CI:', ciStr(prec1CI) + ')',
    ' n=' + prec1.perQuery.length);
  console.log('  Precision@3       :', pct(prec3.value), ' (95%CI:', ciStr(prec3CI) + ')',
    ' n=' + prec3.perQuery.length);
  console.log('  Precision@5       :', pct(prec5.value), ' (95%CI:', ciStr(prec5CI) + ')',
    ' n=' + prec5.perQuery.length);
  console.log('  ランダム候補○率  :', pct(randomRate.value), ' n=' + randomRate.n,
    ' (Precision@1との対比用ベースライン)');
  console.log(hr());
  console.log('  再出題一致率      :', pct(repeatResult.value), ' n=' + repeatResult.n);
  if (interRater.n > 0) {
    console.log('  判定者間一致率    :', pct(interRater.value), ' n=' + interRater.n);
  } else {
    console.log('  判定者間一致率    : - (重複判定なし。副判定者ファイルを渡すと計算されます)');
  }
  console.log(hr());

  // --- 品質ゲート（ルール文書: 再判定一致率90%未満は要キャリブレーションやり直し） ---
  const qualityWarnings = [];
  if (repeatResult.value !== null && repeatResult.value < 0.9) {
    qualityWarnings.push(
      '再判定一致率が90%未満です (' + pct(repeatResult.value) + ')。' +
      '精度検証_マルバツ判定ルール.md の品質ゲートに従い、この回の数字は公表せず、定義を見直してキャリブレーションからやり直してください。'
    );
  }
  if (interRater.n > 0 && interRater.value !== null && interRater.value < 0.8) {
    qualityWarnings.push(
      '判定者間一致率が低めです (' + pct(interRater.value) + ')。判定基準のブレが疑われます。'
    );
  }
  if (qualityWarnings.length) {
    console.log('  ⚠ 品質ゲート警告');
    for (const w of qualityWarnings) console.log('    - ' + w);
    console.log(hr());
  }

  // --- 改善分析CSV: system候補で×またはskipだったもの（rank昇順・score降順） ---
  const failures = judgedTrials
    .filter((t) => t.source === 'system' && (t.judgment === 'x' || t.judgment === 'skip'))
    .sort((a, b) => (Number(a.rank) - Number(b.rank)) || (Number(b.score) - Number(a.score)))
    .map((t) => flattenTrialForCsv(t));

  const randomHits = judgedTrials
    .filter((t) => t.source === 'random' && t.judgment === 'o')
    .map((t) => flattenTrialForCsv(t));

  function flattenTrialForCsv(t) {
    const bd = t.scoreBreakdown || {};
    return {
      queryRecordId: t.queryRecordId,
      candidateRecordId: t.candidateRecordId,
      rank: t.rank ?? '',
      score: t.score ?? '',
      vectorRaw: t.vectorRaw ?? '',
      bd_vector: bd.vector ?? '',
      bd_metadata: bd.metadata ?? '',
      bd_shape: bd.shape ?? '',
      bd_tag: bd.tag ?? '',
      bd_shapeTag: bd.shapeTag ?? '',
      bd_bonus: bd.bonus ?? '',
      bd_total: bd.total ?? '',
      judgment: t.judgment ?? '',
      reasons: Array.isArray(t.reasons) ? t.reasons.join('|') : ''
    };
  }

  // --- ファイル出力 ---
  await mkdir(outDir, { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    trialsPath,
    judgmentFiles: judgmentFiles.map((jf) => ({ path: jf.path, judgerName: jf.judgerName, count: jf.judgments.length })),
    bootstrapSeed,
    counts: { trialCount: trials.length, judgedCount, oCount, xCount, skipCount },
    metrics: {
      usefulnessAt5: { value: useful5.value, ci95: useful5CI, n: useful5.perQuery.length },
      precisionAt1: { value: prec1.value, ci95: prec1CI, n: prec1.perQuery.length },
      precisionAt3: { value: prec3.value, ci95: prec3CI, n: prec3.perQuery.length },
      precisionAt5: { value: prec5.value, ci95: prec5CI, n: prec5.perQuery.length },
      randomBaselineRate: randomRate
    },
    reliability: {
      repeatConsistency: { value: repeatResult.value, n: repeatResult.n },
      interRaterAgreement: { value: interRater.value, n: interRater.n }
    },
    qualityWarnings,
    failuresCount: failures.length,
    randomHitsCount: randomHits.length
  };

  const reportPath = join(outDir, 'report.json');
  const failuresPath = join(outDir, 'failures.csv');
  const randomHitsPath = join(outDir, 'random_hits.csv');

  await writeFile(reportPath, JSON.stringify(report, null, 2));
  // CSVはUTF-8 BOM付きで出力する（ExcelでダブルクリックしてもshapeTag等の日本語が化けないように）
  await writeFile(failuresPath, '\ufeff' + toCsv(failures));
  await writeFile(randomHitsPath, '\ufeff' + toCsv(randomHits));

  console.log('  改善分析(failures.csv)   :', failures.length, '件 →', failuresPath);
  console.log('  参考(random_hits.csv)   :', randomHits.length, '件 →', randomHitsPath);
  console.log('  レポート                :', reportPath);
  console.log(hr('='));
};

main().catch((error) => {
  console.error('エラー:', error.message);
  process.exit(1);
});
