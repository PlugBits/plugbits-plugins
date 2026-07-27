// 一括再インデックス（scripts/bulk-reindex-lib.js）の純粋ロジックに対するユニットテスト。
// kintone REST・drawing-similarity API・ファイルIOは一切行わない
// （bulk-reindex-lib.js 自体がそれらに依存しない設計のため）。
//
//   node --test test/bulk-reindex.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  KNOWN_FIELD_MAP_KEYS,
  validateFieldMap,
  fieldMapToKintoneFields,
  pickFirstAttachment,
  extractRecordFieldValue,
  buildIndexMeta,
  parseProgressLog,
  shouldSkipRecord,
  formatProgressLine,
  computeRetryDelayMs,
  estimateEta,
  formatDurationMs,
  runWithConcurrency
} from '../scripts/bulk-reindex-lib.js';

describe('validateFieldMap', () => {
  test('必須キー(pdfFileField)が揃っていればok:true', () => {
    const result = validateFieldMap({ pdfFileField: 'attachment' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  test('pdfFileFieldが無ければエラー', () => {
    const result = validateFieldMap({ drawingNoField: 'dno' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('pdfFileField')));
  });

  test('JSONオブジェクトでなければエラー', () => {
    assert.equal(validateFieldMap(null).ok, false);
    assert.equal(validateFieldMap('foo').ok, false);
    assert.equal(validateFieldMap(['a']).ok, false);
  });

  test('既知キーの値が空文字/非文字列ならエラー', () => {
    const result = validateFieldMap({ pdfFileField: 'attachment', drawingNoField: '' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('drawingNoField')));

    const result2 = validateFieldMap({ pdfFileField: 'attachment', materialField: 123 });
    assert.equal(result2.ok, false);
  });

  test('未知キーはエラーにせず警告のみ', () => {
    const result = validateFieldMap({ pdfFileField: 'attachment', unknownField: 'x' });
    assert.equal(result.ok, true);
    assert.ok(result.warnings.some((w) => w.includes('unknownField')));
  });

  test('全既知キーを指定しても通る', () => {
    const fieldMap = {};
    for (const key of Object.keys(KNOWN_FIELD_MAP_KEYS)) {
      fieldMap[key] = key + '_code';
    }
    const result = validateFieldMap(fieldMap);
    assert.equal(result.ok, true);
    assert.deepEqual(result.warnings, []);
  });
});

describe('fieldMapToKintoneFields', () => {
  test('$idと指定されたフィールドコードを重複なく返す', () => {
    const fields = fieldMapToKintoneFields({
      pdfFileField: 'attachment',
      drawingNoField: 'dno',
      productNameField: 'dno' // 重複するコードを指定してもSetで一意化される
    });
    assert.ok(fields.includes('$id'));
    assert.ok(fields.includes('attachment'));
    assert.ok(fields.includes('dno'));
    assert.equal(fields.filter((f) => f === 'dno').length, 1);
  });

  test('field-mapが空でも$idだけは返す', () => {
    assert.deepEqual(fieldMapToKintoneFields({}), ['$id']);
  });
});

describe('pickFirstAttachment', () => {
  const attachmentField = 'attachment';

  test('PDF/TIFの最初のファイルを返す（Excelが先頭でもスキップ）', () => {
    const record = {
      [attachmentField]: {
        value: [
          { name: 'spec.xlsx', fileKey: 'key-xlsx' },
          { name: 'drawing.pdf', fileKey: 'key-pdf' },
          { name: 'photo.tif', fileKey: 'key-tif' }
        ]
      }
    };
    const result = pickFirstAttachment(record, attachmentField);
    assert.equal(result.fileKey, 'key-pdf');
  });

  test('PDF/TIFが無ければnull', () => {
    const record = { [attachmentField]: { value: [{ name: 'spec.xlsx', fileKey: 'key-xlsx' }] } };
    assert.equal(pickFirstAttachment(record, attachmentField), null);
  });

  test('添付が空配列/未定義ならnull', () => {
    assert.equal(pickFirstAttachment({ [attachmentField]: { value: [] } }, attachmentField), null);
    assert.equal(pickFirstAttachment({}, attachmentField), null);
    assert.equal(pickFirstAttachment(null, attachmentField), null);
  });

  test('大文字拡張子や.tiffも一致する', () => {
    const record = { [attachmentField]: { value: [{ name: 'DRAWING.TIFF', fileKey: 'key1' }] } };
    assert.equal(pickFirstAttachment(record, attachmentField).fileKey, 'key1');
  });
});

describe('extractRecordFieldValue', () => {
  test('通常フィールドは文字列化して返す', () => {
    const record = { material: { value: 'SUS304' } };
    assert.equal(extractRecordFieldValue(record, 'material'), 'SUS304');
  });

  test('配列値(チェックボックス等)はカンマ結合', () => {
    const record = { tags: { value: ['a', 'b', ''] } };
    assert.equal(extractRecordFieldValue(record, 'tags'), 'a,b');
  });

  test('フィールドコード未指定・フィールド無しは空文字', () => {
    assert.equal(extractRecordFieldValue({ x: { value: '1' } }, ''), '');
    assert.equal(extractRecordFieldValue({}, 'missing'), '');
  });
});

describe('buildIndexMeta', () => {
  const fieldMap = {
    drawingNoField: 'dno',
    productNameField: 'pname',
    materialField: 'material',
    dimensionField: 'dim',
    processField: 'process',
    tagField: 'tag',
    shapeTagField: 'shapeTag',
    pdfFileField: 'attachment'
  };
  const record = {
    dno: { value: 'K2054-0568K' },
    pname: { value: 'STAY' },
    material: { value: 'SUS304' },
    dim: { value: 't1.6' },
    process: { value: '溶接' },
    tag: { value: 'ブラケット' },
    shapeTag: { value: 'L字' }
  };
  const file = { fileKey: 'abc123', name: 'drawing.pdf' };

  test('プラグインと同形式のメタデータを組み立てる（shapeTagsは含めない）', () => {
    const meta = buildIndexMeta({ appId: '10', recordId: '999', tenantId: 'acme', record, fieldMap, file });
    assert.deepEqual(meta, {
      recordId: '999',
      tenantId: 'acme',
      appId: '10',
      drawingNo: 'K2054-0568K',
      productName: 'STAY',
      material: 'SUS304',
      dimension: 't1.6',
      processes: '溶接',
      tags: 'ブラケット',
      fileKey: 'abc123',
      fileName: 'drawing.pdf'
    });
    assert.equal('shapeTags' in meta, false);
  });

  test('thumbKeyが渡されたときだけmeta.thumbKeyを含める', () => {
    const withKey = buildIndexMeta({ appId: '10', recordId: '1', tenantId: 'default', record, fieldMap, file, thumbKey: 'base64key==' });
    assert.equal(withKey.thumbKey, 'base64key==');

    const withoutKey = buildIndexMeta({ appId: '10', recordId: '1', tenantId: 'default', record, fieldMap, file });
    assert.equal('thumbKey' in withoutKey, false);
  });

  test('tenantId省略時はdefault', () => {
    const meta = buildIndexMeta({ appId: '1', recordId: '1', record: {}, fieldMap: {}, file });
    assert.equal(meta.tenantId, 'default');
  });
});

describe('進捗ファイル(JSONL)のパース・スキップ判定', () => {
  test('parseProgressLog: 正常な行をrecordId->エントリのMapにする', () => {
    const text = [
      JSON.stringify({ recordId: '1', status: 'success', at: '2026-01-01T00:00:00Z' }),
      JSON.stringify({ recordId: '2', status: 'failed', at: '2026-01-01T00:00:01Z', error: 'boom' })
    ].join('\n');
    const map = parseProgressLog(text);
    assert.equal(map.size, 2);
    assert.equal(map.get('1').status, 'success');
    assert.equal(map.get('2').error, 'boom');
  });

  test('parseProgressLog: 同じrecordIdは後勝ち', () => {
    const text = [
      JSON.stringify({ recordId: '1', status: 'failed', at: 't1' }),
      JSON.stringify({ recordId: '1', status: 'success', at: 't2' })
    ].join('\n');
    const map = parseProgressLog(text);
    assert.equal(map.get('1').status, 'success');
  });

  test('parseProgressLog: 壊れた行・空行は無視する', () => {
    const text = '\n{not valid json}\n' + JSON.stringify({ recordId: '3', status: 'success' }) + '\n\n';
    const map = parseProgressLog(text);
    assert.equal(map.size, 1);
    assert.ok(map.has('3'));
  });

  test('parseProgressLog: 空文字/undefinedは空のMap', () => {
    assert.equal(parseProgressLog('').size, 0);
    assert.equal(parseProgressLog(undefined).size, 0);
  });

  test('shouldSkipRecord: successはスキップ、failedは再試行', () => {
    const map = parseProgressLog([
      JSON.stringify({ recordId: '1', status: 'success' }),
      JSON.stringify({ recordId: '2', status: 'failed' }),
      JSON.stringify({ recordId: '3', status: 'skipped' })
    ].join('\n'));
    assert.equal(shouldSkipRecord(map, '1', false), true);
    assert.equal(shouldSkipRecord(map, '2', false), false);
    assert.equal(shouldSkipRecord(map, '3', false), true);
    assert.equal(shouldSkipRecord(map, '999', false), false);
  });

  test('shouldSkipRecord: --forceのときは常にfalse', () => {
    const map = parseProgressLog(JSON.stringify({ recordId: '1', status: 'success' }));
    assert.equal(shouldSkipRecord(map, '1', true), false);
  });

  test('formatProgressLine: JSON文字列+改行を返す', () => {
    const line = formatProgressLine({ recordId: '1', status: 'success', at: 't1' });
    assert.equal(line.endsWith('\n'), true);
    assert.deepEqual(JSON.parse(line.trim()), { recordId: '1', status: 'success', at: 't1' });
  });
});

describe('computeRetryDelayMs', () => {
  test('試行回数が増えるほど基準遅延が指数的に伸びる（ジッタなし=randomFn固定0.5）', () => {
    const fixed = () => 0.5; // jitterFactor = 1 のとき exp のまま
    const d1 = computeRetryDelayMs(1, { baseMs: 1000, maxMs: 100000, randomFn: fixed });
    const d2 = computeRetryDelayMs(2, { baseMs: 1000, maxMs: 100000, randomFn: fixed });
    const d3 = computeRetryDelayMs(3, { baseMs: 1000, maxMs: 100000, randomFn: fixed });
    assert.equal(d1, 1000);
    assert.equal(d2, 2000);
    assert.equal(d3, 4000);
  });

  test('maxMsで頭打ちになる', () => {
    const fixed = () => 0.5;
    const d = computeRetryDelayMs(10, { baseMs: 1000, maxMs: 5000, randomFn: fixed });
    assert.equal(d, 5000);
  });

  test('ジッタは±25%の範囲に収まる', () => {
    for (let i = 0; i < 50; i += 1) {
      const d = computeRetryDelayMs(1, { baseMs: 1000, maxMs: 100000 });
      assert.ok(d >= 750 && d <= 1250, 'out of range: ' + d);
    }
  });

  test('負値にはならない', () => {
    const d = computeRetryDelayMs(1, { baseMs: 1000, maxMs: 100000, randomFn: () => 0 });
    assert.ok(d >= 0);
  });
});

describe('estimateEta', () => {
  test('done=0のときはremainingMs/etaAtがnull', () => {
    const eta = estimateEta({ startedAt: 0, now: 1000, done: 0, total: 10 });
    assert.equal(eta.remainingMs, null);
    assert.equal(eta.etaAt, null);
    assert.equal(eta.elapsedMs, 1000);
  });

  test('進捗率から残り時間を線形推定する', () => {
    // 1000msで10件中2件完了 → 1件あたり500ms → 残り8件で4000ms
    const eta = estimateEta({ startedAt: 0, now: 1000, done: 2, total: 10 });
    assert.equal(eta.remainingMs, 4000);
    assert.equal(eta.etaAt, new Date(1000 + 4000).toISOString());
  });

  test('全件完了ならremainingMsは0', () => {
    const eta = estimateEta({ startedAt: 0, now: 1000, done: 10, total: 10 });
    assert.equal(eta.remainingMs, 0);
  });
});

describe('formatDurationMs', () => {
  test('秒のみ', () => {
    assert.equal(formatDurationMs(45000), '45秒');
  });
  test('分と秒', () => {
    assert.equal(formatDurationMs(125000), '2分5秒');
  });
  test('時・分・秒', () => {
    assert.equal(formatDurationMs(3661000), '1時間1分1秒');
  });
  test('0はゼロ秒として表示', () => {
    assert.equal(formatDurationMs(0), '0秒');
  });
  test('負値/非数は-', () => {
    assert.equal(formatDurationMs(-1), '-');
    assert.equal(formatDurationMs(NaN), '-');
  });
});

describe('runWithConcurrency', () => {
  test('全itemsが処理される（順序は問わない）', async () => {
    const items = [1, 2, 3, 4, 5];
    const processed = [];
    await runWithConcurrency(items, 2, async (item) => {
      processed.push(item);
    });
    assert.deepEqual(processed.slice().sort((a, b) => a - b), items);
  });

  test('同時実行数がconcurrencyを超えない', async () => {
    const items = Array.from({ length: 8 }, (_, i) => i);
    let active = 0;
    let maxActive = 0;
    const resolvers = [];
    const gate = () => new Promise((resolve) => resolvers.push(resolve));

    const runPromise = runWithConcurrency(items, 3, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gate();
      active -= 1;
    });

    // 3並行が出揃うまで待つ（マイクロタスクを数ターン回す）
    for (let i = 0; i < 10 && resolvers.length < 3; i += 1) {
      await Promise.resolve();
    }
    assert.equal(resolvers.length, 3);
    assert.equal(maxActive, 3);

    // すべて解放して完走させる
    while (resolvers.length) {
      resolvers.shift()();
      await Promise.resolve();
    }
    await runPromise;
  });

  test('concurrencyがitems件数より多くても問題ない', async () => {
    const items = [1, 2];
    const processed = [];
    await runWithConcurrency(items, 10, async (item) => {
      processed.push(item);
    });
    assert.equal(processed.length, 2);
  });

  test('items が空でも即座に完了する', async () => {
    let called = false;
    await runWithConcurrency([], 3, async () => { called = true; });
    assert.equal(called, false);
  });
});
