/**
 * マルバツ判定ゲーム 純粋ロジック集
 *
 * このファイルは Node のグローバル（process/fetch/Buffer 等）や fs/http に一切
 * 依存しない。generate-set.js（出題セット生成）と aggregate.js（集計）の両方が
 * ここの関数を import して使う。副作用（ファイルIO・API呼び出し）は呼び出し側に
 * 残し、ここではテストしやすい純粋関数だけを置く。
 *
 * 乱数は mulberry32 という軽量な決定的PRNGを自前実装している（依存パッケージ追加なし）。
 * 同じ seed からは常に同じ乱数列が再現される。
 */

// --- 乱数 ---

// mulberry32: 32bit整数シードから決定的な浮動小数点列 [0, 1) を生成する。
// 出典: 公知のパブリックドメイン実装（Tommy Ettinger）。暗号用途ではなく、
// 出題の無作為抽出・シャッフル・ブートストラップの再現性確保のためだけに使う。
export const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// rng() が返す [0,1) から [0, n) の整数を取り出す（n<=0 は 0 を返す）。
export const randomIndex = (rng, n) => {
  if (n <= 0) return 0;
  return Math.min(n - 1, Math.floor(rng() * n));
};

// Fisher-Yates シャッフル。入力配列は変更せず、シャッフル済みの新しい配列を返す。
export const shuffle = (array, rng) => {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomIndex(rng, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

// 非復元抽出で n件を無作為に取り出す（n が配列長を超える場合は配列長でクランプ）。
// 実装はシャッフル済み配列の先頭 n 件を返すだけ（重複なし・毎回同じ seed 系列で再現可能）。
export const sampleWithoutReplacement = (array, n, rng) => {
  const count = Math.max(0, Math.min(n, array.length));
  return shuffle(array, rng).slice(0, count);
};

// --- 出題スケジュール（再出題の織り込み＋シャッフル） ---

// mainTrials（システム候補＋ランダム候補、まだ再出題を含まない）を受け取り、
// 1) 全体をシャッフル
// 2) 後半から repeatRate 分だけ複製して「再出題（source:'repeat'）」を作る
// 3) 再出題は後半（配列の後半部分）にのみランダムな位置で挿入する
//    （精度検証ルール文書：「全体から5%を後半に再出題」— 判定直後にすぐ再出題されると
//    単なる記憶で一致してしまい、一貫性チェックの意味が薄れるため、前半には絶対に
//    再出題を出さない設計にしている）
// を行い、最終的な出題順の配列を返す。
export const scheduleTrials = (mainTrials, rng, repeatRate = 0.05) => {
  const shuffledMain = shuffle(mainTrials, rng);
  const repeatCount = Math.round(shuffledMain.length * repeatRate);
  const repeatSources = sampleWithoutReplacement(shuffledMain, repeatCount, rng);
  const repeats = repeatSources.map((original) => ({
    ...original,
    trialId: original.trialId + '-repeat',
    source: 'repeat',
    repeatOf: original.trialId
  }));

  const mid = Math.floor(shuffledMain.length / 2);
  const front = shuffledMain.slice(0, mid);
  const back = shuffledMain.slice(mid);
  const backWithRepeats = shuffle(back.concat(repeats), rng);

  return front.concat(backWithRepeats);
};

// --- 集計: クエリ単位のグルーピング ---

export const groupByQuery = (trials) => {
  const byQuery = new Map();
  for (const trial of trials) {
    const key = String(trial.queryRecordId);
    if (!byQuery.has(key)) byQuery.set(key, []);
    byQuery.get(key).push(trial);
  }
  return byQuery;
};

const mean = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);

// --- Precision@k（クエリ単位で計算し、その平均を返す） ---
// trials は source==='system' の判定済みトライアル（judgment: 'o'|'x'|'skip'|undefined）。
// ？（skip）は分母から除外する（ルール文書の集計ルール通り）。
export const precisionAtK = (trials, k) => {
  const systemTrials = trials.filter((t) => t.source === 'system');
  const byQuery = groupByQuery(systemTrials);
  const perQuery = [];
  for (const [queryRecordId, list] of byQuery) {
    const considered = list.filter((t) => Number(t.rank) <= k && t.judgment && t.judgment !== 'skip');
    if (!considered.length) continue;
    const hits = considered.filter((t) => t.judgment === 'o').length;
    perQuery.push({ queryRecordId, value: hits / considered.length, n: considered.length });
  }
  return { value: mean(perQuery.map((q) => q.value)), perQuery };
};

// 有用率@5：上位5件（rank<=5）のうち、非skip判定に少なくとも1つ○があるクエリの割合。
// ？のみで残り判定が0件になった場合も「そのまま集計」する（＝○なしとして扱う。
// クエリ自体は分母から除外しない）— ルール文書の指示通り。
export const usefulnessAt5 = (trials) => {
  const systemTrials = trials.filter((t) => t.source === 'system');
  const byQuery = groupByQuery(systemTrials);
  const perQuery = [];
  for (const [queryRecordId, list] of byQuery) {
    const top5 = list.filter((t) => Number(t.rank) <= 5);
    if (!top5.length) continue; // このクエリのシステム候補データが無い（生成時エラー等）
    const nonSkip = top5.filter((t) => t.judgment && t.judgment !== 'skip');
    const useful = nonSkip.some((t) => t.judgment === 'o');
    perQuery.push({ queryRecordId, useful: useful ? 1 : 0 });
  }
  return { value: mean(perQuery.map((q) => q.useful)), perQuery };
};

// ランダム候補の○率（ベースライン）。トライアル単位（クエリ1件につき1トライアルなので
// クエリ単位平均と一致する）。
export const randomBaselineRate = (trials) => {
  const randomTrials = trials.filter((t) => t.source === 'random' && t.judgment && t.judgment !== 'skip');
  if (!randomTrials.length) return { value: null, n: 0 };
  const hits = randomTrials.filter((t) => t.judgment === 'o').length;
  return { value: hits / randomTrials.length, n: randomTrials.length };
};

// 再出題一致率：再出題トライアル(source==='repeat')と、その元トライアル(repeatOf)の
// 判定を比較する。どちらかが未判定/skipのペアは比較対象から除く。
export const repeatConsistency = (trials) => {
  const byId = new Map(trials.map((t) => [t.trialId, t]));
  const pairs = [];
  for (const trial of trials) {
    if (trial.source !== 'repeat') continue;
    const original = byId.get(trial.repeatOf);
    if (!original) continue;
    if (!trial.judgment || trial.judgment === 'skip') continue;
    if (!original.judgment || original.judgment === 'skip') continue;
    pairs.push({
      trialId: trial.trialId,
      repeatOf: trial.repeatOf,
      match: trial.judgment === original.judgment
    });
  }
  return { value: pairs.length ? pairs.filter((p) => p.match).length / pairs.length : null, n: pairs.length, pairs };
};

// 判定者間一致率：同一トライアルを複数判定者が判定した場合の一致率。
// entries: [{ trialId, judgments: [{ judgerName, judgment }, ...] }]
export const interRaterAgreement = (entries) => {
  let agree = 0;
  let total = 0;
  const details = [];
  for (const entry of entries) {
    const nonSkip = entry.judgments.filter((j) => j.judgment && j.judgment !== 'skip');
    if (nonSkip.length < 2) continue;
    const distinctValues = new Set(nonSkip.map((j) => j.judgment));
    const allAgree = distinctValues.size === 1;
    if (allAgree) agree += 1;
    total += 1;
    details.push({ trialId: entry.trialId, allAgree, judgments: nonSkip });
  }
  return { value: total ? agree / total : null, n: total, details };
};

// クエリ単位ブートストラップによる95%信頼区間。
// values: クエリ単位の指標値の配列（例: precisionAtK().perQuery.map(q => q.value)）。
// rng は呼び出し側で固定 seed から生成した mulberry32 インスタンスを渡す（再現性のため）。
export const bootstrapMeanCI = (values, rng, iterations = 1000) => {
  if (!values.length) return { lower: null, upper: null, n: 0 };
  const n = values.length;
  const samples = new Array(iterations);
  for (let i = 0; i < iterations; i += 1) {
    let sum = 0;
    for (let j = 0; j < n; j += 1) {
      sum += values[randomIndex(rng, n)];
    }
    samples[i] = sum / n;
  }
  samples.sort((a, b) => a - b);
  const percentile = (p) => samples[Math.min(samples.length - 1, Math.max(0, Math.floor(p * samples.length)))];
  return { lower: percentile(0.025), upper: percentile(0.975), n: iterations };
};

// --- CSV ---

// 行オブジェクト配列から簡易CSVを生成する。列は最初に出現した順（Set挿入順）。
// カンマ・引用符・改行を含む値はダブルクォートで囲む。オブジェクト値はJSON化する。
export const toCsv = (rows) => {
  if (!rows.length) return '';
  const columns = [];
  const seen = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  };
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((col) => escape(row[col])).join(','));
  }
  return lines.join('\n');
};
