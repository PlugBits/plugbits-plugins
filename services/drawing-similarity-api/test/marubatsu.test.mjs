// マルバツ判定ゲーム（eval/marubatsu/lib.js）の純粋ロジックに対するユニットテスト。
// API呼び出し・ファイルIOは一切行わない（lib.js 自体がそれらに依存しない設計のため）。
//
//   node --test test/marubatsu.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  mulberry32,
  randomIndex,
  shuffle,
  sampleWithoutReplacement,
  scheduleTrials,
  groupByQuery,
  precisionAtK,
  usefulnessAt5,
  randomBaselineRate,
  repeatConsistency,
  interRaterAgreement,
  bootstrapMeanCI,
  toCsv
} from '../eval/marubatsu/lib.js';

describe('mulberry32 PRNG', () => {
  test('同じseedからは同じ乱数列が再現される', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    assert.deepEqual(seqA, seqB);
  });

  test('異なるseedからは異なる乱数列になる', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    assert.notDeepEqual(seqA, seqB);
  });

  test('出力は常に[0,1)の範囲', () => {
    const rng = mulberry32(999);
    for (let i = 0; i < 1000; i += 1) {
      const v = rng();
      assert.ok(v >= 0 && v < 1, 'out of range: ' + v);
    }
  });

  test('randomIndexはn未満の整数を返す', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i += 1) {
      const idx = randomIndex(rng, 5);
      assert.ok(Number.isInteger(idx) && idx >= 0 && idx < 5);
    }
  });
});

describe('shuffle / sampleWithoutReplacement', () => {
  test('shuffleは同じ要素の集合を保つ（並び替えのみ）', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const rng = mulberry32(42);
    const shuffled = shuffle(input, rng);
    assert.deepEqual([...shuffled].sort((a, b) => a - b), input);
  });

  test('shuffleは入力配列を変更しない', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffle(input, mulberry32(1));
    assert.deepEqual(input, copy);
  });

  test('同じseedなら同じ並びになる（決定性）', () => {
    const input = Array.from({ length: 30 }, (_, i) => i);
    const a = shuffle(input, mulberry32(555));
    const b = shuffle(input, mulberry32(555));
    assert.deepEqual(a, b);
  });

  test('異なるseedならほぼ確実に異なる並びになる', () => {
    const input = Array.from({ length: 30 }, (_, i) => i);
    const a = shuffle(input, mulberry32(1));
    const b = shuffle(input, mulberry32(2));
    assert.notDeepEqual(a, b);
  });

  test('sampleWithoutReplacementは重複なくn件を取り出す', () => {
    const input = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    const rng = mulberry32(10);
    const sample = sampleWithoutReplacement(input, 10, rng);
    assert.equal(sample.length, 10);
    const ids = sample.map((x) => x.id);
    assert.equal(new Set(ids).size, 10);
    for (const id of ids) {
      assert.ok(id >= 0 && id < 50);
    }
  });

  test('n が配列長を超える場合は配列長にクランプされる', () => {
    const input = [1, 2, 3];
    const sample = sampleWithoutReplacement(input, 10, mulberry32(1));
    assert.equal(sample.length, 3);
  });
});

describe('scheduleTrials（再出題の織り込み＋シャッフル）', () => {
  const makeMainTrials = (n) => Array.from({ length: n }, (_, i) => ({
    trialId: 'trial-' + i,
    queryRecordId: 'q' + (i % 10),
    candidateRecordId: 'c' + i,
    source: i % 6 === 0 ? 'random' : 'system',
    rank: i % 6 === 0 ? null : (i % 5) + 1
  }));

  test('repeatCountはtrial総数の約5%になる', () => {
    const main = makeMainTrials(600);
    const scheduled = scheduleTrials(main, mulberry32(1), 0.05);
    const repeats = scheduled.filter((t) => t.source === 'repeat');
    assert.equal(repeats.length, 30); // round(600 * 0.05)
    assert.equal(scheduled.length, 630);
  });

  test('前半（配列の前半分）には再出題が出現しない', () => {
    const main = makeMainTrials(200);
    const scheduled = scheduleTrials(main, mulberry32(2), 0.05);
    const mid = Math.floor(200 / 2);
    const front = scheduled.slice(0, mid);
    assert.ok(front.every((t) => t.source !== 'repeat'));
  });

  test('再出題は元trialIdを repeatOf として正しく参照する', () => {
    const main = makeMainTrials(100);
    const scheduled = scheduleTrials(main, mulberry32(3), 0.05);
    const byId = new Map(scheduled.map((t) => [t.trialId, t]));
    const repeats = scheduled.filter((t) => t.source === 'repeat');
    assert.ok(repeats.length > 0);
    for (const r of repeats) {
      assert.ok(byId.has(r.repeatOf), 'repeatOf ' + r.repeatOf + ' が見つからない');
      const original = byId.get(r.repeatOf);
      assert.equal(original.queryRecordId, r.queryRecordId);
      assert.equal(original.candidateRecordId, r.candidateRecordId);
    }
  });

  test('同じseedなら同じスケジュールが再現される', () => {
    const main = makeMainTrials(100);
    const a = scheduleTrials(main, mulberry32(77), 0.05);
    const b = scheduleTrials(main, mulberry32(77), 0.05);
    assert.deepEqual(a.map((t) => t.trialId), b.map((t) => t.trialId));
  });

  test('全ての元trialは最終スケジュールに(前半+後半どこかで)必ず1回は含まれる', () => {
    const main = makeMainTrials(50);
    const scheduled = scheduleTrials(main, mulberry32(4), 0.05);
    const nonRepeatIds = scheduled.filter((t) => t.source !== 'repeat').map((t) => t.trialId);
    assert.deepEqual(new Set(nonRepeatIds), new Set(main.map((t) => t.trialId)));
  });
});

describe('groupByQuery', () => {
  test('queryRecordIdごとにグルーピングする', () => {
    const trials = [
      { queryRecordId: 'q1', candidateRecordId: 'a' },
      { queryRecordId: 'q2', candidateRecordId: 'b' },
      { queryRecordId: 'q1', candidateRecordId: 'c' }
    ];
    const grouped = groupByQuery(trials);
    assert.equal(grouped.get('q1').length, 2);
    assert.equal(grouped.get('q2').length, 1);
  });
});

describe('precisionAtK', () => {
  const trials = [
    // q1: rank1=o, rank2=x, rank3=o -> P@1=1, P@3=2/3
    { queryRecordId: 'q1', source: 'system', rank: 1, judgment: 'o' },
    { queryRecordId: 'q1', source: 'system', rank: 2, judgment: 'x' },
    { queryRecordId: 'q1', source: 'system', rank: 3, judgment: 'o' },
    // q2: rank1=x, rank2=skip, rank3=x -> P@1=0, P@3 (skip除外)=0/2=0
    { queryRecordId: 'q2', source: 'system', rank: 1, judgment: 'x' },
    { queryRecordId: 'q2', source: 'system', rank: 2, judgment: 'skip' },
    { queryRecordId: 'q2', source: 'system', rank: 3, judgment: 'x' },
    // random候補は除外されるべき
    { queryRecordId: 'q1', source: 'random', rank: null, judgment: 'o' }
  ];

  test('Precision@1はクエリ単位平均', () => {
    const result = precisionAtK(trials, 1);
    assert.equal(result.value, 0.5); // (1 + 0) / 2
  });

  test('Precision@3は？を分母から除外して計算', () => {
    const result = precisionAtK(trials, 3);
    // q1: 2/3, q2: 0/2 (skip除外) -> average = (2/3 + 0) / 2 = 1/3
    assert.ok(Math.abs(result.value - (2 / 3 + 0) / 2) < 1e-9);
  });

  test('系統候補が無いクエリ・全skipのkはperQueryから除外', () => {
    const onlySkip = [
      { queryRecordId: 'q3', source: 'system', rank: 1, judgment: 'skip' }
    ];
    const result = precisionAtK(onlySkip, 1);
    assert.equal(result.value, null);
    assert.equal(result.perQuery.length, 0);
  });
});

describe('usefulnessAt5', () => {
  test('上位5件に○が1つでもあればuseful', () => {
    const trials = [
      { queryRecordId: 'q1', source: 'system', rank: 1, judgment: 'x' },
      { queryRecordId: 'q1', source: 'system', rank: 2, judgment: 'o' },
      { queryRecordId: 'q1', source: 'system', rank: 6, judgment: 'o' }, // rank>5は無視
      { queryRecordId: 'q2', source: 'system', rank: 1, judgment: 'x' },
      { queryRecordId: 'q2', source: 'system', rank: 2, judgment: 'x' }
    ];
    const result = usefulnessAt5(trials);
    assert.equal(result.value, 0.5); // q1=useful, q2=not useful
  });

  test('全てskipの場合はuseful=falseとしてそのまま集計する', () => {
    const trials = [
      { queryRecordId: 'q1', source: 'system', rank: 1, judgment: 'skip' },
      { queryRecordId: 'q1', source: 'system', rank: 2, judgment: 'skip' }
    ];
    const result = usefulnessAt5(trials);
    assert.equal(result.value, 0);
    assert.equal(result.perQuery.length, 1);
  });
});

describe('randomBaselineRate', () => {
  test('ランダム候補の○率を計算する（skip除外）', () => {
    const trials = [
      { source: 'random', judgment: 'o' },
      { source: 'random', judgment: 'x' },
      { source: 'random', judgment: 'x' },
      { source: 'random', judgment: 'skip' },
      { source: 'system', judgment: 'o' } // 無視されるべき
    ];
    const result = randomBaselineRate(trials);
    assert.equal(result.n, 3);
    assert.ok(Math.abs(result.value - 1 / 3) < 1e-9);
  });
});

describe('repeatConsistency', () => {
  test('再出題と元trialの判定一致率を計算する', () => {
    const trials = [
      { trialId: 't1', source: 'system', judgment: 'o' },
      { trialId: 't1-repeat', source: 'repeat', repeatOf: 't1', judgment: 'o' }, // 一致
      { trialId: 't2', source: 'system', judgment: 'x' },
      { trialId: 't2-repeat', source: 'repeat', repeatOf: 't2', judgment: 'o' }, // 不一致
      { trialId: 't3', source: 'system', judgment: 'skip' },
      { trialId: 't3-repeat', source: 'repeat', repeatOf: 't3', judgment: 'o' } // skipなので比較対象外
    ];
    const result = repeatConsistency(trials);
    assert.equal(result.n, 2);
    assert.equal(result.value, 0.5);
  });
});

describe('interRaterAgreement', () => {
  test('複数判定者の一致率を計算する', () => {
    const entries = [
      { trialId: 't1', judgments: [{ judgerName: 'A', judgment: 'o' }, { judgerName: 'B', judgment: 'o' }] },
      { trialId: 't2', judgments: [{ judgerName: 'A', judgment: 'o' }, { judgerName: 'B', judgment: 'x' }] },
      { trialId: 't3', judgments: [{ judgerName: 'A', judgment: 'skip' }, { judgerName: 'B', judgment: 'o' }] } // skipは無視 → 比較対象外
    ];
    const result = interRaterAgreement(entries);
    assert.equal(result.n, 2);
    assert.equal(result.value, 0.5);
  });
});

describe('bootstrapMeanCI', () => {
  test('同じseedなら同じ結果が再現される', () => {
    const values = [1, 1, 0, 1, 0, 1, 1, 0, 1, 1];
    const a = bootstrapMeanCI(values, mulberry32(2026), 500);
    const b = bootstrapMeanCI(values, mulberry32(2026), 500);
    assert.deepEqual(a, b);
  });

  test('信頼区間はlower<=upperで、サンプル平均を概ね挟む', () => {
    const values = [1, 1, 1, 1, 0, 1, 1, 1, 0, 1];
    const ci = bootstrapMeanCI(values, mulberry32(1), 1000);
    assert.ok(ci.lower <= ci.upper);
    assert.ok(ci.lower >= 0 && ci.upper <= 1);
  });

  test('空配列はn:0でlower/upperがnull', () => {
    const ci = bootstrapMeanCI([], mulberry32(1));
    assert.equal(ci.n, 0);
    assert.equal(ci.lower, null);
  });
});

describe('toCsv', () => {
  test('行オブジェクト配列をCSV文字列に変換する', () => {
    const rows = [
      { a: 1, b: 'x' },
      { a: 2, b: 'y,z' }
    ];
    const csv = toCsv(rows);
    const lines = csv.split('\n');
    assert.equal(lines[0], 'a,b');
    assert.equal(lines[1], '1,x');
    assert.equal(lines[2], '2,"y,z"');
  });

  test('空配列は空文字を返す', () => {
    assert.equal(toCsv([]), '');
  });

  test('カンマ・改行・引用符を含む値はエスケープされる', () => {
    const csv = toCsv([{ v: 'has "quote" and\nnewline' }]);
    assert.ok(csv.includes('"has ""quote"" and\nnewline"'));
  });
});
