(() => {
  'use strict';

  // === 類似図面検索の使用ログ ===
  //
  // 目的: トライアル利用を「回数と採用率」で語れるようにする。1検索 = ログアプリ1レコード。
  // 検索実行時に logSearch でレコードを作成し、結果クリック（logClick）・フィードバック
  // （logFeedback）で同じレコードを更新する。
  //
  // 絶対条件（製品オーナー指定）:
  //   - 本体の邪魔を絶対にしない。全処理は fire-and-forget、失敗は console.warn で握りつぶし、
  //     ユーザーには何も見せない。検索・画面遷移を1msも遅らせない。
  //   - logAppId 未設定なら全メソッドno-op。権限不足でPOST/PUTが失敗しても本体は無傷。
  //   - 画像は記録しない。図番とスコアだけ。
  //   - 「検索したが1件も開かなかった」レコードが残ることが最重要データ
  //     （＝logSearchは常にレコードを作る。クリックが無ければ clicked_* が空のまま残る）。
  //
  // 使い方（呼び出し側は返り値のPromiseをawaitしない）:
  //   const logIdPromise = SearchLog.logSearch({ logAppId, queryAppId, queryRecordId,
  //     queryCode, results, elapsedMs });
  //   SearchLog.logClick(logIdPromise, code, rank);       // 同一検索で最初のクリックのみ記録
  //   SearchLog.logFeedback(logIdPromise, '役に立った');   // 上書き可
  //
  // logIdPromise の中身（{id, logAppId} または null）は呼び出し側は関知しない。
  // 同一検索から生まれた結果カードには、必ず同じ logIdPromise インスタンスを渡すこと
  // （logClick の「最初の1回のみ」判定は、この Promise オブジェクトの同一性で行っている）。

  // crypto.randomUUID非対応環境向けの簡易フォールバック。識別子としてのみ使うため暗号強度は不要。
  const uuid = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  // logAppId が空/0/未設定/数値でない場合は機能全体を無効化する。
  const isEnabled = (logAppId) => {
    const n = Number(logAppId);
    return Number.isFinite(n) && n > 0;
  };

  // 「同一検索で最初のクリックのみ記録」を、logIdPromise オブジェクトの同一性で判定する。
  // 検索のたびに新しい Promise インスタンスが生成されるため、再検索・別レコードでの検索を
  // すれば自動的にクリック済みフラグもリセットされる（このモジュールが個別に検索IDを
  // 管理する必要がない）。
  const clickedSearches = new WeakMap();

  const putRecord = (logAppId, fields) => kintone.api(
    kintone.api.url('/k/v1/record', true), 'POST', { app: Number(logAppId), record: fields }
  )
    .then((res) => res.id)
    .catch((e) => {
      console.warn('[SearchLog]', e);
      return null;
    });

  const updateRecord = (logAppId, id, fields) => {
    kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', { app: Number(logAppId), id, record: fields })
      .catch((e) => console.warn('[SearchLog]', e));
  };

  // /similar のレスポンス結果配列 → ログ用の上位10件サマリー（画像は含めない。図番とスコアのみ）。
  const buildResultsSummary = (results) => (Array.isArray(results) ? results : [])
    .slice(0, 10)
    .map((item, index) => ({
      code: item.drawingNo || item.archiveFileName || '',
      recordId: item.recordId || '',
      score: typeof item.score === 'number' ? item.score : Number(item.score || 0),
      rank: index + 1,
      docType: item.docType || 'kintone'
    }));

  // 検索実行時に呼ぶ。ログアプリにレコードをPOSTし、作成レコードidを解決するPromiseを返す。
  // 呼び出し側はこのPromiseをawaitせず、描画は即座に続けてよい（fire-and-forget）。
  // p: { logAppId, queryAppId, queryRecordId, queryCode, results, elapsedMs }
  const logSearch = (p) => {
    p = p || {};
    if (!isEnabled(p.logAppId)) {
      return Promise.resolve(null);
    }

    let userCode = '';
    try {
      const user = kintone.getLoginUser();
      userCode = (user && user.code) || '';
    } catch (e) {
      console.warn('[SearchLog]', e);
    }

    const results = Array.isArray(p.results) ? p.results : [];
    const topScore = results.length ? Number(results[0].score || 0) : 0;

    const fields = {
      search_id: { value: uuid() },
      searched_at: { value: new Date().toISOString() },
      user_code: { value: userCode },
      query_app_id: { value: String(p.queryAppId || '') },
      query_record_id: { value: p.queryRecordId ? String(p.queryRecordId) : '' },
      query_code: { value: p.queryCode || '' },
      result_count: { value: String(results.length) },
      top_score: { value: String(topScore) },
      results: { value: JSON.stringify(buildResultsSummary(results)) },
      elapsed_ms: { value: String(Math.round(p.elapsedMs || 0)) },
      feedback: { value: '未回答' }
    };

    const logAppId = p.logAppId;
    return putRecord(logAppId, fields).then((id) => (id ? { id, logAppId } : null));
  };

  // 検索結果クリック時に呼ぶ。同一検索（＝同じlogIdPromiseインスタンス）内では最初の1回のみ
  // 記録し、2回目以降はno-op。awaitせずに呼べる（内部でfire-and-forgetする）。
  // アーカイブ結果（kintoneリンクなし・プレビュー表示）も同じ関数でよい。
  // code: クリックした結果の図番（アーカイブは図番が無ければファイル名）。rank: 表示順1始まり。
  const logClick = (logIdPromise, code, rank) => {
    if (!logIdPromise || typeof logIdPromise.then !== 'function') return;
    if (clickedSearches.get(logIdPromise)) return;
    clickedSearches.set(logIdPromise, true);

    logIdPromise.then((resolved) => {
      if (!resolved || !resolved.id) return; // logAppId未設定 or 検索ログ作成失敗
      updateRecord(resolved.logAppId, resolved.id, {
        clicked_code: { value: code || '' },
        clicked_rank: { value: rank ? String(rank) : '' },
        clicked_at: { value: new Date().toISOString() }
      });
    }).catch((e) => console.warn('[SearchLog]', e));
  };

  // フィードバックボタン押下時に呼ぶ。feedbackは何度でも上書き可（クリック記録と違い1回制限なし）。
  // value: '役に立った' | '役に立たなかった'
  const logFeedback = (logIdPromise, value) => {
    if (!logIdPromise || typeof logIdPromise.then !== 'function') return;

    logIdPromise.then((resolved) => {
      if (!resolved || !resolved.id) return;
      updateRecord(resolved.logAppId, resolved.id, { feedback: { value: value || '' } });
    }).catch((e) => console.warn('[SearchLog]', e));
  };

  window.SearchLog = { logSearch, logClick, logFeedback };
})();
