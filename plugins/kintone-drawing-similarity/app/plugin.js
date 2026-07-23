(() => {
  'use strict';

  const PLUGIN_ID = kintone.$PLUGIN_ID;

  const normalizeBaseUrl = (value) => String(value || '').replace(/\/+$/, '');

  // kintoneのサブドメインをそのままテナントIDとして使う。保存値に頼るとドメインとズレる恐れがあるため毎回ここで算出する。
  const deriveTenantId = () => (window.location.hostname || '').split('.')[0] || 'default';

  const getFieldValue = (record, fieldCode) => {
    if (!fieldCode || !record[fieldCode]) {
      return '';
    }
    return record[fieldCode].value || '';
  };

  const getFirstFile = (record, fieldCode) => {
    const value = getFieldValue(record, fieldCode);
    if (!Array.isArray(value) || !value.length) {
      return null;
    }
    return value[0];
  };

  const formatVectorRaw = (value) => {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number.toFixed(4) : '-';
  };

  const formatPercent = (value) => Math.round(Number(value || 0) * 100) + '%';

  const buildRecordPayload = (event, config) => {
    const file = getFirstFile(event.record, config.pdfFileField);
    return {
      appId: kintone.app.getId(),
      recordId: event.recordId,
      tenantId: deriveTenantId(),
      drawingNo: getFieldValue(event.record, config.drawingNoField),
      productName: getFieldValue(event.record, config.productNameField),
      tags: getFieldValue(event.record, config.tagField),
      fileKey: file ? file.fileKey : '',
      fileName: file ? file.name : '',
      limit: 10
    };
  };

  // --- タグ機能 ---

  const parseTags = (value) => String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
  const stringifyTags = (tags) => tags.join(',');

  const apiKeyHeader = (key) => key ? { 'X-API-Key': key } : {};

  // 高速サムネイル（暗号化保存）が有効なテナントの復号鍵。無効・未生成なら空文字
  //（＝機能オフ。/index に thumbKey を同梱しない、/thumbs によるバッチ取得もしない）。
  const getThumbKey = (config) => (config && config.fastThumbs === 'true' && config.thumbEncKey) ? config.thumbEncKey : '';

  // --- ヘッダーボタン（アイコン付き・SaaS 風） ---
  const PB_ICONS = {
    search: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>',
    upload: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"></path><path d="m7 8 5-5 5 5"></path><path d="M5 21h14"></path></svg>',
    plus: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
    layers: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 9 5-9 5-9-5 9-5Z"></path><path d="m3 12 9 5 9-5"></path><path d="m3 17 9 5 9-5"></path></svg>',
    refresh: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v5h-5"></path></svg>',
    gear: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"></path></svg>'
  };

  // kintone標準の見た目に馴染む白基調ボタンに統一する（variantによる色分けは廃止）。
  // 呼び出し側のシグネチャは変えないため variant は受け取るが使用しない。
  const createHeaderButton = ({ id, label, variant: _variant = 'primary', icon }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    if (id) btn.id = id;
    btn.className = 'pb-header-btn';
    const iconSvg = icon && PB_ICONS[icon]
      ? '<span class="pb-btn-icon" aria-hidden="true">' + PB_ICONS[icon] + '</span>'
      : '';
    btn.innerHTML = iconSvg + '<span class="pb-btn-label">' + label + '</span>';
    return btn;
  };

  // 管理系アクションのドロップダウンメニュー。機能が増えてもヘッダーの
  // ボタンを増やさず、ここに項目を足すだけで済むようにする。
  const createManageMenu = (items) => {
    const wrap = document.createElement('div');
    wrap.className = 'pb-menu-wrap';
    const btn = createHeaderButton({ id: 'pb-manage-btn', label: '管理 ▾', variant: 'ghost', icon: 'gear' });
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');

    const menu = document.createElement('div');
    menu.className = 'pb-menu';
    menu.hidden = true;
    items.forEach(({ label, description, onClick }) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'pb-menu-item';
      const title = document.createElement('span');
      title.className = 'pb-menu-item-title';
      title.textContent = label;
      item.appendChild(title);
      if (description) {
        const desc = document.createElement('span');
        desc.className = 'pb-menu-item-desc';
        desc.textContent = description;
        item.appendChild(desc);
      }
      item.addEventListener('click', () => {
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        onClick();
      });
      menu.appendChild(item);
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      btn.setAttribute('aria-expanded', String(!menu.hidden));
    });
    document.addEventListener('click', () => {
      if (!menu.hidden) {
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    wrap.append(btn, menu);
    return wrap;
  };

  // --- エラーメッセージの日本語化 ---
  const describeApiError = (status, fallback) => {
    if (status === 401) return 'APIキーが正しくありません。プラグイン設定のAPI Keyを確認してください。';
    if (status === 403) return 'アクセスが拒否されました。プラグイン設定を確認してください。';
    if (status === 404) return 'APIが見つかりません。プラグイン設定のAPI Base URLを確認してください。';
    if (status === 0) return 'サーバーに接続できませんでした。ネットワークまたはAPI Base URLを確認してください。';
    if (status >= 500) return 'サーバーでエラーが発生しました。サーバー起動中の可能性があります。少し待ってから再試行してください。' + (fallback ? '\n詳細: ' + fallback : '');
    return fallback || ('エラーが発生しました (HTTP ' + status + ')');
  };

  // --- 画面上部中央に出す軽量トースト通知（window.alertの代替） ---
  // 同時に複数出さない：表示中に呼ばれたら要素を使い回し、文言を差し替えてタイマーを延長する。
  let pbToastEl = null;
  let pbToastTimer = null;
  const showPluginToast = (message, type = 'error') => {
    if (!pbToastEl) {
      pbToastEl = document.createElement('div');
      pbToastEl.id = 'pb-toast';
      document.body.appendChild(pbToastEl);
    }
    pbToastEl.className = 'pb-toast pb-toast-' + type;
    pbToastEl.textContent = message;
    // reflow を挟んでからshowを付けることで、既に表示中の場合でもフェードが自然に見える
    pbToastEl.classList.remove('show');
    void pbToastEl.offsetWidth;
    pbToastEl.classList.add('show');
    window.clearTimeout(pbToastTimer);
    pbToastTimer = setTimeout(() => {
      pbToastEl.classList.remove('show');
    }, 4500);
  };

  // /index へのバイナリ直送を XMLHttpRequest で行い、リクエストボディの送信完了
  // （アップロード完了）を検知する。fetch にはアップロード進捗・完了イベントが無いため、
  // beforeunload ガードを「送信中の1〜3秒」だけに限定する目的で XHR を使う。
  // リクエストボディ（PDF）がサーバーに届き切れば、応答（Qdrant書き込み込みで約14秒かかる
  // ことがある）をブラウザが待たなくてもサーバー側の登録処理は完了する。
  //
  // onUploadComplete はアップロード完了時に1回だけ呼ばれる（xhr.upload の load イベント。
  // 何らかの理由でそのイベントが発火しなかった場合の保険として xhr.onload でも呼ぶ）。
  // 通信エラー・タイムアウト時は呼ばない（ボディが実際に届いたかどうか保証できないため。
  // その場合でも reject 後に呼び出し側の fail() が最終的にガードを解除する＝取りこぼしはない）。
  const sendIndexBinary = (apiBaseUrl, apiKey, meta, blob, onUploadComplete) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiBaseUrl + '/index', true);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-Index-Meta', encodeURIComponent(JSON.stringify(meta)));
    if (apiKey) xhr.setRequestHeader('X-API-Key', apiKey);

    let uploadNotified = false;
    const notifyUploadComplete = () => {
      if (uploadNotified) return;
      uploadNotified = true;
      if (onUploadComplete) onUploadComplete();
    };
    xhr.upload.addEventListener('load', notifyUploadComplete);

    xhr.onload = () => {
      // 保険: 上の upload.load が何らかの理由で発火しなかった場合でも、応答が
      // 返ってきた時点で送信は確実に完了しているため、ここで必ず通知する。
      notifyUploadComplete();
      let data = {};
      try { data = JSON.parse(xhr.responseText || '{}') || {}; } catch (_) { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error(describeApiError(xhr.status, data.error)));
      }
    };
    xhr.onerror = () => reject(new Error(describeApiError(0)));
    xhr.ontimeout = () => reject(new Error(describeApiError(0)));
    xhr.send(blob);
  });

  // --- 経過時間に応じて進行メッセージを切り替える ---
  // phases: [{ at: 経過秒, text: 表示文言 }, ...]（at 昇順）
  const startProgressiveStatus = (update, phases) => {
    const startedAt = Date.now();
    update(phases[0].text);
    const timer = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      let current = phases[0].text;
      for (const phase of phases) {
        if (elapsed >= phase.at) current = phase.text;
      }
      update(current);
    }, 1000);
    return () => clearInterval(timer);
  };

  const SEARCH_PHASES = [
    { at: 0, text: '類似図面を検索しています...' },
    { at: 8, text: '検索処理を実行中です。しばらくお待ちください...' },
    { at: 20, text: 'サーバーを起動しています。初回は1分ほどかかることがあります...' },
    { at: 45, text: 'もう少しお待ちください...' }
  ];

  // === バックグラウンドの検索登録（/index、約14秒）中のアップロードガード ===
  // 新規/更新の kintone レコード保存はモーダル内で即完了させ、重い検索インデックス登録は
  // バックグラウンドで実行する。/index はリクエストボディ（PDF）がサーバーに届き切れば、
  // 応答（Qdrant書き込み込みで約14秒かかることがある）をブラウザが待たなくてもサーバー側の
  // 登録処理は完了する。そのため beforeunload で保護するのは「リクエストボディの送信中
  // （1〜3秒）」だけでよい。サーバー処理の成否はUIに出さない
  //（成功時は何もしない・失敗時は console.warn のみ）。強制終了・送信失敗時の保険は
  // 既存の「一括図面登録 → 未登録を登録」。
  let _uploadGuardCount = 0;
  const _beforeUnloadHandler = (e) => {
    e.preventDefault();
    e.returnValue = '';
    return '';
  };
  const _syncUploadGuard = () => {
    if (_uploadGuardCount > 0) {
      window.addEventListener('beforeunload', _beforeUnloadHandler);
    } else {
      window.removeEventListener('beforeunload', _beforeUnloadHandler);
    }
  };

  // モーダルclose時にリロードしたいが、アップロード中（ガード中）だった場合の持ち越しフラグ。
  // 即リロードすると送信中のリクエストが中断され未登録になりかねないため
  //（実際に発生した不具合）、ガードが外れた時点（＝送信完了、1〜3秒後）で自動的にリロードする。
  let _reloadRequestedAfterGuard = false;
  const requestReloadWhenIdle = () => {
    if (_uploadGuardCount > 0) {
      _reloadRequestedAfterGuard = true;
      return;
    }
    window.location.reload();
  };

  // 呼ぶとアップロード中カウントを1増やし beforeunload ガードを有効化する。
  // 戻り値 release() はリクエストボディの送信完了・送信失敗のどちらからでも呼べる
  // （冪等・複数回呼んでも1回分しか減らない）。カウントが0に戻った時点で
  // requestReloadWhenIdle() による持ち越しリロード要求があれば、ここで実行する。
  const beginUploadGuard = () => {
    _uploadGuardCount += 1;
    _syncUploadGuard();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      _uploadGuardCount = Math.max(0, _uploadGuardCount - 1);
      _syncUploadGuard();
      if (_uploadGuardCount === 0 && _reloadRequestedAfterGuard) {
        _reloadRequestedAfterGuard = false;
        window.location.reload();
      }
    };
  };

  // --- モーダルシェル（Shadow DOM / Esc・フォーカス・aria 対応） ---
  // options.onClose: モーダルを閉じた後に呼ばれるフック
  const createModalShell = (options = {}) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = REGISTER_CSS;

    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.tabIndex = -1;

    const xBtn = document.createElement('button');
    xBtn.className = 'btn-close';
    xBtn.type = 'button';
    xBtn.setAttribute('aria-label', '閉じる');
    xBtn.textContent = '×';

    const content = document.createElement('div');
    content.className = 'modal-content';

    modal.append(xBtn, content);
    overlay.appendChild(modal);
    shadow.append(style, overlay);

    const previousFocus = document.activeElement;
    // モーダル内で作った blob URL を追跡し、閉じるときにまとめて解放する
    //（kintone は SPA でページが長寿命のため、解放しないと数MB単位で蓄積する）
    const objectUrls = [];
    const trackObjectUrl = (blobUrl) => { objectUrls.push(blobUrl); return blobUrl; };
    const onKeydown = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    const closeModal = () => {
      document.removeEventListener('keydown', onKeydown, true);
      objectUrls.forEach((blobUrl) => { try { URL.revokeObjectURL(blobUrl); } catch (_) {} });
      host.remove();
      if (previousFocus && typeof previousFocus.focus === 'function') {
        try { previousFocus.focus(); } catch (_) {}
      }
      if (options.onClose) options.onClose();
    };
    document.addEventListener('keydown', onKeydown, true);
    xBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    setTimeout(() => modal.focus(), 0);

    return { host, shadow, overlay, modal, content, closeModal, trackObjectUrl };
  };

  // ファイル名（または File.name）拡張子でTIFかどうかを判定する。
  const isTiffFileName = (fileName) => /\.tiff?$/i.test(String(fileName || ''));

  // PDF/TIFプレビューパネル（モーダル左ペイン）の共通ヘルパー。
  // trackUrl に createModalShell の trackObjectUrl を渡すと close 時に blob URL を解放する。
  // options.apiBaseUrl / options.config はTIFプレビュー生成（/render-thumbnail呼び出し）に使う。
  // options.cacheKey はkintoneのfileKey等、内容に対して不変な識別子。渡された場合のみ
  // レンダリング結果をモジュールスコープのキャッシュに載せ、blob URLはtrackUrlではなく
  // キャッシュが所有する（渡さない場合＝ローカルのドラッグ&ドロップはキャッシュしない）。
  const buildPreviewPanel = (name, trackUrl, options = {}) => {
    const { apiBaseUrl, config, cacheKey } = options;
    const panel = document.createElement('div');
    panel.className = 'preview-panel';
    const label = document.createElement('div');
    label.className = 'preview-label';
    label.textContent = name || '';
    panel.appendChild(label);
    const placeholder = document.createElement('div');
    placeholder.className = 'preview-placeholder';
    placeholder.textContent = 'プレビューを読み込み中...';
    panel.appendChild(placeholder);

    const replacePlaceholderWith = (el) => {
      if (placeholder.parentNode === panel) {
        panel.replaceChild(el, placeholder);
      } else {
        panel.appendChild(el);
      }
    };

    const showMessage = (message) => { placeholder.textContent = message; };

    const showPdfEmbed = (blobOrFile) => {
      let blobUrl = URL.createObjectURL(blobOrFile);
      if (trackUrl) blobUrl = trackUrl(blobUrl);
      const embed = document.createElement('embed');
      embed.src = blobUrl;
      embed.type = 'application/pdf';
      embed.className = 'preview-embed';
      replacePlaceholderWith(embed);
    };

    // TIFはブラウザの<embed>で直接表示できないため、サーバーの/render-thumbnailで
    // PNGに変換してから<img>で表示する。マルチページTIFはサーバー側の既存仕様により
    // 1ページ目のみが対象（本プレビューも同様に1ページ目だけを表示する）。
    const showTiffPreview = async (blobOrFile) => {
      // cacheKeyがある場合（kintoneのfileKeyなど内容不変の識別子）は、同じ図面を
      // 開き直すたびにダウンロード・サーバー変換をやり直さずに済むようキャッシュを使う。
      const thumbCacheKey = cacheKey ? (cacheKey + ':1600') : null;
      const cachedUrl = thumbCacheKey ? getCachedThumbUrl(thumbCacheKey) : null;
      if (cachedUrl) {
        const cachedImg = document.createElement('img');
        cachedImg.className = 'preview-image';
        cachedImg.alt = name || '';
        cachedImg.src = cachedUrl;
        replacePlaceholderWith(cachedImg);
        return;
      }

      placeholder.textContent = 'プレビューを生成しています...';
      try {
        if (!apiBaseUrl) {
          throw new Error('apiBaseUrl not configured');
        }
        // バイナリ直送: base64化（+33%膨張）とJSON.stringifyの追加コピーを避ける
        // （/index と同じ方式）。max_width はJSONボディが無いためURLクエリで渡す。
        const res = await fetch(apiBaseUrl + '/render-thumbnail?max_width=1600', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', ...apiKeyHeader(config && config.apiKey) },
          body: blobOrFile
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        let blobUrl = URL.createObjectURL(await res.blob());
        // キャッシュする場合はキャッシュが所有するため、モーダルのtrackUrlには渡さない。
        // キャッシュしない場合（cacheKey無し＝ローカルのドラッグ&ドロップ）は従来通り追跡する。
        if (thumbCacheKey) {
          putCachedThumbUrl(thumbCacheKey, blobUrl);
        } else if (trackUrl) {
          blobUrl = trackUrl(blobUrl);
        }
        const img = document.createElement('img');
        img.className = 'preview-image';
        img.alt = name || '';
        img.src = blobUrl;
        replacePlaceholderWith(img);
      } catch {
        showMessage('プレビューを表示できません（TIF変換エラー）');
      }
    };

    const isTiffBlob = (blobOrFile) =>
      (blobOrFile && blobOrFile.type === 'image/tiff') ||
      isTiffFileName((blobOrFile && blobOrFile.name) || name);

    const showBlob = (blobOrFile) => {
      if (isTiffBlob(blobOrFile)) {
        showTiffPreview(blobOrFile);
      } else {
        showPdfEmbed(blobOrFile);
      }
    };
    return { panel, showBlob, showMessage };
  };

  // パネル幅比率の記憶（次回モーダルを開いたときに復元する）。
  const PANEL_RATIO_STORAGE_KEY = 'pb-drawing-sim-panel-ratio';
  const readStoredPanelRatio = () => {
    try {
      const raw = window.localStorage.getItem(PANEL_RATIO_STORAGE_KEY);
      const value = raw === null ? NaN : parseFloat(raw);
      return Number.isFinite(value) ? value : null;
    } catch (_) {
      return null;
    }
  };
  const writeStoredPanelRatio = (ratio) => {
    try { window.localStorage.setItem(PANEL_RATIO_STORAGE_KEY, String(ratio)); } catch (_) { /* プライベートモード等は無視 */ }
  };

  // preview-panel と form-panel の境界にドラッグ用のハンドルを挿入し、幅比率を可変にする。
  // PDFプレビューの<embed>の上をポインタが通るとdocument側のpointerup/moveが
  // 取りこぼされ「ドラッグ解除されない」不具合が起きるため、resizer自身に
  // setPointerCaptureしてイベントを固定する（要素をまたいでも確実に追従・解除できる）。
  // 直近の比率は localStorage に保存し、次回モーダルを開いたときに復元する。
  // ダブルクリックで既定比率（40:60）にリセット（保存値もクリア）。
  const attachPanelResizer = (layout, previewPanel, formPanel) => {
    const MIN_RATIO = 0.22;
    const MAX_RATIO = 0.78;
    let currentRatio = null;

    const applyRatio = (ratio) => {
      currentRatio = ratio;
      previewPanel.style.flex = '0 0 ' + (ratio * 100) + '%';
      formPanel.style.flex = '0 0 ' + ((1 - ratio) * 100) + '%';
    };

    const storedRatio = readStoredPanelRatio();
    if (storedRatio !== null && storedRatio >= MIN_RATIO && storedRatio <= MAX_RATIO) {
      applyRatio(storedRatio);
    }

    const resizer = document.createElement('div');
    resizer.className = 'panel-resizer';
    resizer.setAttribute('role', 'separator');
    resizer.setAttribute('aria-orientation', 'vertical');
    resizer.setAttribute('aria-label', 'パネル幅の調整');
    previewPanel.after(resizer);

    let dragging = false;
    const onPointerMove = (e) => {
      if (!dragging) return;
      const rect = layout.getBoundingClientRect();
      if (!rect.width) return;
      const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, (e.clientX - rect.left) / rect.width));
      applyRatio(ratio);
    };
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove('active');
      document.body.style.userSelect = '';
      window.removeEventListener('blur', endDrag);
      if (currentRatio !== null) writeStoredPanelRatio(currentRatio);
    };
    resizer.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      resizer.classList.add('active');
      document.body.style.userSelect = 'none';
      try { resizer.setPointerCapture(e.pointerId); } catch (_) { /* 未対応環境は無視 */ }
      window.addEventListener('blur', endDrag);
    });
    resizer.addEventListener('pointermove', onPointerMove);
    resizer.addEventListener('pointerup', endDrag);
    resizer.addEventListener('pointercancel', endDrag);
    resizer.addEventListener('lostpointercapture', endDrag);
    resizer.addEventListener('dblclick', () => {
      previewPanel.style.flex = '';
      formPanel.style.flex = '';
      currentRatio = null;
      try { window.localStorage.removeItem(PANEL_RATIO_STORAGE_KEY); } catch (_) { /* 無視 */ }
    });
    return resizer;
  };

  // --- 一致理由バッジ（サーバーの reasons を日本語ラベルに変換） ---
  const REASON_LABELS = {
    'drawingNo match': '図番一致',
    'productName match': '品名一致',
    'material match': '材質一致',
    'customer match': '客先一致',
    'revision match': '版数一致',
    'shape category match': '形状分類一致',
    'dimension match': '寸法一致',
    'dimension close': '寸法近似',
    'dimension roughly close': '寸法概ね近い',
    'profile similar': '外形近似',
    'outline similar': '輪郭近似',
    'edge similar': 'エッジ近似'
  };

  const buildReasonBadges = (reasons) => {
    if (!Array.isArray(reasons) || !reasons.length) return null;
    const labels = [];
    for (const reason of reasons) {
      if (REASON_LABELS[reason]) {
        labels.push(REASON_LABELS[reason]);
      } else if (reason.startsWith('tag:')) {
        labels.push('タグ一致: ' + reason.slice(4));
      } else if (reason.startsWith('shapeTag:')) {
        labels.push('AI形状タグ一致');
      }
      // 'ocr text available' 等の内部情報はバッジにしない
    }
    if (!labels.length) return null;
    const wrap = document.createElement('div');
    wrap.className = 'sim-reasons';
    [...new Set(labels)].slice(0, 6).forEach((label) => {
      const badge = document.createElement('span');
      badge.className = 'sim-reason';
      badge.textContent = label;
      wrap.appendChild(badge);
    });
    return wrap;
  };

  // --- スコア帯の色分けクラス ---
  const scoreBandClass = (score) => {
    const value = Number(score) || 0;
    if (value >= 0.8) return 'band-high';
    if (value >= 0.6) return 'band-mid';
    return 'band-low';
  };

  const isDebugEnabled = (config) => config && config.showDebugInfo === 'true';

  // 検索結果に表示する追加フィールド（resultDetailFields）のラベル解決に使う。
  // モーダル表示中は1回だけ取得すればよいので _tagsCache と同様にモジュールスコープでキャッシュする。
  let _fieldLabelsCache = null;

  let _tagsCache = null;
  const fetchTags = async (apiBaseUrl, tenantId, appId, apiKey) => {
    if (_tagsCache) {
      return _tagsCache;
    }
    try {
      const params = new URLSearchParams({ tenantId });
      if (appId) {
        params.set('appId', String(appId));
      }
      const res = await fetch(apiBaseUrl + '/tags?' + params, { headers: apiKeyHeader(apiKey) });
      const data = await res.json();
      _tagsCache = Array.isArray(data.tags) ? data.tags : [];
    } catch (_) {
      _tagsCache = [];
    }
    return _tagsCache;
  };

  const renderTagUi = (spaceEl, initialTags, initialAiTags, allTags, editable, onTagsChange) => {
    if (!spaceEl) {
      return;
    }
    spaceEl.innerHTML = '';

    let currentTags = [...initialTags];
    let currentAiTags = [...(initialAiTags || [])];

    const container = document.createElement('div');
    container.className = 'pb-tag-container';

    const chipsWrap = document.createElement('div');
    chipsWrap.className = 'pb-tag-chips';

    const notify = () => { if (onTagsChange) onTagsChange({ tags: currentTags, shapeTags: currentAiTags }); };

    const renderChips = () => {
      chipsWrap.innerHTML = '';
      if (!currentTags.length && !currentAiTags.length && !editable) {
        return;
      }
      currentTags.forEach((tag) => {
        const chip = document.createElement('span');
        chip.className = 'pb-tag-chip';
        chip.textContent = tag;
        if (editable) {
          const removeBtn = document.createElement('button');
          removeBtn.className = 'pb-tag-remove';
          removeBtn.type = 'button';
          removeBtn.setAttribute('aria-label', tag + ' を削除');
          removeBtn.textContent = '×';
          removeBtn.addEventListener('click', () => {
            currentTags = currentTags.filter((t) => t !== tag);
            renderChips();
            notify();
          });
          chip.appendChild(removeBtn);
        }
        chipsWrap.appendChild(chip);
      });
      currentAiTags.forEach((tag) => {
        const chip = document.createElement('span');
        chip.className = 'pb-tag-chip pb-tag-chip-ai';
        chip.textContent = tag;
        if (editable) {
          const removeBtn = document.createElement('button');
          removeBtn.className = 'pb-tag-remove';
          removeBtn.type = 'button';
          removeBtn.setAttribute('aria-label', tag + ' を削除');
          removeBtn.textContent = '×';
          removeBtn.addEventListener('click', () => {
            currentAiTags = currentAiTags.filter((t) => t !== tag);
            renderChips();
            notify();
          });
          chip.appendChild(removeBtn);
        }
        chipsWrap.appendChild(chip);
      });
    };

    renderChips();
    container.appendChild(chipsWrap);

    if (editable) {
      const inputWrap = document.createElement('div');
      inputWrap.className = 'pb-tag-input-wrap';

      const input = document.createElement('input');
      input.className = 'pb-tag-input';
      input.type = 'text';
      input.placeholder = 'タグを追加...';
      input.setAttribute('autocomplete', 'off');

      const dropdown = document.createElement('ul');
      dropdown.className = 'pb-tag-dropdown';
      dropdown.hidden = true;

      const showDropdown = (value) => {
        const q = value.trim().toLowerCase();
        const suggestions = allTags
          .filter((t) => !currentTags.includes(t) && (q === '' || t.toLowerCase().includes(q)))
          .slice(0, 8);

        dropdown.innerHTML = '';
        const items = [...suggestions];
        if (value.trim() && !allTags.some((t) => t.toLowerCase() === value.trim().toLowerCase())) {
          items.push('__new__:' + value.trim());
        }
        if (!items.length) {
          dropdown.hidden = true;
          return;
        }
        items.forEach((s) => {
          const isNew = s.startsWith('__new__:');
          const tagValue = isNew ? s.slice(8) : s;
          const li = document.createElement('li');
          li.className = 'pb-tag-dropdown-item' + (isNew ? ' pb-tag-new' : '');
          li.textContent = isNew ? '"' + tagValue + '" を追加' : tagValue;
          li.dataset.value = tagValue;
          dropdown.appendChild(li);
        });
        dropdown.hidden = false;
      };

      const addTag = (value) => {
        const tag = value.trim();
        if (!tag || currentTags.includes(tag)) {
          return;
        }
        currentTags = [...currentTags, tag];
        if (!allTags.includes(tag)) {
          allTags.push(tag);
        }
        renderChips();
        notify();
        input.value = '';
        dropdown.hidden = true;
      };

      input.addEventListener('focus', () => showDropdown(input.value));
      input.addEventListener('input', () => showDropdown(input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const active = dropdown.querySelector('.pb-tag-dropdown-item.active');
          if (active) {
            addTag(active.dataset.value);
          } else if (input.value.trim()) {
            addTag(input.value);
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const items = [...dropdown.querySelectorAll('.pb-tag-dropdown-item')];
          const idx = items.indexOf(dropdown.querySelector('.active'));
          items.forEach((el) => el.classList.remove('active'));
          if (items[idx + 1]) {
            items[idx + 1].classList.add('active');
          } else if (items[0]) {
            items[0].classList.add('active');
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const items = [...dropdown.querySelectorAll('.pb-tag-dropdown-item')];
          const idx = items.indexOf(dropdown.querySelector('.active'));
          items.forEach((el) => el.classList.remove('active'));
          if (items[idx - 1]) {
            items[idx - 1].classList.add('active');
          } else if (items[items.length - 1]) {
            items[items.length - 1].classList.add('active');
          }
        } else if (e.key === 'Escape') {
          dropdown.hidden = true;
        }
      });
      input.addEventListener('blur', () => {
        setTimeout(() => { dropdown.hidden = true; }, 150);
      });

      dropdown.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.pb-tag-dropdown-item');
        if (item) {
          e.preventDefault();
          addTag(item.dataset.value);
        }
      });

      inputWrap.append(input, dropdown);
      container.appendChild(inputWrap);
    }

    spaceEl.appendChild(container);
  };

  // レンダリング済みサムネイルのキャッシュ（キー: fileKey等 + ':' + 幅）。
  // kintoneのfileKeyは内容に対して不変なので、同じ図面を開き直すたびに
  // ダウンロード・サーバー変換をやり直す必要はない。上限を超えたら最も
  // 使われていないものから解放する（blob URLはキャッシュが所有し、モーダルの
  // trackObjectUrl による解放対象にはしない）。
  const THUMB_CACHE_MAX = 40;
  const _thumbCache = new Map();
  const getCachedThumbUrl = (key) => {
    if (!_thumbCache.has(key)) return null;
    const url = _thumbCache.get(key);
    // Mapの反復順=挿入順を使ってLRUを模倣するため、ヒット時は削除して
    // 末尾に付け直す（＝最近使用扱いにする）。
    _thumbCache.delete(key);
    _thumbCache.set(key, url);
    return url;
  };
  const putCachedThumbUrl = (key, blobUrl) => {
    _thumbCache.set(key, blobUrl);
    while (_thumbCache.size > THUMB_CACHE_MAX) {
      const oldestKey = _thumbCache.keys().next().value;
      const oldestUrl = _thumbCache.get(oldestKey);
      _thumbCache.delete(oldestKey);
      try { URL.revokeObjectURL(oldestUrl); } catch (_) { /* 無視 */ }
    }
  };

  // 高速サムネイル（暗号化保存）: recordId のキャッシュキー接頭辞。fileKeyベースの
  // 通常サムネイルキャッシュと同じ _thumbCache に同居させる（LRU上限も共有）。
  const THUMB_ENC_CACHE_PREFIX = 'thumbenc:';

  // 高速サムネイル: /thumbs で暗号化サムネイルをまとめて取得し、WebCrypto(AES-GCM)で
  // 復号してblob URLに変換する。recordId(文字列)→blobURL のMapを返す。
  // 取得・復号のどの失敗も静かに握りつぶし、そのrecordIdは結果に含めない
  // （呼び出し側は該当recordIdだけ従来の都度変換にフォールバックする）。
  // getThumbKey(config) が空（機能オフ・鍵未生成）なら、リクエストを一切発生させず
  // 空のMapを即座に返す。
  const fetchDecryptedThumbs = async (apiBaseUrl, config, recordIds) => {
    const result = new Map();
    const thumbKey = getThumbKey(config);
    const ids = Array.isArray(recordIds) ? recordIds.filter((id) => id !== undefined && id !== null && id !== '') : [];
    if (!thumbKey || !apiBaseUrl || !ids.length) {
      return result;
    }

    // キャッシュ済み（このセッションで既に復号済み）のrecordIdは/thumbsのリクエスト
    // から除外し、そのままMapに詰める。
    const idsToFetch = [];
    ids.forEach((recordId) => {
      const cachedUrl = getCachedThumbUrl(THUMB_ENC_CACHE_PREFIX + recordId);
      if (cachedUrl) {
        result.set(String(recordId), cachedUrl);
      } else {
        idsToFetch.push(String(recordId));
      }
    });
    if (!idsToFetch.length) {
      return result;
    }

    let cryptoKey;
    try {
      const keyBytes = Uint8Array.from(atob(thumbKey), (c) => c.charCodeAt(0));
      cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
    } catch {
      return result; // 鍵の形式が不正（想定外）。全件フォールバックさせる。
    }

    try {
      const res = await fetch(apiBaseUrl + '/thumbs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...apiKeyHeader(config.apiKey) },
        body: JSON.stringify({ tenantId: deriveTenantId(), recordIds: idsToFetch })
      });
      if (!res.ok) {
        return result;
      }
      const data = await res.json();
      const thumbs = Array.isArray(data.thumbs) ? data.thumbs : [];
      await Promise.all(thumbs.map(async (thumb) => {
        try {
          // 形式: base64( iv(12バイト) || ciphertext || authTag(16バイト) )。
          // WebCryptoのAES-GCM decryptは「ciphertext末尾にtagが連結された形」を
          // 期待するため、先頭12バイトをivとして分離し、残りをそのまま渡す。
          const combined = Uint8Array.from(atob(thumb.thumbEnc), (c) => c.charCodeAt(0));
          const iv = combined.slice(0, 12);
          const ciphertext = combined.slice(12);
          const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
          const blobUrl = URL.createObjectURL(new Blob([plainBuffer], { type: 'image/png' }));
          putCachedThumbUrl(THUMB_ENC_CACHE_PREFIX + thumb.recordId, blobUrl);
          result.set(String(thumb.recordId), blobUrl);
        } catch { /* この1件だけ復号失敗。呼び出し側で従来表示にフォールバックする */ }
      }));
    } catch { /* 通信失敗。全件フォールバックさせる */ }

    return result;
  };

  const THUMBNAIL_AUTO_COUNT = 3;

  // 一覧では上位3件だけ自動でサムネイルを取得し、残りはボタンを押したときだけ取得する。
  // サムネイルはブラウザのkintoneセッションでファイルを取得し、/render-thumbnail で
  // PNG化するだけでどこにも保存されない（kintoneが正本のまま）。サーバー側のkintone
  // 接続は不要（/thumbnail は旧プラグイン互換のため残るが、新プラグインは使わない）。
  // config: apiKeyHeader に渡すプラグイン設定。trackObjectUrl: 発行したblob URLを
  // モーダルclose時に解放するための追跡関数（呼び出し側は必ず渡すこと）。
  const loadThumbnail = async (thumbBox, apiBaseUrl, fileKey, config, trackObjectUrl) => {
    if (!apiBaseUrl || !fileKey) {
      thumbBox.textContent = '画像なし';
      return;
    }

    // レンダリング済みキャッシュがあれば、ダウンロード・変換を一切せず即表示する。
    const cacheKey = fileKey + ':default';
    const cachedUrl = getCachedThumbUrl(cacheKey);
    if (cachedUrl) {
      thumbBox.textContent = '';
      const cachedImg = document.createElement('img');
      cachedImg.className = 'sim-thumb-img';
      cachedImg.alt = '';
      cachedImg.src = cachedUrl;
      thumbBox.appendChild(cachedImg);
      return;
    }

    // 読み込み中はシマー（スケルトン）を表示し、失敗時は再取得ボタンを出す。
    thumbBox.textContent = '';
    const skeleton = document.createElement('div');
    skeleton.className = 'sim-skeleton';
    thumbBox.appendChild(skeleton);

    const showRetry = () => {
      thumbBox.textContent = '';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'sim-thumb-retry';
      retry.textContent = '再取得';
      retry.addEventListener('click', (e) => {
        e.stopPropagation();
        loadThumbnail(thumbBox, apiBaseUrl, fileKey, config, trackObjectUrl);
      });
      thumbBox.appendChild(retry);
    };

    let blobUrl;
    try {
      // バイナリ直送: base64化（+33%膨張）とJSON.stringifyの追加コピーを避ける
      // （/index と同じ方式）。レンダリング結果はキャッシュが所有するため、
      // モーダルのtrackObjectUrlには渡さない（閉じても再利用できるように残す）。
      const blob = await downloadKintoneFile(fileKey);
      const res = await fetch(apiBaseUrl + '/render-thumbnail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', ...apiKeyHeader(config && config.apiKey) },
        body: blob
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      blobUrl = URL.createObjectURL(await res.blob());
      putCachedThumbUrl(cacheKey, blobUrl);
    } catch {
      showRetry();
      return;
    }

    const img = document.createElement('img');
    img.className = 'sim-thumb-img';
    img.alt = '';
    img.addEventListener('load', () => {
      thumbBox.textContent = '';
      thumbBox.appendChild(img);
    }, { once: true });
    img.addEventListener('error', showRetry, { once: true });
    img.src = blobUrl;
  };

  // presetThumbUrl: 高速サムネイル（暗号化保存）で復号済みのblob URLがあれば渡す。
  // その場合はダウンロード・/render-thumbnail 変換を一切行わず、即座に表示する。
  const buildThumbnailBox = (apiBaseUrl, fileKey, autoLoad, config, trackObjectUrl, boxClassName, presetThumbUrl) => {
    const thumbBox = document.createElement('div');
    thumbBox.className = boxClassName || 'sim-thumb';

    if (presetThumbUrl) {
      const img = document.createElement('img');
      img.className = 'sim-thumb-img';
      img.alt = '';
      img.src = presetThumbUrl;
      thumbBox.appendChild(img);
      return thumbBox;
    }

    if (autoLoad) {
      loadThumbnail(thumbBox, apiBaseUrl, fileKey, config, trackObjectUrl);
      return thumbBox;
    }

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'sim-thumb-load';
    loadBtn.textContent = 'プレビュー取得';
    loadBtn.addEventListener('click', () => loadThumbnail(thumbBox, apiBaseUrl, fileKey, config, trackObjectUrl));
    thumbBox.appendChild(loadBtn);
    return thumbBox;
  };

  const clearPluginUi = () => {
    document.querySelectorAll('#pb-detail-btns, #pb-similarity-index, #pb-similarity-search').forEach((element) => {
      element.remove();
    });
  };

  // Dedicated handler: pre-fill fields from sessionStorage when redirected from the list-screen modal.
  // Uses event.record directly (kintone standard pattern) — kintone.app.record.get/set must not be
  // called during handler execution.
  kintone.events.on('app.record.create.show', (event) => {
    try {
      const raw = sessionStorage.getItem('pb_pending_registration');
      if (!raw) return event;
      const pending = JSON.parse(raw);
      if (pending.appId !== String(kintone.app.getId() || '')) return event;

      const config = kintone.plugin.app.getConfig(PLUGIN_ID);
      const rec = event.record;

      const setField = (code, value) => {
        if (code && rec[code] !== undefined) rec[code].value = value;
      };

      setField(config.drawingNoField, pending.drawingNo);
      setField(config.productNameField, pending.productName);
      setField(config.materialField, pending.material);
      setField(config.dimensionField, pending.dimension);
      setField(config.processField, pending.processes.join(','));
      setField(config.tagField, pending.tags.join(','));
      if (config.shapeTagField) setField(config.shapeTagField, pending.shapeTags.join(','));
      // FILE fields cannot be pre-filled via event.record on create.show — injected at submit instead.
    } catch (e) {
      console.warn('[pb] pending registration pre-fill error', e);
    }
    return event;
  });

  // Inject the pre-uploaded PDF fileKey at save time so it is included in the record creation POST.
  kintone.events.on(['app.record.edit.show', 'app.record.create.show'], async (event) => {
    const config = kintone.plugin.app.getConfig(PLUGIN_ID);
    if (!config.tagField || !config.tagSpaceId) {
      return event;
    }
    const spaceEl = kintone.app.record.getSpaceElement(config.tagSpaceId);
    if (!spaceEl) {
      return event;
    }
    kintone.app.record.setFieldShown(config.tagField, false);
    if (config.shapeTagField) {
      kintone.app.record.setFieldShown(config.shapeTagField, false);
    }

    // Read tag values: prefer sessionStorage pending data (already set in the dedicated handler above)
    let pendingTags = null;
    if (event.type === 'app.record.create.show') {
      try {
        const raw = sessionStorage.getItem('pb_pending_registration');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.appId === String(kintone.app.getId() || '')) {
            pendingTags = { tags: parsed.tags, shapeTags: parsed.shapeTags };
          }
        }
      } catch (_) {}
    }

    const apiBaseUrl = normalizeBaseUrl(config.apiBaseUrl);
    const tenantId = deriveTenantId();
    const appId = String(kintone.app.getId() || '');
    const currentTags = pendingTags ? pendingTags.tags : parseTags(getFieldValue(event.record, config.tagField));
    const currentAiTags = pendingTags ? pendingTags.shapeTags : (config.shapeTagField ? parseTags(getFieldValue(event.record, config.shapeTagField)) : []);
    const allTags = apiBaseUrl ? await fetchTags(apiBaseUrl, tenantId, appId, config.apiKey) : [];
    renderTagUi(spaceEl, currentTags, currentAiTags, allTags, true, ({ tags, shapeTags }) => {
      const obj = kintone.app.record.get();
      obj.record[config.tagField].value = stringifyTags(tags);
      if (config.shapeTagField) {
        obj.record[config.shapeTagField].value = stringifyTags(shapeTags);
      }
      kintone.app.record.set(obj);
    });
    return event;
  });

  kintone.events.on(['app.record.edit.submit.success', 'app.record.create.submit.success'], (event) => {
    const config = kintone.plugin.app.getConfig(PLUGIN_ID);
    const apiBaseUrl = normalizeBaseUrl(config.apiBaseUrl);
    if (!apiBaseUrl || !config.tagField) {
      return event;
    }
    const record = event.record;
    const recordId = record.$id ? String(record.$id.value) : null;
    if (!recordId) {
      return event;
    }
    const tags = stringifyTags(parseTags(getFieldValue(record, config.tagField)));
    const shapeTagsForSync = config.shapeTagField
      ? stringifyTags(parseTags(getFieldValue(record, config.shapeTagField)))
      : undefined;
    fetch(apiBaseUrl + '/tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...apiKeyHeader(config.apiKey) },
      body: JSON.stringify({
        tenantId: deriveTenantId(),
        appId: String(kintone.app.getId() || ''),
        recordId,
        tags,
        ...(shapeTagsForSync !== undefined ? { shapeTags: shapeTagsForSync } : {})
      })
    }).catch(() => {});

    // Attach pre-uploaded PDF and register similarity index after redirect-based new record creation
    if (event.type === 'app.record.create.submit.success') {
      try {
        const raw = sessionStorage.getItem('pb_pending_registration');
        if (raw) {
          const pending = JSON.parse(raw);
          if (pending.appId === String(kintone.app.getId() || '')) {
            sessionStorage.removeItem('pb_pending_registration');
            const doPostSave = async () => {
              // Attach the pre-uploaded PDF via REST API (event.record modification cannot set FILE fields)
              let permanentFileKey = pending.fileKey;
              let permanentFileName = pending.fileName;
              if (pending.fileKey && config.pdfFileField) {
                await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', {
                  app: pending.appId,
                  id: recordId,
                  record: { [config.pdfFileField]: { value: [{ fileKey: pending.fileKey }] } }
                });
                // The temporary fileKey is consumed on attachment — read back the permanent fileKey
                const updated = await kintone.api(kintone.api.url('/k/v1/record', true), 'GET', {
                  app: pending.appId,
                  id: recordId
                });
                const files = updated.record[config.pdfFileField] && updated.record[config.pdfFileField].value;
                if (files && files.length > 0) {
                  permanentFileKey = files[0].fileKey || permanentFileKey;
                  permanentFileName = files[0].name || permanentFileName;
                }
              }
              // 検索インデックス登録（/index、約14秒）はバックグラウンドで実行する。
              // ここでawaitすると保存後の画面遷移を長時間ブロックしてしまうため、待たずに
              // 送信する（kintoneは保存後に詳細画面へ遷移するが、SPAでページは破棄されない
              // ため送信はそのまま生存する）。
              // XHR（sendIndexBinary）でバイナリ直送し、アップロード完了（送信完了）を
              // 検知した時点で releaseGuard() を呼んで beforeunload ガードを解除する。
              // この画面遷移はすでにフルページ遷移そのもの（kintoneの保存後リダイレクト）だが、
              // 送信さえ終わっていれば以降のページ内操作（一覧⇄詳細の移動など）を妨げる必要はない。
              const releaseGuard = beginUploadGuard();
              (async () => {
                try {
                  const blob = permanentFileKey ? await downloadKintoneFile(permanentFileKey) : null;
                  const thumbKey = getThumbKey(config);
                  await sendIndexBinary(apiBaseUrl, config.apiKey, {
                    appId: pending.appId,
                    recordId,
                    tenantId: pending.tenantId,
                    drawingNo: pending.drawingNo,
                    productName: getFieldValue(record, config.productNameField) || pending.productName,
                    material: getFieldValue(record, config.materialField) || pending.material,
                    dimension: getFieldValue(record, config.dimensionField) || pending.dimension,
                    tags,
                    shapeTags: shapeTagsForSync || '',
                    fileKey: permanentFileKey,
                    fileName: permanentFileName,
                    limit: 10,
                    ...(thumbKey ? { thumbKey } : {})
                  }, blob, () => releaseGuard());
                } catch (error) {
                  // 送信失敗（ガード解除も含む）。保険は既存の「一括図面登録 → 未登録を登録」。
                  releaseGuard();
                  console.warn('[index] 検索登録に失敗: ' + error.message);
                }
              })();
              return event;
            };
            return doPostSave().catch(() => event);
          }
        }
      } catch (_) {}
    }

    return event;
  });

  // レコード削除時は検索インデックス（Qdrant ポイント）も削除する。
  // 放置すると、存在しないレコードへのリンクが検索結果に出続ける。
  kintone.events.on('app.record.detail.delete.submit', (event) => {
    const config = kintone.plugin.app.getConfig(PLUGIN_ID);
    const apiBaseUrl = normalizeBaseUrl(config.apiBaseUrl);
    if (!apiBaseUrl || !event.recordId) {
      return event;
    }
    // 削除後は画面遷移するため keepalive で送信を保証し、結果は待たない
    fetch(apiBaseUrl + '/delete', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...apiKeyHeader(config.apiKey) },
      body: JSON.stringify({
        appId: String(kintone.app.getId() || ''),
        recordId: String(event.recordId),
        tenantId: deriveTenantId()
      })
    }).catch(() => {});
    return event;
  });

  kintone.events.on('app.record.detail.show', (event) => {
    clearPluginUi();

    const config = kintone.plugin.app.getConfig(PLUGIN_ID);
    const apiBaseUrl = normalizeBaseUrl(config.apiBaseUrl);
    const header = kintone.app.record.getHeaderMenuSpaceElement();
    const group = document.createElement('div');
    group.id = 'pb-detail-btns';
    group.className = 'pb-btn-group';

    const button = createHeaderButton({ id: 'pb-similarity-search', label: '類似図面検索', variant: 'primary', icon: 'search' });
    const indexButton = createHeaderButton({ id: 'pb-similarity-index', label: '図面を登録/更新', variant: 'secondary', icon: 'refresh' });
    group.append(button, indexButton);
    header.appendChild(group);

    if (config.tagField && config.tagSpaceId) {
      kintone.app.record.setFieldShown(config.tagField, false);
      if (config.shapeTagField) {
        kintone.app.record.setFieldShown(config.shapeTagField, false);
      }
      const spaceEl = kintone.app.record.getSpaceElement(config.tagSpaceId);
      const tags = parseTags(getFieldValue(event.record, config.tagField));
      const aiTags = config.shapeTagField ? parseTags(getFieldValue(event.record, config.shapeTagField)) : [];
      renderTagUi(spaceEl, tags, aiTags, [], false, null);
    }

    indexButton.addEventListener('click', () => {
      if (!apiBaseUrl) {
        showPluginToast('プラグイン設定でAPI Base URLを設定してください。', 'error');
        return;
      }

      const fileMeta = getFirstFile(event.record, config.pdfFileField);
      openRegisterModal(config, apiBaseUrl, {
        recordId: event.recordId,
        fileMeta,
        recordValues: {
          drawingNo: getFieldValue(event.record, config.drawingNoField),
          productName: getFieldValue(event.record, config.productNameField),
          material: getFieldValue(event.record, config.materialField),
          dimension: getFieldValue(event.record, config.dimensionField),
          processes: parseTags(getFieldValue(event.record, config.processField)),
          tags: parseTags(getFieldValue(event.record, config.tagField)),
          shapeTags: config.shapeTagField ? parseTags(getFieldValue(event.record, config.shapeTagField)) : []
        }
      });
    });

    button.addEventListener('click', () => {
      if (!apiBaseUrl) {
        showPluginToast('プラグイン設定でAPI Base URLを設定してください。', 'error');
        return;
      }

      openSimilarModal(config, apiBaseUrl, event);
    });

    return event;
  });

  const createBulkModal = () => {
    const overlay = document.createElement('div');
    overlay.id = 'pb-bulk-overlay';
    overlay.className = 'pb-bulk-overlay';
    overlay.innerHTML = [
      '<div class="pb-bulk-modal">',
      '<h2 class="pb-bulk-title">一括図面登録</h2>',
      '<div class="pb-bulk-phase">準備中...</div>',
      '<div class="pb-bulk-bar-wrap"><div class="pb-bulk-bar-fill"></div></div>',
      '<div class="pb-bulk-counts">',
      '<span class="pb-bulk-total">合計 <b>-</b></span>',
      '<span class="pb-bulk-success">成功 <b>0</b></span>',
      '<span class="pb-bulk-skip">スキップ <b>0</b></span>',
      '<span class="pb-bulk-fail">失敗 <b>0</b></span>',
      '</div>',
      '<ul class="pb-bulk-errors"></ul>',
      '<div class="pb-bulk-actions">',
      '<button class="pb-bulk-cancel pb-similarity-button secondary" type="button">キャンセル</button>',
      '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);
    return overlay;
  };

  const updateBulkModal = (overlay, state) => {
    const phaseEl = overlay.querySelector('.pb-bulk-phase');
    const fill = overlay.querySelector('.pb-bulk-bar-fill');
    const cancelBtn = overlay.querySelector('.pb-bulk-cancel');

    if (state.phase === 'fetch') {
      phaseEl.textContent = 'レコード取得中...' + (state.fetched > 0 ? ' ' + state.fetched + '件取得済み' : '');
      fill.style.width = '5%';
    } else if (state.phase === 'process') {
      phaseEl.textContent = '登録処理中... ' + state.processed + ' / ' + state.total + ' 件';
      fill.style.width = state.total > 0
        ? (10 + Math.round(state.processed / state.total * 88)) + '%'
        : '10%';
    } else if (state.phase === 'done') {
      phaseEl.textContent = '完了しました。';
      fill.style.width = '100%';
    } else if (state.phase === 'cancelled') {
      phaseEl.textContent = 'キャンセルしました。';
    } else if (state.phase === 'error') {
      phaseEl.textContent = 'エラー: ' + (state.errorMessage || '不明なエラー');
    }

    const isDone = state.phase === 'done' || state.phase === 'cancelled' || state.phase === 'error';
    cancelBtn.textContent = isDone ? '閉じる' : 'キャンセル';

    overlay.querySelector('.pb-bulk-total b').textContent = state.total > 0 ? state.total + '件' : '-';
    overlay.querySelector('.pb-bulk-success b').textContent = state.success;
    overlay.querySelector('.pb-bulk-skip b').textContent = state.skip;
    overlay.querySelector('.pb-bulk-fail b').textContent = state.fail;

    const errorsList = overlay.querySelector('.pb-bulk-errors');
    errorsList.textContent = '';
    (state.errors || []).slice(-10).forEach((entry) => {
      const li = document.createElement('li');
      li.className = 'pb-bulk-error-item';
      li.textContent = 'record ' + entry.recordId + ': ' + entry.message;
      errorsList.appendChild(li);
    });
  };

  const fetchAllRecords = async (appId, fields, onFetch, cancel) => {
    const cursorRes = await kintone.api(
      kintone.api.url('/k/v1/records/cursor', true),
      'POST',
      { app: appId, fields, size: 100 }
    );
    const cursorId = cursorRes.id;
    const total = Number(cursorRes.totalCount || 0);
    const records = [];

    try {
      while (true) {
        if (cancel.requested) {
          break;
        }
        const page = await kintone.api(
          kintone.api.url('/k/v1/records/cursor', true),
          'GET',
          { id: cursorId }
        );
        records.push(...page.records);
        if (onFetch) {
          onFetch(records.length, total);
        }
        if (!page.next) {
          break;
        }
      }
    } finally {
      if (cancel.requested) {
        try {
          await kintone.api(
            kintone.api.url('/k/v1/records/cursor', true),
            'DELETE',
            { id: cursorId }
          );
        } catch {}
      }
    }

    return { records, total };
  };

  // 一括登録（初回大量登録）の並列度。Cloud Runが自動スケールするため多重化で
  // 初回大量登録の所要時間を短縮する。上げすぎるとkintoneのファイルAPI負荷が増えるため3に抑える。
  const BULK_INDEX_CONCURRENCY = 3;

  // options.onlyRecordIds: 指定した recordId のみ処理（未登録のみ登録などに使用）
  const runBulkIndex = async (overlay, config, apiBaseUrl, options = {}) => {
    const cancel = { requested: false };
    const state = {
      phase: 'fetch',
      total: 0,
      fetched: 0,
      processed: 0,
      success: 0,
      skip: 0,
      fail: 0,
      errors: []
    };

    overlay.querySelector('.pb-bulk-cancel').addEventListener('click', () => {
      const isDone = state.phase === 'done' || state.phase === 'cancelled' || state.phase === 'error';
      if (isDone) {
        overlay.remove();
        return;
      }
      cancel.requested = true;
    });

    updateBulkModal(overlay, state);

    const appId = kintone.app.getId();
    const fields = ['$id'];
    if (config.pdfFileField) {
      fields.push(config.pdfFileField);
    }
    if (config.drawingNoField) {
      fields.push(config.drawingNoField);
    }
    if (config.productNameField) {
      fields.push(config.productNameField);
    }
    if (config.tagField) {
      fields.push(config.tagField);
    }

    let records;
    try {
      const result = await fetchAllRecords(
        appId,
        fields,
        (fetched, total) => {
          state.fetched = fetched;
          state.total = total;
          updateBulkModal(overlay, state);
        },
        cancel
      );
      records = result.records;
      state.total = result.total;
      if (options.onlyRecordIds) {
        records = records.filter((record) => options.onlyRecordIds.has(String(record['$id'].value)));
        state.total = records.length;
      }
    } catch (error) {
      state.phase = 'error';
      state.errorMessage = error.message || 'レコード取得に失敗しました';
      updateBulkModal(overlay, state);
      return;
    }

    if (cancel.requested) {
      state.phase = 'cancelled';
      updateBulkModal(overlay, state);
      return;
    }

    state.phase = 'process';
    state.processed = 0;
    updateBulkModal(overlay, state);

    // 1レコード分の登録処理（skip判定・fetch・成功/失敗カウント・進捗更新）。
    // state更新はシングルスレッドのイベントループ上で行われるため複数ワーカーから
    // 呼ばれても競合しない（updateBulkModal は全ワーカーから呼ばれても表示は壊れない）。
    const processOneRecord = async (record) => {
      const recordId = record['$id'].value;
      const fileField = config.pdfFileField ? record[config.pdfFileField] : null;
      const files = fileField && Array.isArray(fileField.value) ? fileField.value : [];

      if (!files.length) {
        state.skip += 1;
        state.processed += 1;
        updateBulkModal(overlay, state);
        return;
      }

      const file = files[0];
      const thumbKey = getThumbKey(config);
      const payload = {
        appId,
        recordId,
        tenantId: deriveTenantId(),
        drawingNo: config.drawingNoField && record[config.drawingNoField]
          ? String(record[config.drawingNoField].value || '')
          : '',
        productName: config.productNameField && record[config.productNameField]
          ? String(record[config.productNameField].value || '')
          : '',
        tags: config.tagField && record[config.tagField]
          ? String(record[config.tagField].value || '')
          : '',
        fileKey: file.fileKey,
        fileName: file.name,
        limit: 10,
        ...(thumbKey ? { thumbKey } : {})
      };

      try {
        // バイナリ直送: 一括登録は数千件を連続処理するため、1件ごとに
        // 「PDF Blob → base64文字列（+33%）→ JSON.stringifyでさらに1コピー」という
        // 大きな一時文字列を作ると、ブラウザタブが Out of Memory でクラッシュする
        // （実運用の5000件・3並列で約1450件処理時点で発生）。Blobをそのまま
        // リクエストボディにすればJS側の大文字列割り当てがゼロになる。
        const blob = await downloadKintoneFile(file.fileKey);
        const response = await fetch(apiBaseUrl + '/index', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            // メタデータはヘッダーで送る（base64/JSON文字列化による大きな一時割り当てを避け、
            // Blobをそのままボディにする。数千件連続でもブラウザのメモリが増えない）
            'X-Index-Meta': encodeURIComponent(JSON.stringify(payload)),
            ...apiKeyHeader(config.apiKey)
          },
          body: blob
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'HTTP ' + response.status + (data.step ? ' [' + data.step + ']' : ''));
        }
        state.success += 1;
      } catch (error) {
        state.fail += 1;
        state.errors.push({ recordId, message: error.message });
      }

      state.processed += 1;
      updateBulkModal(overlay, state);
    };

    // 共有インデックスを複数ワーカーが消費するワーカープール（並列度 BULK_INDEX_CONCURRENCY）。
    // cancel.requested はワーカーのwhile条件でチェックするが、実行中の1件は完走させる。
    let nextIndex = 0;
    const runWorker = async () => {
      while (nextIndex < records.length && !cancel.requested) {
        const record = records[nextIndex];
        nextIndex += 1;
        await processOneRecord(record);
      }
    };
    const workerCount = Math.min(BULK_INDEX_CONCURRENCY, records.length) || 1;
    await Promise.all(Array.from({ length: workerCount }, runWorker));

    state.phase = cancel.requested ? 'cancelled' : 'done';
    updateBulkModal(overlay, state);
  };

  // === 複数PDF一括登録（レコード自動作成つき） ===
  // 手元のPDF/TIFを複数選択し、OCR解析→レコード作成→検索登録までをまとめて実行する。
  // 選択したファイルは全件保持し、BULK_PDF_MAX_PER_RUN 枚ずつのチャンクに分けて処理する。
  // 1チャンク完了後は「続きを登録」ボタンで次のチャンクへ進める（runBulkPdfRegister 参照）。
  const BULK_PDF_MAX_PER_RUN = 100;
  // /analyze と /index はどちらも重い処理のため、通常の一括登録（BULK_INDEX_CONCURRENCY=3）
  // より控えめな並列度にする。
  const BULK_PDF_CONCURRENCY = 2;

  const createBulkPdfModal = () => {
    const overlay = document.createElement('div');
    overlay.id = 'pb-bulk-pdf-overlay';
    overlay.className = 'pb-bulk-overlay';
    overlay.innerHTML = [
      '<div class="pb-bulk-modal">',
      '<h2 class="pb-bulk-title">複数PDF登録</h2>',
      '<div class="pb-bulk-phase">準備中...</div>',
      '<div class="pb-bulk-bar-wrap"><div class="pb-bulk-bar-fill"></div></div>',
      '<div class="pb-bulk-counts">',
      '<span class="pb-bulk-total">合計 <b>-</b></span>',
      '<span class="pb-bulk-success">成功 <b>0</b></span>',
      '<span class="pb-bulk-skip">登録済みスキップ <b>0</b></span>',
      '<span class="pb-bulk-manual">要手動 <b>0</b></span>',
      '<span class="pb-bulk-fail">失敗 <b>0</b></span>',
      '</div>',
      '<ul class="pb-bulk-errors"></ul>',
      '<div class="pb-bulk-actions">',
      '<button class="pb-bulk-cancel pb-similarity-button secondary" type="button">キャンセル</button>',
      '<button class="pb-bulk-continue pb-similarity-button primary" type="button" hidden>続きを登録</button>',
      '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);
    return overlay;
  };

  const updateBulkPdfModal = (overlay, state) => {
    const phaseEl = overlay.querySelector('.pb-bulk-phase');
    const fill = overlay.querySelector('.pb-bulk-bar-fill');
    const cancelBtn = overlay.querySelector('.pb-bulk-cancel');
    const continueBtn = overlay.querySelector('.pb-bulk-continue');

    if (state.phase === 'process') {
      phaseEl.textContent = '処理中... ' + state.processed + ' / ' + state.total + ' 件';
      fill.style.width = state.total > 0 ? Math.round(state.processed / state.total * 100) + '%' : '5%';
    } else if (state.phase === 'paused') {
      phaseEl.textContent = 'ここまで ' + state.processed + ' / ' + state.total + ' 件を処理しました。';
      fill.style.width = state.total > 0 ? Math.round(state.processed / state.total * 100) + '%' : '5%';
    } else if (state.phase === 'done') {
      phaseEl.textContent = '✓ 完了しました（成功 ' + state.success + '件）';
      fill.style.width = '100%';
    } else if (state.phase === 'cancelled') {
      phaseEl.textContent = 'キャンセルしました（実行中だった1件は完了しています）。';
    } else if (state.phase === 'error') {
      phaseEl.textContent = 'エラー: ' + (state.errorMessage || '不明なエラー');
    }

    // 完了/エラーを視覚的に強調する（呼び出しごとに冪等に切り替える）
    phaseEl.classList.toggle('done', state.phase === 'done');
    phaseEl.classList.toggle('error', state.phase === 'error');
    fill.classList.toggle('done', state.phase === 'done');

    const isClosable = state.phase === 'done' || state.phase === 'cancelled' ||
      state.phase === 'error' || state.phase === 'paused';
    cancelBtn.textContent = isClosable ? '閉じる' : 'キャンセル';
    // 完了時は閉じるボタンを主要アクションとして目立たせる
    cancelBtn.classList.toggle('secondary', state.phase !== 'done');
    cancelBtn.classList.toggle('primary', state.phase === 'done');

    // 一時停止中（1チャンク完了・残りあり）のときだけ続行ボタンを表示する。
    // state.processed は全チャンク累計なので、残り件数はここから求まる。
    const isPaused = state.phase === 'paused';
    continueBtn.hidden = !isPaused;
    if (isPaused) {
      const nextChunkSize = Math.min(state.total - state.processed, BULK_PDF_MAX_PER_RUN);
      continueBtn.textContent = '続きの' + nextChunkSize + '件を登録';
    }

    overlay.querySelector('.pb-bulk-total b').textContent = state.total > 0 ? state.total + '件' : '-';
    overlay.querySelector('.pb-bulk-success b').textContent = state.success;
    overlay.querySelector('.pb-bulk-skip b').textContent = state.skip;
    overlay.querySelector('.pb-bulk-manual b').textContent = state.manual;
    overlay.querySelector('.pb-bulk-fail b').textContent = state.fail;

    const errorsList = overlay.querySelector('.pb-bulk-errors');
    errorsList.textContent = '';
    // チャンクをまたいだ累計を表示する
    (state.entries || []).forEach((entry) => {
      const li = document.createElement('li');
      li.className = 'pb-bulk-error-item';
      li.textContent = entry.fileName + ': ' + entry.message;
      errorsList.appendChild(li);
    });
  };

  // 1ファイル分の処理（analyze→重複チェック→アップロード→レコード作成→/indexバイナリ直送をawait）。
  // 成功=検索登録まで完了した状態。呼び出し側の state を直接更新する。
  const processOneBulkPdf = async (file, config, apiBaseUrl, appId, tenantId, commonFieldValues, state) => {
    const fileName = file.name;
    const drawingNoField = config.drawingNoField || '';
    const productNameField = config.productNameField || '';
    const materialField = config.materialField || '';
    const dimensionField = config.dimensionField || '';
    const shapeTagField = config.shapeTagField || '';
    const pdfFileField = config.pdfFileField || '';

    try {
      const base64 = await toBase64(file);
      const analyzeRes = await fetch(apiBaseUrl + '/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...apiKeyHeader(config.apiKey) },
        body: JSON.stringify({ pdf_base64: base64 })
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeData.error || 'HTTP ' + analyzeRes.status);

      const drawingNo = String(analyzeData.drawingNo || '').trim();
      if (!drawingNo) {
        state.manual += 1;
        state.entries.push({ fileName, message: '図番を読み取れませんでした' });
        return;
      }

      const existing = await findRecordByDrawingNo(drawingNo, drawingNoField, appId);
      if (existing) {
        state.skip += 1;
        state.entries.push({ fileName, message: '図番 ' + drawingNo + ' は登録済みのためスキップしました' });
        return;
      }

      const fileKey = await uploadFileToKintone(file);
      const shapeTags = Array.isArray(analyzeData.extracted && analyzeData.extracted.shapeTags)
        ? analyzeData.extracted.shapeTags
        : [];

      const recordFields = {};
      if (drawingNoField) recordFields[drawingNoField] = { value: drawingNo };
      if (productNameField) recordFields[productNameField] = { value: analyzeData.productName || '' };
      if (materialField) recordFields[materialField] = { value: analyzeData.material || '' };
      if (dimensionField) recordFields[dimensionField] = { value: analyzeData.dimension || '' };
      if (shapeTagField) recordFields[shapeTagField] = { value: shapeTags.join(',') };
      if (pdfFileField) recordFields[pdfFileField] = { value: [{ fileKey }] };
      Object.entries(commonFieldValues || {}).forEach(([code, value]) => {
        recordFields[code] = { value };
      });

      const created = await kintone.api(kintone.api.url('/k/v1/record', true), 'POST', {
        app: appId, record: recordFields
      });
      const recordId = created.id;

      // ファイル添付でfileKeyは消費されているため、/indexには永続fileKeyを読み直して渡す。
      let indexFileKey = fileKey;
      let indexFileName = file.name;
      if (pdfFileField) {
        try {
          const updated = await kintone.api(kintone.api.url('/k/v1/record', true), 'GET', {
            app: appId, id: recordId
          });
          const files = updated.record[pdfFileField] && updated.record[pdfFileField].value;
          if (files && files.length > 0) {
            indexFileKey = files[0].fileKey || indexFileKey;
            indexFileName = files[0].name || indexFileName;
          }
        } catch (_) { /* 読み直し失敗時は元のfileKeyを使う */ }
      }

      // /indexはバイナリ直送。手元のfileをそのまま送る（アップロード済みと同一バイト列のため
      // 再ダウンロード不要）。1件の成功＝検索登録まで完了した状態とするためawaitする。
      const thumbKey = getThumbKey(config);
      const indexRes = await fetch(apiBaseUrl + '/index', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Index-Meta': encodeURIComponent(JSON.stringify({
            appId: String(appId),
            recordId: String(recordId),
            tenantId,
            drawingNo,
            productName: analyzeData.productName || '',
            material: analyzeData.material || '',
            dimension: analyzeData.dimension || '',
            tags: '',
            shapeTags: shapeTags.join(','),
            fileKey: indexFileKey,
            fileName: indexFileName,
            limit: 10,
            ...(thumbKey ? { thumbKey } : {})
          })),
          ...apiKeyHeader(config.apiKey)
        },
        body: file
      });
      const indexData = await indexRes.json().catch(() => ({}));
      if (!indexRes.ok) {
        throw new Error(indexData.error || 'HTTP ' + indexRes.status + (indexData.step ? ' [' + indexData.step + ']' : ''));
      }

      state.success += 1;
    } catch (error) {
      state.fail += 1;
      state.entries.push({ fileName, message: error.message });
    }
  };

  // commonFieldValues: 対応タイプの必須フィールドについて、全レコード共通で設定する値（{code: value}）
  // files は選択された全件（100件超も含む）。BULK_PDF_MAX_PER_RUN 件ずつのチャンクに分けて
  // 順番に処理し、チャンク完了ごとに一時停止して「続きを登録」ボタンで次のチャンクへ進む。
  const runBulkPdfRegister = async (overlay, config, apiBaseUrl, files, commonFieldValues) => {
    const cancel = { requested: false };
    const state = {
      phase: 'process',
      total: files.length,
      processed: 0,
      success: 0,
      skip: 0,
      manual: 0,
      fail: 0,
      entries: []
    };

    const appId = kintone.app.getId();
    const tenantId = deriveTenantId();

    // 次のチャンクの開始インデックス（チャンク完了のたびに進める）
    let chunkStart = 0;

    // 1チャンク（最大 BULK_PDF_MAX_PER_RUN 件）分を処理する。
    const runChunk = async () => {
      const chunkEnd = Math.min(files.length, chunkStart + BULK_PDF_MAX_PER_RUN);

      // 実行中のみ離脱ガードを有効化する（一時停止中はユーザーが離脱してもよい。
      // 次チャンク開始時に再取得する。release() は冪等なので finally で呼べばよい）。
      const releaseGuard = beginUploadGuard();

      const processOne = async (file) => {
        await processOneBulkPdf(file, config, apiBaseUrl, appId, tenantId, commonFieldValues, state);
        state.processed += 1;
        updateBulkPdfModal(overlay, state);
      };

      let nextIndex = chunkStart;
      const runWorker = async () => {
        while (nextIndex < chunkEnd && !cancel.requested) {
          const file = files[nextIndex];
          nextIndex += 1;
          await processOne(file);
        }
      };
      const workerCount = Math.min(BULK_PDF_CONCURRENCY, chunkEnd - chunkStart) || 1;

      try {
        await Promise.all(Array.from({ length: workerCount }, runWorker));
        chunkStart = chunkEnd;
        if (cancel.requested) {
          state.phase = 'cancelled';
        } else if (chunkStart < files.length) {
          state.phase = 'paused';
        } else {
          state.phase = 'done';
        }
        updateBulkPdfModal(overlay, state);
        if (state.phase === 'done' && state.fail > 0) {
          console.warn('[index] 複数PDF登録で ' + state.fail + ' 件の検索登録に失敗しました。管理メニューの「一括図面登録 → 未登録を登録」で再登録できます。');
        }
      } catch (error) {
        state.phase = 'error';
        state.errorMessage = error.message;
        updateBulkPdfModal(overlay, state);
        console.warn('[index] 複数PDF登録に失敗: ' + error.message);
      } finally {
        releaseGuard();
      }
    };

    overlay.querySelector('.pb-bulk-cancel').addEventListener('click', () => {
      const isClosable = state.phase === 'done' || state.phase === 'cancelled' ||
        state.phase === 'error' || state.phase === 'paused';
      if (isClosable) {
        overlay.remove();
        // レコードが作成された可能性がある場合（成功、または/index送信前にレコード作成済みで
        // 失敗したケースを含む）は一覧画面に新規レコードを反映するためページを更新する。
        // スキップ・要手動のみ（レコード未作成）の場合は更新しない。
        if (state.success > 0 || state.fail > 0) {
          window.location.reload();
        }
        return;
      }
      cancel.requested = true;
    });

    overlay.querySelector('.pb-bulk-continue').addEventListener('click', () => {
      if (state.phase !== 'paused') return;
      state.phase = 'process';
      updateBulkPdfModal(overlay, state);
      runChunk();
    });

    updateBulkPdfModal(overlay, state);
    runChunk();
  };

  // ファイル選択（複数選択 / フォルダ選択）→ 全レコード共通の必須項目入力 → 確認 → 実行、の2段階。
  const openBulkPdfRegisterModal = (config, apiBaseUrl) => {
    if (!config.pdfFileField) {
      showPluginToast('プラグイン設定でPDFファイルフィールドコードを設定してください。', 'error');
      return;
    }
    const shell = createModalShell();
    shell.host.id = 'pb-bulk-pdf-select-host';
    const { content } = shell;

    const header = document.createElement('div');
    header.className = 'modal-header';
    const titleWrap = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = '複数PDF登録';
    const sub = document.createElement('div');
    sub.className = 'modal-sub';
    sub.textContent = '手元のPDF/TIFからレコード作成と検索登録をまとめて実行します';
    titleWrap.append(title, sub);
    header.appendChild(titleWrap);

    const formPanel = document.createElement('div');
    formPanel.className = 'form-panel';

    const zone = document.createElement('div');
    zone.className = 'dropzone';
    const icon = document.createElement('div');
    icon.className = 'drop-icon';
    icon.textContent = '📄';
    const mainEl = document.createElement('div');
    mainEl.className = 'drop-main';
    mainEl.textContent = 'PDF / TIF を複数選択';
    const subEl = document.createElement('div');
    subEl.className = 'drop-sub';
    subEl.textContent = 'クリックまたはドラッグ&ドロップで選択（複数選択可）';
    const noteEl = document.createElement('div');
    noteEl.className = 'drop-note';
    noteEl.textContent = BULK_PDF_MAX_PER_RUN + '件ずつ登録します（100件を超える分は完了後に続けて登録できます）';
    const filesInput = document.createElement('input');
    filesInput.type = 'file';
    filesInput.multiple = true;
    filesInput.accept = '.pdf,.tif,.tiff,application/pdf,image/tiff';
    filesInput.className = 'file-input';
    zone.append(icon, mainEl, subEl, filesInput, noteEl);
    formPanel.appendChild(zone);

    const orEl = document.createElement('div');
    orEl.className = 'status-line';
    orEl.style.cssText = 'justify-content:center; margin-top:14px;';
    orEl.textContent = 'または';
    formPanel.appendChild(orEl);

    const folderZone = document.createElement('div');
    folderZone.className = 'dropzone';
    const fIcon = document.createElement('div');
    fIcon.className = 'drop-icon';
    fIcon.textContent = '📁';
    const fMain = document.createElement('div');
    fMain.className = 'drop-main';
    fMain.textContent = 'フォルダを選択';
    const fSub = document.createElement('div');
    fSub.className = 'drop-sub';
    fSub.textContent = 'フォルダ内のPDF・TIFをまとめて選択します（ドラッグ&ドロップ可）';
    const folderInput = document.createElement('input');
    folderInput.type = 'file';
    folderInput.webkitdirectory = true;
    folderInput.multiple = true;
    folderInput.className = 'file-input';
    folderZone.append(fIcon, fMain, fSub, folderInput);
    formPanel.appendChild(folderZone);

    const statusEl = document.createElement('div');
    statusEl.className = 'status-line';
    formPanel.appendChild(statusEl);

    const requiredSectionWrap = document.createElement('div');
    formPanel.appendChild(requiredSectionWrap);

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const startBtn = document.createElement('button');
    startBtn.className = 'btn-primary';
    startBtn.type = 'button';
    startBtn.textContent = '登録開始';
    startBtn.disabled = true;
    actions.appendChild(startBtn);
    formPanel.appendChild(actions);

    // window.confirmの代わりに、モーダル内に開始確認ブロックを表示する。
    const confirmBlock = document.createElement('div');
    confirmBlock.className = 'confirm-block';
    confirmBlock.hidden = true;
    const confirmMsgEl = document.createElement('div');
    confirmMsgEl.className = 'confirm-block-msg';
    const confirmActionsEl = document.createElement('div');
    confirmActionsEl.className = 'confirm-block-actions';
    const confirmBackBtn = document.createElement('button');
    confirmBackBtn.type = 'button';
    confirmBackBtn.className = 'btn-secondary';
    confirmBackBtn.textContent = '戻る';
    const confirmStartBtn = document.createElement('button');
    confirmStartBtn.type = 'button';
    confirmStartBtn.className = 'btn-primary';
    confirmStartBtn.textContent = '開始する';
    confirmActionsEl.append(confirmBackBtn, confirmStartBtn);
    confirmBlock.append(confirmMsgEl, confirmActionsEl);
    formPanel.appendChild(confirmBlock);

    content.append(header, formPanel);

    let selectedFiles = [];
    let requiredFieldsUi = null;
    let requiredFieldsBlocking = false;
    let requiredFieldsReady = false;
    let confirmVisible = false;

    const refreshStartButton = () => {
      startBtn.disabled = !selectedFiles.length || !requiredFieldsReady || requiredFieldsBlocking || confirmVisible;
    };

    // 確認ブロックを消して元の状態（登録開始ボタンが押せる状態）に戻す
    const hideConfirmBlock = () => {
      confirmVisible = false;
      confirmBlock.hidden = true;
      refreshStartButton();
    };

    const showConfirmBlock = (message) => {
      confirmMsgEl.textContent = message;
      confirmVisible = true;
      confirmBlock.hidden = false;
      startBtn.disabled = true;
    };

    const applySelection = (rawFiles) => {
      // ファイル選択をやり直したら確認ブロックは消す（二重表示防止）
      hideConfirmBlock();
      const filtered = rawFiles.filter((f) => /\.(pdf|tiff?)$/i.test(f.name));
      if (!filtered.length) {
        statusEl.textContent = 'PDF・TIFファイルが見つかりませんでした。';
        selectedFiles = [];
        refreshStartButton();
        return;
      }
      let notice = '';
      if (filtered.length > BULK_PDF_MAX_PER_RUN) {
        notice = ' ' + BULK_PDF_MAX_PER_RUN + '件ずつ登録します（各回の完了後に「続きを登録」で続行できます）。';
      }
      selectedFiles = filtered;
      statusEl.textContent = selectedFiles.length + ' 件のPDF・TIFが選択されました。' + notice;
      refreshStartButton();
    };

    filesInput.addEventListener('change', () => applySelection(Array.from(filesInput.files || [])));
    folderInput.addEventListener('change', () => applySelection(Array.from(folderInput.files || [])));
    zone.addEventListener('click', (e) => { if (e.target !== filesInput) filesInput.click(); });
    folderZone.addEventListener('click', (e) => { if (e.target !== folderInput) folderInput.click(); });

    // FileSystemFileEntry → File化（Promise化）
    const readEntryAsFile = (entry) => new Promise((resolve, reject) => {
      entry.file(resolve, reject);
    });

    // FileSystemDirectoryEntry の中身を読み切る。readEntries は1回最大100件しか
    // 返さない仕様のため、空配列が返るまで繰り返し呼ぶ必要がある。
    const readAllDirectoryEntries = (dirReader) => new Promise((resolve, reject) => {
      const all = [];
      const readBatch = () => {
        dirReader.readEntries((batch) => {
          if (!batch.length) {
            resolve(all);
            return;
          }
          all.push(...batch);
          readBatch();
        }, reject);
      };
      readBatch();
    });

    // FileSystemEntry（ファイル or フォルダ）を再帰的に走査し、PDF/TIFのFileを収集する
    const collectFilesFromEntry = async (entry) => {
      if (!entry) return [];
      if (entry.isFile) {
        try {
          const file = await readEntryAsFile(entry);
          return /\.(pdf|tiff?)$/i.test(file.name) ? [file] : [];
        } catch {
          return [];
        }
      }
      if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const childEntries = await readAllDirectoryEntries(dirReader);
        const results = await Promise.all(childEntries.map(collectFilesFromEntry));
        return results.flat();
      }
      return [];
    };

    // ドロップされたファイル/フォルダからFile配列を収集する（entries APIが使えない
    // 環境では dataTransfer.files にフォールバックする）
    const collectFilesFromDataTransfer = async (dataTransfer) => {
      const items = dataTransfer && dataTransfer.items;
      if (items && items.length && typeof items[0].webkitGetAsEntry === 'function') {
        const entries = Array.from(items)
          .map((item) => item.webkitGetAsEntry())
          .filter(Boolean);
        const results = await Promise.all(entries.map(collectFilesFromEntry));
        return results.flat();
      }
      return Array.from((dataTransfer && dataTransfer.files) || []);
    };

    const handleDrop = (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      folderZone.classList.remove('drag-over');
      collectFilesFromDataTransfer(e.dataTransfer).then((files) => applySelection(files));
    };
    [zone, folderZone].forEach((dz) => {
      dz.addEventListener('dragover', (e) => {
        e.preventDefault();
        dz.classList.add('drag-over');
      });
      dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
      dz.addEventListener('drop', handleDrop);
    });

    // 必須フィールドの検出（対応外タイプが必須にあれば開始不可にする）
    (async () => {
      try {
        const requiredFields = await getUnmappedRequiredFields(config);
        if (requiredFields.length) {
          const sectionLabel = document.createElement('div');
          sectionLabel.className = 'section-label';
          sectionLabel.textContent = 'このアプリの必須項目（全レコード共通の値）';
          requiredSectionWrap.appendChild(sectionLabel);
          requiredFieldsUi = buildRequiredFieldInputs(requiredFields);
          requiredSectionWrap.appendChild(requiredFieldsUi.element);
          if (requiredFieldsUi.hasUnsupported) {
            requiredFieldsBlocking = true;
            const warn = document.createElement('div');
            warn.className = 'field-note warn';
            warn.textContent = '必須フィールド「' + requiredFieldsUi.unsupportedLabels.join('」「') +
              '」はプラグインから設定できないため、複数PDF登録は開始できません。通常の図面登録（1件ずつ）をご利用ください。';
            requiredSectionWrap.appendChild(warn);
          }
        }
      } catch (_) { /* 取得失敗時は必須項目チェックをスキップする */ }
      requiredFieldsReady = true;
      refreshStartButton();
    })();

    startBtn.addEventListener('click', () => {
      if (!selectedFiles.length || requiredFieldsBlocking) return;
      if (requiredFieldsUi && !requiredFieldsUi.validate()) return;
      const confirmMessage = selectedFiles.length > BULK_PDF_MAX_PER_RUN
        ? (selectedFiles.length + '件中、最初の' + BULK_PDF_MAX_PER_RUN + '件から登録を開始します。' +
          '100件ごとに一時停止するので、続きは「続きを登録」で進められます。')
        : (selectedFiles.length + '件のPDFからレコードを作成し、検索登録まで実行します。');
      showConfirmBlock(confirmMessage);
    });

    confirmBackBtn.addEventListener('click', () => {
      hideConfirmBlock();
    });

    confirmStartBtn.addEventListener('click', () => {
      const commonFieldValues = requiredFieldsUi ? requiredFieldsUi.getValues() : {};
      shell.closeModal();
      const overlay = createBulkPdfModal();
      runBulkPdfRegister(overlay, config, apiBaseUrl, selectedFiles, commonFieldValues);
    });
  };

  // === 過去図面アーカイブ取り込み（kintoneには登録せず、フォルダ内PDFを検索対象に追加） ===

  const sha256Hex = async (text) => {
    const data = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const createArchiveModal = () => {
    const overlay = document.createElement('div');
    overlay.id = 'pb-archive-overlay';
    overlay.className = 'pb-bulk-overlay';
    overlay.innerHTML = [
      '<div class="pb-bulk-modal">',
      '<h2 class="pb-bulk-title">過去図面アーカイブ取り込み</h2>',
      '<div class="pb-bulk-phase">準備中...</div>',
      '<div class="pb-bulk-bar-wrap"><div class="pb-bulk-bar-fill"></div></div>',
      '<div class="pb-bulk-counts">',
      '<span class="pb-bulk-total">合計 <b>-</b></span>',
      '<span class="pb-bulk-success">成功 <b>0</b></span>',
      '<span class="pb-bulk-skip">スキップ <b>0</b></span>',
      '<span class="pb-bulk-fail">失敗 <b>0</b></span>',
      '</div>',
      '<ul class="pb-bulk-errors"></ul>',
      '<div class="pb-bulk-actions">',
      '<button class="pb-bulk-cancel pb-similarity-button secondary" type="button">キャンセル</button>',
      '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);
    return overlay;
  };

  const updateArchiveModal = (overlay, state) => {
    const phaseEl = overlay.querySelector('.pb-bulk-phase');
    const fill = overlay.querySelector('.pb-bulk-bar-fill');
    const cancelBtn = overlay.querySelector('.pb-bulk-cancel');

    if (state.phase === 'process') {
      phaseEl.textContent = '取り込み中... ' + state.processed + ' / ' + state.total + ' 件';
      fill.style.width = state.total > 0
        ? Math.round(state.processed / state.total * 100) + '%'
        : '5%';
    } else if (state.phase === 'done') {
      phaseEl.textContent = '完了しました。';
      fill.style.width = '100%';
    } else if (state.phase === 'cancelled') {
      phaseEl.textContent = 'キャンセルしました。同じフォルダを再度選択すると続きから再開できます。';
    } else if (state.phase === 'error') {
      phaseEl.textContent = 'エラー: ' + (state.errorMessage || '不明なエラー');
    }

    const isDone = state.phase === 'done' || state.phase === 'cancelled' || state.phase === 'error';
    cancelBtn.textContent = isDone ? '閉じる' : 'キャンセル';

    overlay.querySelector('.pb-bulk-total b').textContent = state.total > 0 ? state.total + '件' : '-';
    overlay.querySelector('.pb-bulk-success b').textContent = state.success;
    overlay.querySelector('.pb-bulk-skip b').textContent = state.skip;
    overlay.querySelector('.pb-bulk-fail b').textContent = state.fail;

    const errorsList = overlay.querySelector('.pb-bulk-errors');
    errorsList.textContent = '';
    (state.errors || []).slice(-10).forEach((entry) => {
      const li = document.createElement('li');
      li.className = 'pb-bulk-error-item';
      li.textContent = entry.relPath + ': ' + entry.message;
      errorsList.appendChild(li);
    });
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Googleドライブのファイルをアクセストークン付きでダウンロードしBlobで返す。
  // resourceKey: 共有リンク経由等の一部ファイルは fileId だけでは files.get が404になり、
  // Drive APIのリソースキー要件（X-Goog-Drive-Resource-Keys ヘッダー）を満たす必要がある。
  // https://developers.google.com/workspace/drive/api/guides/resource-keys
  const fetchDriveFileBlob = async (fileId, accessToken, resourceKey) => {
    const url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media';
    const headers = { Authorization: 'Bearer ' + accessToken };
    if (resourceKey) {
      headers['X-Goog-Drive-Resource-Keys'] = fileId + '/' + resourceKey;
    }
    const delaysMs = [500, 1000, 2000];
    let lastStatus = 0;
    for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
      const response = await fetch(url, { headers });
      if (response.ok) {
        return response.blob();
      }
      lastStatus = response.status;
      if (response.status !== 404 || attempt === delaysMs.length) {
        break;
      }
      await sleep(delaysMs[attempt]);
    }
    throw new Error('Google Driveからのダウンロードに失敗しました（HTTP ' + lastStatus + '）');
  };

  // /archive-index 取込経路（pdf_base64のJSON送信）向けのbase64版。中身は
  // fetchDriveFileBlob → toBase64 の合成。
  const fetchDriveFileBase64 = async (fileId, accessToken, resourceKey) =>
    toBase64(await fetchDriveFileBlob(fileId, accessToken, resourceKey));

  // driveAccessToken を渡すと files は Google Drive の {id, name}[]、
  // 渡さない場合は従来通りローカルの File オブジェクト配列として処理する。
  const runArchiveIndex = async (overlay, config, apiBaseUrl, files, driveAccessToken) => {
    const cancel = { requested: false };
    const state = {
      phase: 'process',
      total: files.length,
      processed: 0,
      success: 0,
      skip: 0,
      fail: 0,
      errors: []
    };

    overlay.querySelector('.pb-bulk-cancel').addEventListener('click', () => {
      const isDone = state.phase === 'done' || state.phase === 'cancelled' || state.phase === 'error';
      if (isDone) {
        overlay.remove();
        return;
      }
      cancel.requested = true;
    });

    updateArchiveModal(overlay, state);

    const appId = kintone.app.getId();
    const tenantId = deriveTenantId();
    const isDriveImport = !!driveAccessToken;

    for (const file of files) {
      if (cancel.requested) {
        break;
      }

      const driveFileId = isDriveImport ? file.id : '';
      const resourceKey = isDriveImport ? (file.resourceKey || '') : '';
      const relPath = isDriveImport ? file.name : (file.webkitRelativePath || file.name).normalize('NFC');

      try {
        const docId = await sha256Hex(isDriveImport ? 'gdrive:' + driveFileId : relPath);
        const pdf_base64 = isDriveImport
          ? await fetchDriveFileBase64(driveFileId, driveAccessToken, resourceKey)
          : await toBase64(file);
        const response = await fetch(apiBaseUrl + '/archive-index', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...apiKeyHeader(config.apiKey) },
          body: JSON.stringify({ tenantId, appId, docId, relPath, fileName: file.name, driveFileId, resourceKey, pdf_base64 })
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'HTTP ' + response.status + (data.step ? ' [' + data.step + ']' : ''));
        }
        state.success += 1;
      } catch (error) {
        state.fail += 1;
        state.errors.push({ relPath, message: error.message });
      }

      state.processed += 1;
      updateArchiveModal(overlay, state);
    }

    state.phase = cancel.requested ? 'cancelled' : 'done';
    updateArchiveModal(overlay, state);
  };

  // Google Drive OAuthポップアップ（当方サーバーがホストする固定オリジンのページ）を開き、
  // ユーザーがPickerで選んだPDFの一覧とアクセストークンを postMessage で受け取る。
  const openGooglePopup = (apiBaseUrl, extraQuery) => new Promise((resolve, reject) => {
    const popupOrigin = new URL(apiBaseUrl).origin;
    const popupUrl = popupOrigin + '/google/oauth/popup?origin=' + encodeURIComponent(window.location.origin) + (extraQuery || '');
    const popup = window.open(popupUrl, 'pb-gdrive-popup', 'width=560,height=640');
    if (!popup) {
      reject(new Error('ポップアップがブロックされました。ブラウザのポップアップ許可設定をご確認ください。'));
      return;
    }
    let settled = false;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearInterval(closeWatcher);
    };
    const onMessage = (event) => {
      if (event.origin !== popupOrigin || !event.data || typeof event.data !== 'object') return;
      settled = true;
      cleanup();
      if (event.data.ok) {
        resolve({ accessToken: event.data.accessToken, files: event.data.files || [] });
      } else {
        reject(new Error(event.data.error === 'cancelled' ? 'キャンセルされました' : (event.data.error || 'Google連携に失敗しました')));
      }
    };
    window.addEventListener('message', onMessage);
    const closeWatcher = setInterval(() => {
      if (popup.closed && !settled) {
        cleanup();
        reject(new Error('キャンセルされました'));
      }
    }, 500);
  });

  const openGoogleDrivePicker = (apiBaseUrl) => openGooglePopup(apiBaseUrl, '');

  // Picker無しで、アクセストークンの取得だけを行う（検索結果のサムネイル取得用）。
  const openGoogleDriveTokenOnly = (apiBaseUrl) => openGooglePopup(apiBaseUrl, '&mode=token');

  // フォルダ選択（webkitdirectory）→ 進捗モーダルの2段階。ドラッグ&ドロップの再帰走査は実装しない
  // （フォルダピッカーはローカル/NAS/クラウド同期フォルダのいずれでもOSレベルで同一に動作するため）。
  const openArchiveIngestModal = (config, apiBaseUrl) => {
    const shell = createModalShell();
    shell.host.id = 'pb-archive-select-host';
    const { content } = shell;

    const header = document.createElement('div');
    header.className = 'modal-header';
    const titleWrap = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = '過去図面アーカイブ取り込み';
    const sub = document.createElement('div');
    sub.className = 'modal-sub';
    sub.textContent = 'kintoneに登録せず、フォルダ内のPDFをまとめて検索対象に追加します';
    titleWrap.append(title, sub);
    header.appendChild(titleWrap);

    const formPanel = document.createElement('div');
    formPanel.className = 'form-panel';

    const zone = document.createElement('div');
    zone.className = 'dropzone';
    const icon = document.createElement('div');
    icon.className = 'drop-icon';
    icon.textContent = '📁';
    const mainEl = document.createElement('div');
    mainEl.className = 'drop-main';
    mainEl.textContent = 'フォルダを選択';
    const subEl = document.createElement('div');
    subEl.className = 'drop-sub';
    subEl.textContent = 'NASやクラウド同期フォルダも通常のフォルダと同様に選択できます';
    const noteEl = document.createElement('div');
    noteEl.className = 'drop-note';
    noteEl.textContent = '選択したフォルダ内のPDF・TIFファイルが対象です（原本はそのまま・kintoneには送信されません）';
    const folderInput = document.createElement('input');
    folderInput.type = 'file';
    folderInput.webkitdirectory = true;
    folderInput.multiple = true;
    folderInput.className = 'file-input';
    zone.append(icon, mainEl, subEl, folderInput, noteEl);
    formPanel.appendChild(zone);

    const orEl = document.createElement('div');
    orEl.className = 'status-line';
    orEl.style.cssText = 'justify-content:center; margin-top:14px;';
    orEl.textContent = 'または';
    formPanel.appendChild(orEl);

    const gdriveBtn = document.createElement('button');
    gdriveBtn.type = 'button';
    gdriveBtn.className = 'btn-secondary';
    gdriveBtn.style.cssText = 'width:100%; margin-top:10px;';
    gdriveBtn.textContent = 'Googleドライブから選択';
    formPanel.appendChild(gdriveBtn);

    const statusEl = document.createElement('div');
    statusEl.className = 'status-line';
    formPanel.appendChild(statusEl);

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const startBtn = document.createElement('button');
    startBtn.className = 'btn-primary';
    startBtn.type = 'button';
    startBtn.textContent = '取り込み開始';
    startBtn.disabled = true;
    actions.appendChild(startBtn);
    formPanel.appendChild(actions);

    content.append(header, formPanel);

    // selection.source: 'local'（Fileオブジェクト配列） | 'gdrive'（{id,name}配列＋accessToken）
    let selection = { source: 'local', files: [], accessToken: null };

    zone.addEventListener('click', (e) => {
      if (e.target !== folderInput) folderInput.click();
    });

    folderInput.addEventListener('change', () => {
      const files = Array.from(folderInput.files || []).filter((f) => /\.(pdf|tiff?)$/i.test(f.name));
      selection = { source: 'local', files, accessToken: null };
      if (!files.length) {
        statusEl.textContent = 'このフォルダにPDF・TIFファイルが見つかりませんでした。';
        startBtn.disabled = true;
        return;
      }
      statusEl.textContent = files.length + ' 件のPDF・TIFが見つかりました。';
      startBtn.disabled = false;
    });

    gdriveBtn.addEventListener('click', async () => {
      gdriveBtn.disabled = true;
      statusEl.textContent = 'Googleドライブと連携しています...';
      try {
        const { accessToken, files } = await openGoogleDrivePicker(apiBaseUrl);
        if (!files.length) {
          statusEl.textContent = 'ファイルが選択されませんでした。';
          startBtn.disabled = true;
          return;
        }
        selection = { source: 'gdrive', files, accessToken };
        statusEl.textContent = files.length + ' 件のPDFが選択されました（Googleドライブ）。';
        startBtn.disabled = false;
      } catch (error) {
        statusEl.textContent = error.message;
      } finally {
        gdriveBtn.disabled = false;
      }
    });

    startBtn.addEventListener('click', () => {
      const { source, files, accessToken } = selection;
      shell.closeModal();
      const overlay = createArchiveModal();
      runArchiveIndex(overlay, config, apiBaseUrl, files, source === 'gdrive' ? accessToken : null);
    });
  };

  // === 図面登録（Shadow DOM モーダル） ===

  const REGISTER_CSS = [
    // ---- design tokens ----
    ':host { --pb-primary: #2563eb; --pb-primary-hover: #1d4ed8; --pb-primary-soft: #eff4ff;',
    '  --pb-ink: #0f172a; --pb-ink-2: #334155; --pb-muted: #64748b; --pb-faint: #94a3b8;',
    '  --pb-line: #e6e9ef; --pb-line-2: #d7dee8; --pb-bg: #f8fafc;',
    '  --pb-green: #059669; --pb-green-soft: #ecfdf5; --pb-amber: #b45309; --pb-amber-soft: #fffbeb;',
    '  --pb-red: #dc2626; --pb-red-soft: #fef2f2; --pb-violet: #6d28d9; --pb-violet-soft: #f5f3ff;',
    '  --pb-radius: 12px; --pb-radius-sm: 9px;',
    '  --pb-shadow: 0 20px 50px rgba(15,23,42,.22), 0 4px 12px rgba(15,23,42,.10);',
    '  --pb-ring: 0 0 0 3px rgba(37,99,235,.18); }',
    '* { box-sizing: border-box; margin: 0; }',
    '@keyframes pb-fade-in { from { opacity: 0; } to { opacity: 1; } }',
    '@keyframes pb-pop-in { from { opacity: 0; transform: translateY(10px) scale(.985); }',
    '  to { opacity: 1; transform: none; } }',
    '@keyframes pb-spin { to { transform: rotate(360deg); } }',
    '@keyframes pb-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }',
    // ---- modal shell ----
    '.overlay { position: fixed; inset: 0; background: rgba(15,23,42,.5);',
    '  backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center;',
    '  z-index: 9999; animation: pb-fade-in .16s ease-out;',
    '  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif;',
    '  color: var(--pb-ink); }',
    '.modal { background: #fff; border-radius: 16px; padding: 24px;',
    '  width: 620px; max-width: calc(100vw - 32px); max-height: 90vh;',
    '  overflow-y: auto; position: relative; box-shadow: var(--pb-shadow);',
    '  animation: pb-pop-in .18s cubic-bezier(.16,1,.3,1); }',
    '.modal.wide { width: calc(100vw - 40px); height: calc(100vh - 40px); padding: 0;',
    '  overflow: hidden; display: flex; flex-direction: column; max-height: calc(100vh - 40px); }',
    '.modal.wide .btn-close { top: 14px; right: 16px; }',
    '.modal-header { padding: 16px 56px 16px 24px; border-bottom: 1px solid var(--pb-line);',
    '  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-shrink: 0; }',
    '.modal-header h2 { margin: 0; }',
    '.modal-sub { margin-top: 2px; color: var(--pb-muted); font-size: 12px; font-weight: 400; }',
    '.modal-header-actions { display: flex; gap: 8px; flex-shrink: 0; }',
    '.form-layout { display: flex; flex: 1; overflow: hidden; }',
    '.preview-panel { flex: 0 0 40%; display: flex; flex-direction: column;',
    '  border-right: 1px solid var(--pb-line); background: var(--pb-bg); min-height: 0; }',
    '.preview-label { padding: 8px 14px; font-size: 11px; color: var(--pb-muted); font-weight: 600;',
    '  background: #fff; border-bottom: 1px solid var(--pb-line); flex-shrink: 0;',
    '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.preview-embed { flex: 1; width: 100%; border: none; display: block; min-height: 0; }',
    '.preview-image { flex: 1; min-height: 0; width: 100%; object-fit: contain; }',
    '.preview-placeholder { flex: 1; display: flex; align-items: center; justify-content: center;',
    '  color: var(--pb-faint); font-size: 13px; }',
    '.form-panel { flex: 0 0 60%; overflow-y: auto; padding: 20px 24px 28px; }',
    '.panel-resizer { flex: 0 0 8px; width: 8px; margin: 0 -4px; cursor: col-resize;',
    '  position: relative; z-index: 2; background: transparent; touch-action: none; }',
    '.panel-resizer::after { content: \'\'; position: absolute; top: 8px; bottom: 8px; left: 50%;',
    '  width: 3px; transform: translateX(-50%); border-radius: 3px; background: transparent;',
    '  transition: background .15s; }',
    '.panel-resizer:hover::after, .panel-resizer.active::after { background: var(--pb-primary); }',
    '.modal.wide .modal-content { display: flex; flex-direction: column; flex: 1; overflow: hidden; min-height: 0; }',
    'h2 { font-size: 17px; font-weight: 700; color: var(--pb-ink); letter-spacing: .01em; margin-bottom: 18px; }',
    '.modal-header h2, .modal.wide h2 { margin-bottom: 0; }',
    '.btn-close { position: absolute; top: 14px; right: 16px; width: 32px; height: 32px;',
    '  display: inline-flex; align-items: center; justify-content: center;',
    '  background: transparent; border: none; border-radius: 8px; font-size: 20px; cursor: pointer;',
    '  color: var(--pb-faint); line-height: 1; transition: background .15s, color .15s; z-index: 5; }',
    '.btn-close:hover { background: #f1f5f9; color: var(--pb-ink-2); }',
    // ---- dropzone ----
    '.dropzone { border: 2px dashed var(--pb-line-2); border-radius: var(--pb-radius);',
    '  padding: 52px 24px 44px; text-align: center; cursor: pointer; background: var(--pb-bg);',
    '  transition: border-color .18s, background .18s, transform .12s; }',
    '.dropzone:hover { border-color: var(--pb-faint); }',
    '.dropzone.drag-over { border-color: var(--pb-primary); background: var(--pb-primary-soft);',
    '  transform: scale(1.005); }',
    '.dropzone .drop-icon { width: 52px; height: 52px; margin: 0 auto 14px; border-radius: 14px;',
    '  display: flex; align-items: center; justify-content: center; font-size: 24px;',
    '  background: #fff; border: 1px solid var(--pb-line); box-shadow: 0 2px 6px rgba(15,23,42,.06); }',
    '.dropzone .drop-main { font-size: 15px; color: var(--pb-ink-2); font-weight: 600; margin-bottom: 6px; }',
    '.dropzone .drop-sub { font-size: 12.5px; color: var(--pb-muted); }',
    '.drop-note { margin-top: 14px; font-size: 11.5px; color: var(--pb-faint); }',
    '.drop-error { margin-top: 10px; font-size: 12px; font-weight: 600; }',
    '.drop-error[hidden] { display: none; }',
    '.drop-error-error { color: var(--pb-red); }',
    '.drop-error-warn { color: var(--pb-amber); }',
    '.file-input { display: none; }',
    // ---- spinner / progress ----
    '.pb-spinner { width: 22px; height: 22px; border-radius: 50%; flex: 0 0 auto;',
    '  border: 3px solid rgba(37,99,235,.18); border-top-color: var(--pb-primary);',
    '  animation: pb-spin .7s linear infinite; }',
    '.spinner-wrap { display: flex; flex-direction: column; align-items: center; gap: 14px;',
    '  text-align: center; padding: 44px 0 36px; color: var(--pb-muted); font-size: 13.5px; }',
    '.status-line { display: flex; align-items: center; gap: 10px; color: var(--pb-muted); font-size: 13px; }',
    '.pb-steps { display: flex; flex-direction: column; gap: 10px; margin-top: 6px; text-align: left; }',
    '.pb-step { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--pb-faint); }',
    '.pb-step-dot { width: 22px; height: 22px; border-radius: 50%; flex: 0 0 auto;',
    '  display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;',
    '  background: #f1f5f9; color: var(--pb-faint); border: 1px solid var(--pb-line); transition: all .2s; }',
    '.pb-step.active { color: var(--pb-ink-2); font-weight: 600; }',
    '.pb-step.active .pb-step-dot { background: var(--pb-primary-soft); color: var(--pb-primary);',
    '  border-color: var(--pb-primary); }',
    '.pb-step.done { color: var(--pb-muted); }',
    '.pb-step.done .pb-step-dot { background: var(--pb-green-soft); color: var(--pb-green);',
    '  border-color: transparent; }',
    // ---- form ----
    '.section-label { font-size: 11px; color: var(--pb-muted); font-weight: 700;',
    '  text-transform: uppercase; letter-spacing: .06em; margin-bottom: 8px; }',
    '.field-group { margin-bottom: 16px; }',
    '.field-label { display: block; font-size: 12px; color: var(--pb-ink-2); font-weight: 600; margin-bottom: 6px; }',
    '.field-input { width: 100%; min-height: 38px; padding: 8px 12px; border: 1px solid var(--pb-line-2);',
    '  border-radius: var(--pb-radius-sm); font-size: 14px; color: var(--pb-ink); background: #fff;',
    '  transition: border-color .15s, box-shadow .15s; }',
    '.field-input:hover { border-color: var(--pb-faint); }',
    '.field-input:focus { outline: none; border-color: var(--pb-primary); box-shadow: var(--pb-ring); }',
    '.field-input.error { border-color: var(--pb-red); box-shadow: 0 0 0 3px rgba(220,38,38,.12); }',
    '.field-note { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 11.5px; border-radius: 6px; padding: 5px 8px; }',
    '.field-note.info { background: var(--pb-primary-soft); color: var(--pb-primary); }',
    '.field-note.warn { background: var(--pb-amber-soft); color: var(--pb-amber); }',
    // ---- 開始確認ブロック（window.confirmの代替） ----
    '.confirm-block { margin-top: 14px; padding: 14px; border: 1px solid var(--pb-line-2);',
    '  border-radius: var(--pb-radius-sm); background: var(--pb-bg); }',
    '.confirm-block[hidden] { display: none; }',
    '.confirm-block-msg { font-size: 13px; color: var(--pb-ink-2); line-height: 1.6; margin-bottom: 12px; white-space: pre-wrap; }',
    '.confirm-block-actions { display: flex; gap: 10px; }',
    '.confirm-block-actions .btn-primary, .confirm-block-actions .btn-secondary { flex: 1; min-height: 38px; }',
    // ---- chips ----
    '.chip-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }',
    '.chip { display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px;',
    '  border-radius: 9999px; border: 1px solid var(--pb-line-2); background: #fff;',
    '  font-size: 13px; cursor: pointer; user-select: none; color: var(--pb-ink-2);',
    '  transition: border-color .15s, background .15s, color .15s; }',
    '.chip:hover { border-color: var(--pb-faint); }',
    '.chip input[type=checkbox] { display: none; }',
    '.chip.selected { background: var(--pb-primary-soft); border-color: var(--pb-primary); color: var(--pb-primary-hover); font-weight: 600; }',
    '.ac-chips { display: flex; flex-wrap: wrap; gap: 6px; min-height: 26px; margin-top: 6px; }',
    '.ac-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 11px;',
    '  background: var(--pb-primary-soft); border: 1px solid transparent; color: var(--pb-primary-hover);',
    '  border-radius: 9999px; font-size: 12.5px; font-weight: 600; }',
    '.ac-chip-del { background: none; border: none; cursor: pointer; color: rgba(29,78,216,.45);',
    '  font-size: 14px; line-height: 1; padding: 0 0 0 4px; }',
    '.ac-chip-del:hover { color: var(--pb-primary-hover); }',
    '.ac-chip-ai { background: var(--pb-violet-soft); color: var(--pb-violet); }',
    '.ac-chip-ai .ac-chip-del { color: rgba(109,40,217,.4); }',
    '.ac-chip-ai .ac-chip-del:hover { color: var(--pb-violet); }',
    '.ac-input-row { position: relative; margin-top: 6px; }',
    '.ac-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: #fff;',
    '  border: 1px solid var(--pb-line); border-radius: 10px;',
    '  max-height: 200px; overflow-y: auto; z-index: 10; list-style: none; padding: 4px; margin: 0;',
    '  box-shadow: 0 10px 30px rgba(15,23,42,.14); }',
    '.ac-item { padding: 8px 10px; font-size: 13px; cursor: pointer; color: var(--pb-ink-2); border-radius: 7px; }',
    '.ac-item:hover, .ac-item.active { background: var(--pb-primary-soft); color: var(--pb-primary-hover); }',
    '.ac-item.new { color: var(--pb-green); font-style: italic; }',
    // ---- actions / buttons ----
    '.form-actions { display: flex; gap: 10px; margin-top: 24px; padding-top: 18px;',
    '  border-top: 1px solid var(--pb-line); }',
    '.btn-primary { flex: 1; min-height: 42px; padding: 10px 16px; background: var(--pb-primary); color: #fff;',
    '  border: none; border-radius: var(--pb-radius-sm); font-size: 14px; cursor: pointer; font-weight: 600;',
    '  box-shadow: 0 1px 2px rgba(37,99,235,.35); transition: background .15s, transform .05s; }',
    '.btn-primary:disabled { opacity: .5; cursor: not-allowed; }',
    '.btn-primary:not(:disabled):hover { background: var(--pb-primary-hover); }',
    '.btn-primary:not(:disabled):active { transform: translateY(1px); }',
    '.btn-primary:focus-visible { outline: none; box-shadow: var(--pb-ring); }',
    '.btn-secondary { min-height: 42px; padding: 10px 16px; background: #fff; color: var(--pb-ink-2);',
    '  border: 1px solid var(--pb-line-2); border-radius: var(--pb-radius-sm); font-size: 14px; cursor: pointer;',
    '  font-weight: 600; transition: background .15s, border-color .15s; }',
    '.btn-secondary:hover { background: var(--pb-bg); border-color: var(--pb-faint); }',
    '.btn-mini { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 4px 12px;',
    '  background: #fff; color: var(--pb-ink-2); border: 1px solid var(--pb-line-2);',
    '  border-radius: 8px; font-size: 12.5px; font-weight: 600; cursor: pointer;',
    '  transition: background .15s, border-color .15s; }',
    '.btn-mini:hover { background: var(--pb-bg); border-color: var(--pb-faint); }',
    '.btn-mini.accent { background: var(--pb-primary); border-color: var(--pb-primary); color: #fff; }',
    '.btn-mini.accent:hover { background: var(--pb-primary-hover); }',
    // ---- result (done state) ----
    '.result-wrap { text-align: center; padding: 30px 0 8px; }',
    '.result-icon { width: 56px; height: 56px; margin: 0 auto 14px; border-radius: 50%;',
    '  display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700; }',
    '.result-ok .result-icon { background: var(--pb-green-soft); color: var(--pb-green); }',
    '.result-error .result-icon { background: var(--pb-red-soft); color: var(--pb-red); }',
    '.result-msg { font-size: 15px; margin-bottom: 8px; color: var(--pb-ink); font-weight: 600; white-space: pre-wrap; }',
    '.result-detail { font-size: 12px; color: var(--pb-muted); white-space: pre-wrap; }',
    // ---- similar results ----
    '.sim-status { display: flex; align-items: center; gap: 10px; padding-bottom: 12px;',
    '  color: var(--pb-muted); font-size: 13px; }',
    '.sim-confidence { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding-bottom: 12px;',
    '  color: var(--pb-ink-2); font-size: 12px; }',
    '.sim-confidence[hidden] { display: none; }',
    '.sim-confidence-level { display: inline-flex; align-items: center; gap: 5px; min-height: 24px; padding: 0 10px;',
    '  border-radius: 9999px; font-weight: 700; font-size: 11.5px; }',
    '.sim-confidence-level.level-low { background: #f1f5f9; color: var(--pb-muted); }',
    '.sim-confidence-scores { color: var(--pb-faint);',
    '  font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; }',
    '.sim-note { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 12px; padding: 9px 12px;',
    '  border-radius: 9px; background: var(--pb-amber-soft); color: var(--pb-amber); font-size: 12px; line-height: 1.5; }',
    '.sim-empty { text-align: center; padding: 42px 16px; }',
    '.sim-empty-icon { width: 52px; height: 52px; margin: 0 auto 12px; border-radius: 14px;',
    '  display: flex; align-items: center; justify-content: center; font-size: 24px;',
    '  background: var(--pb-bg); border: 1px solid var(--pb-line); color: var(--pb-faint); }',
    '.sim-empty-text { font-size: 14px; font-weight: 600; color: var(--pb-ink-2); margin-bottom: 6px; }',
    '.sim-empty-sub { font-size: 12.5px; color: var(--pb-muted); line-height: 1.6; }',
    // ---- 未取得の行（上位3件より下位・プレビュー取得/一括取得前の暫定表示） ----
    '.sim-item { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; padding: 12px;',
    '  border: 1px solid var(--pb-line); border-radius: var(--pb-radius); background: #fff;',
    '  transition: border-color .15s, box-shadow .15s; }',
    '.sim-item:hover { border-color: var(--pb-line-2); box-shadow: 0 4px 14px rgba(15,23,42,.07); }',
    '.sim-thumb { display: flex; align-items: center; justify-content: center; box-sizing: border-box;',
    '  width: 68px; height: 68px; border: 1px solid var(--pb-line); border-radius: 8px; background: var(--pb-bg);',
    '  color: var(--pb-faint); font-size: 10px; text-align: center; overflow: hidden; flex-shrink: 0; }',
    '.sim-link { color: var(--pb-primary-hover); font-weight: 700; text-decoration: none; font-size: 13.5px; }',
    '.sim-link:hover { text-decoration: underline; }',
    '.sim-meta { margin-top: 3px; color: var(--pb-muted); font-size: 12px; }',
    '.sim-rank { color: var(--pb-faint); font-size: 11px; font-weight: 600; }',
    '.sim-scorebox { display: grid; min-width: 60px; justify-items: end; align-content: start; gap: 4px; }',
    '.sim-score { display: inline-flex; align-items: center; min-height: 24px; padding: 0 10px;',
    '  border-radius: 9999px; font-size: 12.5px; font-weight: 700; background: #f1f5f9; color: var(--pb-ink-2); }',
    '.sim-score.band-high { background: var(--pb-green-soft); color: #166534; }',
    '.sim-score.band-mid { background: var(--pb-amber-soft); color: #92400e; }',
    '.sim-thumb-img { max-width: 100%; max-height: 100%; object-fit: contain; }',
    '.sim-thumb-load { border: none; background: transparent; color: var(--pb-primary); font-size: 13px;',
    '  cursor: pointer; padding: 8px; font-weight: 600; }',
    '.sim-skeleton { width: 100%; height: 100%; border-radius: inherit;',
    '  background: linear-gradient(90deg, #eef1f5 25%, #f7f9fb 50%, #eef1f5 75%);',
    '  background-size: 200% 100%; animation: pb-shimmer 1.3s ease-in-out infinite; }',
    '.sim-thumb-retry { border: none; background: transparent; color: var(--pb-muted); font-size: 11px;',
    '  cursor: pointer; padding: 4px; text-decoration: underline; }',
    '.sim-reasons { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }',
    '.sim-reason { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px;',
    '  background: var(--pb-primary-soft); color: var(--pb-primary-hover); font-size: 10.5px; font-weight: 600; }',
    '.sim-thumb.sim-thumb-archive { font-size: 26px; }',
    '.sim-hero-thumb.sim-thumb-archive { font-size: 64px; }',
    '.sim-archive-badge { display: inline-flex; align-items: center; margin-top: 6px; padding: 2px 8px;',
    '  border-radius: 999px; background: var(--pb-violet-soft); color: var(--pb-violet);',
    '  font-size: 10.5px; font-weight: 700; }',
    '.sim-drive-link { display: inline-block; margin-top: 4px; color: var(--pb-primary-hover);',
    '  font-size: 12px; text-decoration: none; }',
    '.sim-drive-link:hover { text-decoration: underline; }',
    // ---- 検索結果に表示するkintone業務フィールド（設定の resultDetailFields） ----
    '.sim-detail-fields { margin-top: 6px; display: flex; flex-direction: column; gap: 2px; font-size: 12px; }',
    '.sim-detail-fields:empty { display: none; margin-top: 0; }',
    '.sim-detail-field { display: flex; gap: 6px; }',
    '.sim-detail-label { color: var(--pb-faint); flex-shrink: 0; }',
    '.sim-detail-value { color: var(--pb-ink-2); font-weight: 600; }',
    // ---- 一括アクションボタン（アーカイブサムネイル一括取得・残りプレビュー一括表示） ----
    '.sim-actions-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }',
    // ---- hero cards ----
    '.sim-hero-grid { display: flex; flex-direction: column; gap: 14px; margin-bottom: 18px; }',
    '.sim-hero-card { display: flex; flex-direction: column; padding: 12px; border: 1px solid var(--pb-line);',
    '  border-radius: 14px; background: #fff; transition: border-color .15s, box-shadow .15s; }',
    '.sim-hero-card:hover { border-color: var(--pb-line-2); box-shadow: 0 6px 20px rgba(15,23,42,.08); }',
    '.sim-hero-card-clickable { cursor: pointer; }',
    '.sim-hero-card-clickable:hover { border-color: var(--pb-primary); box-shadow: 0 6px 20px rgba(15,23,42,.08); }',
    // 図面シートは横長（landscape）が多いため、縦に長すぎる箱を避けてアスペクト比で
    // サイズを決める。object-fit:containの余白（レターボックス）を最小限にするため。
    '.sim-hero-thumb { position: relative; width: 100%; aspect-ratio: 3 / 2; height: auto; max-height: 70vh; display: flex;',
    '  align-items: center; justify-content: center; box-sizing: border-box;',
    '  border: 1px solid var(--pb-line); border-radius: 10px; background: var(--pb-bg);',
    '  color: var(--pb-faint); font-size: 13px; text-align: center; overflow: hidden; }',
    '.sim-hero-thumb .sim-thumb-img { width: 100%; height: 100%; object-fit: contain; }',
    '.sim-hero-score { position: absolute; top: 10px; right: 10px; padding: 4px 11px; border-radius: 9999px;',
    '  background: rgba(15,23,42,.82); color: #fff; font-size: 12px; font-weight: 700;',
    '  backdrop-filter: blur(2px); }',
    '.sim-hero-score.band-high { background: rgba(5,150,105,.92); }',
    '.sim-hero-score.band-mid { background: rgba(180,83,9,.92); }',
    '.sim-hero-rank { position: absolute; top: 10px; left: 10px; padding: 4px 11px; border-radius: 9999px;',
    '  background: rgba(15,23,42,.82); color: #fff; font-size: 12px; font-weight: 700;',
    '  backdrop-filter: blur(2px); }',
    '.sim-hero-link { display: inline-block; margin-top: 10px; color: var(--pb-primary-hover);',
    '  font-weight: 700; font-size: 16px; text-decoration: none; }',
    '.sim-hero-link:hover { text-decoration: underline; }',
    '.sim-hero-meta { margin-top: 2px; color: var(--pb-muted); font-size: 12px; }',
    '.sim-shape-comment { margin-top: 4px; color: var(--pb-violet); font-size: 11px; font-style: italic; }',
    '.sim-shape-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }',
    '.sim-shape-tag { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px;',
    '  background: var(--pb-violet-soft); color: var(--pb-violet); font-size: 10.5px; font-weight: 600; }',
    // ---- index status (integrity check) ----
    '.stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 4px 0 16px; }',
    '.stat-card { padding: 12px 8px; border: 1px solid var(--pb-line); border-radius: 12px;',
    '  text-align: center; background: var(--pb-bg); }',
    '.stat-num { font-size: 22px; font-weight: 800; line-height: 1.2; color: var(--pb-ink); }',
    '.stat-label { margin-top: 2px; font-size: 11px; color: var(--pb-muted); font-weight: 600; }',
    '.stat-card.ok .stat-num { color: var(--pb-green); }',
    '.stat-card.warn .stat-num { color: var(--pb-amber); }',
    '.stat-card.err .stat-num { color: var(--pb-red); }',
    '.diff-section { margin: 12px 0; }',
    '.diff-title { font-size: 12.5px; font-weight: 700; color: var(--pb-ink-2); margin-bottom: 6px; }',
    '.diff-list { max-height: 150px; overflow-y: auto; margin: 0; padding: 8px 12px; list-style: none;',
    '  border: 1px solid var(--pb-line); border-radius: 9px; background: var(--pb-bg); font-size: 12px; }',
    '.diff-list li { padding: 2px 0; color: var(--pb-ink-2); }',
    '.diff-list a { color: var(--pb-primary-hover); text-decoration: none; font-weight: 600; }',
    '.diff-list a:hover { text-decoration: underline; }',
    '.diff-note { font-size: 11.5px; color: var(--pb-faint); margin-top: 8px; }',
    '.btn-danger { min-height: 42px; padding: 10px 16px; background: #fff; color: var(--pb-red);',
    '  border: 1px solid #fecaca; border-radius: var(--pb-radius-sm); font-size: 14px; font-weight: 600;',
    '  cursor: pointer; transition: background .15s; }',
    '.btn-danger:hover:not(:disabled) { background: var(--pb-red-soft); }',
    '.btn-danger:disabled { opacity: .5; cursor: not-allowed; }',
    // ---- debug (collapsed) ----
    '.sim-debug { margin-top: 10px; font-size: 11px; color: var(--pb-faint); }',
    '.sim-debug summary { cursor: pointer; user-select: none; }',
    '.sim-debug pre { margin: 6px 0 0; padding: 8px 10px; border-radius: 8px; background: var(--pb-bg);',
    '  overflow-x: auto; font-size: 10.5px; line-height: 1.5; }'
  ].join('\n');

  const parseOptionsList = (str) =>
    String(str || '').split(',').map((s) => s.trim()).filter(Boolean);

  const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('ファイル読み込み失敗'));
    reader.readAsDataURL(file);
  });

  const uploadFileToKintone = (file) => new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('__REQUEST_TOKEN__', kintone.getRequestToken());
    fd.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', kintone.api.url('/k/v1/file', true));
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhr.onload = () => {
      if (xhr.status === 200) {
        try { resolve(JSON.parse(xhr.responseText).fileKey); }
        catch { reject(new Error('ファイルアップロードレスポンス解析失敗')); }
      } else {
        let message = 'HTTP ' + xhr.status;
        try {
          const errData = JSON.parse(xhr.responseText);
          if (errData.code === 'CB_CS01') {
            message = 'ページの有効期限が切れています。ページを再読み込みしてから再度お試しください。';
          } else if (errData.message) {
            message = errData.message;
          }
        } catch (_) { /* レスポンスがJSONでない場合はHTTPステータスのみ */ }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error('ファイルアップロードネットワークエラー'));
    xhr.send(fd);
  });

  const findRecordByDrawingNo = async (drawingNo, drawingNoField, appId) => {
    if (!drawingNoField || !drawingNo) return null;
    const q = drawingNoField + ' = "' + String(drawingNo).replace(/"/g, '') + '"';
    const res = await kintone.api(
      kintone.api.url('/k/v1/records', true), 'GET',
      { app: appId, query: q, fields: ['$id'] }
    );
    return res.records.length > 0 ? res.records[0] : null;
  };

  const fetchExistingTags = async (apiBaseUrl, tenantId, apiKey) => {
    try {
      const res = await fetch(
        apiBaseUrl + '/tags?tenantId=' + encodeURIComponent(tenantId || 'default'),
        { headers: apiKeyHeader(apiKey) }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.tags) ? data.tags : [];
    } catch {
      return [];
    }
  };

  const fetchFieldValueSuggestions = async (apiBaseUrl, tenantId, apiKey) => {
    const empty = { drawingNos: [], productNames: [], materials: [], dimensions: [] };
    try {
      const res = await fetch(
        apiBaseUrl + '/field-values?tenantId=' + encodeURIComponent(tenantId || 'default'),
        { headers: apiKeyHeader(apiKey) }
      );
      if (!res.ok) return empty;
      const data = await res.json();
      return {
        drawingNos: Array.isArray(data.drawingNos) ? data.drawingNos : [],
        productNames: Array.isArray(data.productNames) ? data.productNames : [],
        materials: Array.isArray(data.materials) ? data.materials : [],
        dimensions: Array.isArray(data.dimensions) ? data.dimensions : []
      };
    } catch {
      return empty;
    }
  };

  const downloadKintoneFile = async (fileKey) => {
    const url = kintone.api.url('/k/v1/file', true) + '?fileKey=' + encodeURIComponent(fileKey);
    const res = await fetch(url, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (!res.ok) {
      throw new Error('ファイル取得に失敗しました (HTTP ' + res.status + ')');
    }
    return res.blob();
  };

  const openRegisterModal = (config, apiBaseUrl, existingContext = null) => {
    const appId = kintone.app.getId();
    const tenantId = deriveTenantId();
    const drawingNoField = config.drawingNoField || '';
    const productNameField = config.productNameField || '';
    const materialField = config.materialField || '';
    const dimensionField = config.dimensionField || '';
    const processField = config.processField || '';
    const tagsField = config.tagField || '';
    const shapeTagField = config.shapeTagField || '';
    const pdfFileField = config.pdfFileField || '';
    const processOptions = parseOptionsList(config.processOptions);

    let kintoneRecordChanged = false;
    // モーダルが閉じられた（Esc・×・オーバーレイクリック）後は showDoneState 等の
    // DOM 更新を行わない。バックグラウンドの /index 送信自体はそのまま継続する
    // （成否はUIに出さない。失敗時は console.warn のみ）。
    let modalClosed = false;
    const shell = createModalShell({
      onClose: () => {
        modalClosed = true;
        if (kintoneRecordChanged) {
          // アップロード中（beforeunloadガード中）に即リロードすると、送信中の
          // リクエストが中断されて未登録になりかねない（実際に発生した不具合）。
          // ガード中であれば requestReloadWhenIdle() が持ち越し、送信完了時に自動でリロードする。
          requestReloadWhenIdle();
        }
      }
    });
    shell.host.id = 'pb-register-host';
    const { modal, content, closeModal, trackObjectUrl } = shell;

    let cancelStateTimer = null;
    const clear = () => {
      if (cancelStateTimer) { cancelStateTimer(); cancelStateTimer = null; }
      content.textContent = '';
    };

    // --- State: Drop ---
    const showDropState = () => {
      clear();
      modal.classList.remove('wide');

      const title = document.createElement('h2');
      title.textContent = '図面を登録';

      const dropWrap = buildDropzone({
        main: 'PDF / TIF をここにドロップ',
        sub: 'またはクリックしてファイルを選択',
        note: '※ OCRで図番・品名などを自動読み取りします',
        onFile: (file) => handleFile(file)
      });

      content.append(title, dropWrap);
    };

    // --- State: Analyzing ---
    const showAnalyzingState = (file) => {
      clear();
      modal.classList.add('wide');

      const header = document.createElement('div');
      header.className = 'modal-header';
      const title = document.createElement('h2');
      title.textContent = '図面を解析中';
      header.appendChild(title);

      const layout = document.createElement('div');
      layout.className = 'form-layout';

      const preview = buildPreviewPanel(file ? file.name : '', trackObjectUrl, { apiBaseUrl, config });
      if (file) preview.showBlob(file); else preview.showMessage('プレビューなし');
      const previewPanel = preview.panel;

      const formPanel = document.createElement('div');
      formPanel.className = 'form-panel';
      const spinnerWrap = document.createElement('div');
      spinnerWrap.className = 'spinner-wrap';
      const spinnerEl = document.createElement('div');
      spinnerEl.className = 'pb-spinner';
      const spinnerText = document.createElement('div');
      spinnerWrap.append(spinnerEl, spinnerText);
      formPanel.appendChild(spinnerWrap);
      cancelStateTimer = startProgressiveStatus((msg) => { spinnerText.textContent = msg; }, [
        { at: 0, text: '図面をOCR解析しています...' },
        { at: 10, text: '図番・品名などを読み取っています...' },
        { at: 25, text: 'サーバー起動中の可能性があります。初回は1分ほどかかることがあります...' },
        { at: 50, text: 'もう少しお待ちください...' }
      ]);

      layout.append(previewPanel, formPanel);
      content.append(header, layout);
    };

    // --- State: Existing PDF (detail screen entry point) ---
    const showExistingState = (fileMeta) => {
      clear();
      modal.classList.add('wide');

      const header = document.createElement('div');
      header.className = 'modal-header';
      const title = document.createElement('h2');
      title.textContent = '既存の図面';
      header.appendChild(title);

      const layout = document.createElement('div');
      layout.className = 'form-layout';

      const preview = buildPreviewPanel(fileMeta.name || '', trackObjectUrl, { apiBaseUrl, config, cacheKey: fileMeta.fileKey });
      const previewPanel = preview.panel;

      const formPanel = document.createElement('div');
      formPanel.className = 'form-panel';
      const desc = document.createElement('div');
      desc.className = 'section-label';
      desc.textContent = '登録済みのPDFがあります。再計算するか、図面を差し替えてください。';
      const actions = document.createElement('div');
      actions.className = 'form-actions';
      const recalcBtn = document.createElement('button');
      recalcBtn.className = 'btn-primary';
      recalcBtn.type = 'button';
      recalcBtn.textContent = 'このPDFで再計算';
      recalcBtn.disabled = true;
      const replaceBtn = document.createElement('button');
      replaceBtn.className = 'btn-secondary';
      replaceBtn.type = 'button';
      replaceBtn.textContent = '図面を差し替える';
      actions.append(recalcBtn, replaceBtn);
      formPanel.append(desc, actions);

      layout.append(previewPanel, formPanel);
      content.append(header, layout);

      replaceBtn.addEventListener('click', () => showDropState());

      let currentFile = null;
      downloadKintoneFile(fileMeta.fileKey).then((blob) => {
        // ファイル名がTIFの場合はtypeもimage/tiffにする（application/pdf固定だと
        // buildPreviewPanel のTIF判定がblob.typeでは効かず、拡張子判定頼りになってしまう）。
        const fileType = isTiffFileName(fileMeta.name) ? 'image/tiff' : 'application/pdf';
        currentFile = new File([blob], fileMeta.name || 'drawing.pdf', { type: fileType });
        preview.showBlob(currentFile);
        recalcBtn.disabled = false;
      }).catch((error) => {
        preview.showMessage('プレビューを表示できません: ' + error.message);
      });

      recalcBtn.addEventListener('click', () => {
        if (!currentFile) return;
        handleFile(currentFile, fileMeta.fileKey);
      });
    };

    // オートコンプリート付き複数選択フィールド
    const makeAutoChipsField = (labelText, suggestions, allowNew, initialSelected = []) => {
      const selected = [...initialSelected];
      const group = document.createElement('div');
      group.className = 'field-group';
      const lbl = document.createElement('div');
      lbl.className = 'field-label';
      lbl.textContent = labelText;
      const chipsDiv = document.createElement('div');
      chipsDiv.className = 'ac-chips';
      const inputRow = document.createElement('div');
      inputRow.className = 'ac-input-row';
      const input = document.createElement('input');
      input.className = 'field-input';
      input.type = 'text';
      input.placeholder = '入力して検索...';
      input.setAttribute('autocomplete', 'off');
      const dropdown = document.createElement('ul');
      dropdown.className = 'ac-dropdown';
      dropdown.hidden = true;

      const renderChips = () => {
        chipsDiv.innerHTML = '';
        selected.forEach((val) => {
          const chip = document.createElement('span');
          chip.className = 'ac-chip';
          chip.appendChild(document.createTextNode(val));
          const del = document.createElement('button');
          del.className = 'ac-chip-del';
          del.type = 'button';
          del.textContent = '×';
          del.addEventListener('click', () => {
            const idx = selected.indexOf(val);
            if (idx >= 0) { selected.splice(idx, 1); }
            renderChips();
          });
          chip.appendChild(del);
          chipsDiv.appendChild(chip);
        });
      };

      const updateDropdown = (q) => {
        const lower = q.trim().toLowerCase();
        const filtered = suggestions.filter(
          (s) => !selected.includes(s) && (!lower || s.toLowerCase().includes(lower))
        );
        dropdown.innerHTML = '';
        const items = [...filtered.slice(0, 8)];
        const trimmed = q.trim();
        if (allowNew && trimmed
          && !suggestions.some((s) => s.toLowerCase() === trimmed.toLowerCase())
          && !selected.includes(trimmed)) {
          items.push('__new__:' + trimmed);
        }
        if (!items.length) { dropdown.hidden = true; return; }
        items.forEach((s) => {
          const isNew = s.startsWith('__new__:');
          const val = isNew ? s.slice(8) : s;
          const li = document.createElement('li');
          li.className = 'ac-item' + (isNew ? ' new' : '');
          li.textContent = isNew ? '"' + val + '" を追加' : val;
          li.dataset.value = val;
          dropdown.appendChild(li);
        });
        dropdown.hidden = false;
      };

      const addItem = (val) => {
        if (!val || selected.includes(val)) { return; }
        selected.push(val);
        if (!suggestions.includes(val)) { suggestions.push(val); }
        renderChips();
        input.value = '';
        dropdown.hidden = true;
      };

      input.addEventListener('focus', () => updateDropdown(input.value));
      input.addEventListener('input', () => updateDropdown(input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const active = dropdown.querySelector('.ac-item.active');
          if (active) { addItem(active.dataset.value); return; }
          if (input.value.trim()) { addItem(input.value.trim()); }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const els = [...dropdown.querySelectorAll('.ac-item')];
          const idx = els.indexOf(dropdown.querySelector('.active'));
          els.forEach((el) => el.classList.remove('active'));
          const next = els[idx + 1] || els[0];
          if (next) { next.classList.add('active'); }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const els = [...dropdown.querySelectorAll('.ac-item')];
          const idx = els.indexOf(dropdown.querySelector('.active'));
          els.forEach((el) => el.classList.remove('active'));
          const prev = els[idx - 1] || els[els.length - 1];
          if (prev) { prev.classList.add('active'); }
        } else if (e.key === 'Escape') {
          dropdown.hidden = true;
        }
      });
      input.addEventListener('blur', () => { setTimeout(() => { dropdown.hidden = true; }, 150); });
      dropdown.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.ac-item');
        if (item) { e.preventDefault(); addItem(item.dataset.value); }
      });

      renderChips();
      inputRow.append(input, dropdown);
      group.append(lbl, chipsDiv, inputRow);
      return { element: group, getValues: () => [...selected] };
    };

    // タグ欄: ユーザータグとAI形状タグ（提案）を同じ欄に表示し、色で区別する。
    // 同じ文字列でも由来（origin）が違えば別チップとして残し、個別に削除できる。
    const makeTagChipsField = (labelText, suggestions, initialUserTags, initialAiTags) => {
      let items = [
        ...initialUserTags.map((value) => ({ value, origin: 'user' })),
        ...initialAiTags.map((value) => ({ value, origin: 'ai' }))
      ];
      const group = document.createElement('div');
      group.className = 'field-group';
      const lbl = document.createElement('div');
      lbl.className = 'field-label';
      lbl.textContent = labelText;
      const chipsDiv = document.createElement('div');
      chipsDiv.className = 'ac-chips';
      const inputRow = document.createElement('div');
      inputRow.className = 'ac-input-row';
      const input = document.createElement('input');
      input.className = 'field-input';
      input.type = 'text';
      input.placeholder = '入力して検索...';
      input.setAttribute('autocomplete', 'off');
      const dropdown = document.createElement('ul');
      dropdown.className = 'ac-dropdown';
      dropdown.hidden = true;

      const renderChips = () => {
        chipsDiv.innerHTML = '';
        items.forEach((item, idx) => {
          const chip = document.createElement('span');
          chip.className = 'ac-chip' + (item.origin === 'ai' ? ' ac-chip-ai' : '');
          chip.appendChild(document.createTextNode(item.value));
          const del = document.createElement('button');
          del.className = 'ac-chip-del';
          del.type = 'button';
          del.textContent = '×';
          del.addEventListener('click', () => {
            items.splice(idx, 1);
            renderChips();
          });
          chip.appendChild(del);
          chipsDiv.appendChild(chip);
        });
      };

      const updateDropdown = (q) => {
        const lower = q.trim().toLowerCase();
        const filtered = suggestions.filter((s) => !lower || s.toLowerCase().includes(lower));
        dropdown.innerHTML = '';
        const items2 = [...filtered.slice(0, 8)];
        const trimmed = q.trim();
        if (trimmed && !suggestions.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
          items2.push('__new__:' + trimmed);
        }
        if (!items2.length) { dropdown.hidden = true; return; }
        items2.forEach((s) => {
          const isNew = s.startsWith('__new__:');
          const val = isNew ? s.slice(8) : s;
          const li = document.createElement('li');
          li.className = 'ac-item' + (isNew ? ' new' : '');
          li.textContent = isNew ? '"' + val + '" を追加' : val;
          li.dataset.value = val;
          dropdown.appendChild(li);
        });
        dropdown.hidden = false;
      };

      const addItem = (val) => {
        const value = val.trim();
        if (!value || items.some((it) => it.value === value && it.origin === 'user')) { return; }
        items.push({ value, origin: 'user' });
        if (!suggestions.includes(value)) { suggestions.push(value); }
        renderChips();
        input.value = '';
        dropdown.hidden = true;
      };

      input.addEventListener('focus', () => updateDropdown(input.value));
      input.addEventListener('input', () => updateDropdown(input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const active = dropdown.querySelector('.ac-item.active');
          if (active) { addItem(active.dataset.value); return; }
          if (input.value.trim()) { addItem(input.value); }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const els = [...dropdown.querySelectorAll('.ac-item')];
          const idx = els.indexOf(dropdown.querySelector('.active'));
          els.forEach((el) => el.classList.remove('active'));
          const next = els[idx + 1] || els[0];
          if (next) { next.classList.add('active'); }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const els = [...dropdown.querySelectorAll('.ac-item')];
          const idx = els.indexOf(dropdown.querySelector('.active'));
          els.forEach((el) => el.classList.remove('active'));
          const prev = els[idx - 1] || els[els.length - 1];
          if (prev) { prev.classList.add('active'); }
        } else if (e.key === 'Escape') {
          dropdown.hidden = true;
        }
      });
      input.addEventListener('blur', () => { setTimeout(() => { dropdown.hidden = true; }, 150); });
      dropdown.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.ac-item');
        if (item) { e.preventDefault(); addItem(item.dataset.value); }
      });

      renderChips();
      inputRow.append(input, dropdown);
      group.append(lbl, chipsDiv, inputRow);
      return {
        element: group,
        getValues: () => ({
          tags: [...new Set(items.filter((it) => it.origin === 'user').map((it) => it.value))],
          shapeTags: items.filter((it) => it.origin === 'ai').map((it) => it.value)
        })
      };
    };

    // 既存値からのオートコンプリート付き単一値フィールド（自由入力も可）
    const makeAutoCompleteInput = (suggestions, initialValue) => {
      const wrap = document.createElement('div');
      wrap.className = 'ac-input-row';
      const input = document.createElement('input');
      input.className = 'field-input';
      input.type = 'text';
      input.value = initialValue || '';
      input.setAttribute('autocomplete', 'off');
      const dropdown = document.createElement('ul');
      dropdown.className = 'ac-dropdown';
      dropdown.hidden = true;

      const updateDropdown = (q) => {
        const lower = q.trim().toLowerCase();
        const filtered = suggestions.filter((s) => !lower || s.toLowerCase().includes(lower));
        dropdown.innerHTML = '';
        const items = filtered.slice(0, 8);
        if (!items.length) { dropdown.hidden = true; return; }
        items.forEach((s) => {
          const li = document.createElement('li');
          li.className = 'ac-item';
          li.textContent = s;
          li.dataset.value = s;
          dropdown.appendChild(li);
        });
        dropdown.hidden = false;
      };

      const selectValue = (val) => {
        input.value = val;
        dropdown.hidden = true;
      };

      input.addEventListener('focus', () => updateDropdown(input.value));
      input.addEventListener('input', () => updateDropdown(input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const active = dropdown.querySelector('.ac-item.active');
          if (active) { e.preventDefault(); selectValue(active.dataset.value); }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const els = [...dropdown.querySelectorAll('.ac-item')];
          const idx = els.indexOf(dropdown.querySelector('.active'));
          els.forEach((el) => el.classList.remove('active'));
          const next = els[idx + 1] || els[0];
          if (next) { next.classList.add('active'); }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const els = [...dropdown.querySelectorAll('.ac-item')];
          const idx = els.indexOf(dropdown.querySelector('.active'));
          els.forEach((el) => el.classList.remove('active'));
          const prev = els[idx - 1] || els[els.length - 1];
          if (prev) { prev.classList.add('active'); }
        } else if (e.key === 'Escape') {
          dropdown.hidden = true;
        }
      });
      input.addEventListener('blur', () => { setTimeout(() => { dropdown.hidden = true; }, 150); });
      dropdown.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.ac-item');
        if (item) { e.preventDefault(); selectValue(item.dataset.value); }
      });

      wrap.append(input, dropdown);
      return { element: wrap, input };
    };

    // --- State: Form ---
    const showFormState = (file, analyzeResult, availableTags, fieldValues, reuseFileKey, requiredFields) => {
      clear();
      modal.classList.add('wide');
      let drawingNoInput, productNameInput, materialInput, dimensionInput;

      const header = document.createElement('div');
      header.className = 'modal-header';
      const title = document.createElement('h2');
      title.textContent = '登録内容の確認';
      header.appendChild(title);

      const layout = document.createElement('div');
      layout.className = 'form-layout';

      // Left: PDF preview
      const preview = buildPreviewPanel(file ? file.name : '', trackObjectUrl, { apiBaseUrl, config });
      if (file) preview.showBlob(file); else preview.showMessage('プレビューなし');
      const previewPanel = preview.panel;

      // Right: Form panel
      const formPanel = document.createElement('div');
      formPanel.className = 'form-panel';

      const fv = fieldValues || { drawingNos: [], productNames: [], materials: [], dimensions: [] };

      // 既存レコードの更新時（既存PDFの再計算/差し替え）は、レコードの現在値を初期値にする。
      // OCR誤読のまま保存して正しいレコード値を上書きしたり、タグ/加工方法が空から
      // 始まって既存の値を消してしまったりするのを防ぐ。OCR値は (a) レコード値が空の
      // 欄のフォールバック、(b) レコード値と異なる場合は候補ドロップダウンの先頭に
      // 追加して1クリックで選べるようにする。
      const rv = (existingContext && existingContext.recordId && existingContext.recordValues) || null;
      const initialValue = (recordVal, ocrVal) => rv ? (recordVal || ocrVal || '') : (ocrVal || '');
      const withOcrCandidate = (list, ocrVal, recordVal) => {
        const arr = [...list];
        const ocr = String(ocrVal || '').trim();
        if (rv && ocr && ocr !== (recordVal || '') && !arr.includes(ocr)) {
          arr.unshift(ocr);
        }
        return arr;
      };

      if (rv) {
        const updateNote = document.createElement('div');
        updateNote.className = 'field-note info';
        updateNote.textContent = '既存レコードの値を初期表示しています。OCRの読み取り値は各欄の候補から選べます。';
        formPanel.appendChild(updateNote);
      }

      // 図番
      const drawingNoGroup = document.createElement('div');
      drawingNoGroup.className = 'field-group';
      const drawingNoLabel = document.createElement('label');
      drawingNoLabel.className = 'field-label';
      drawingNoLabel.textContent = '図番 *';
      const drawingNoCandidates = withOcrCandidate(fv.drawingNos, analyzeResult.drawingNo, rv && rv.drawingNo);
      const drawingNoAc = makeAutoCompleteInput(drawingNoCandidates, initialValue(rv && rv.drawingNo, analyzeResult.drawingNo));
      drawingNoInput = drawingNoAc.input;
      drawingNoInput.placeholder = '図番を入力（既存から選択も可）';
      drawingNoGroup.append(drawingNoLabel, drawingNoAc.element);

      // 既存図番と重複する場合は「更新になる」ことを事前に知らせる（無警告上書きの防止）
      const dupeNote = document.createElement('div');
      dupeNote.className = 'field-note warn';
      dupeNote.hidden = true;
      drawingNoGroup.appendChild(dupeNote);
      if (!(existingContext && existingContext.recordId)) {
        let dupeCheckSeq = 0;
        const checkDupe = async () => {
          const value = drawingNoInput.value.trim();
          const seq = ++dupeCheckSeq;
          if (!value || !drawingNoField) { dupeNote.hidden = true; return; }
          try {
            const existing = await findRecordByDrawingNo(value, drawingNoField, appId);
            if (seq !== dupeCheckSeq) return;
            if (existing) {
              dupeNote.textContent = '⚠ 図番「' + value + '」は登録済みです。保存すると既存レコードを更新します。';
              dupeNote.hidden = false;
            } else {
              dupeNote.hidden = true;
            }
          } catch (_) { /* チェック失敗時は表示しない */ }
        };
        drawingNoInput.addEventListener('blur', () => { setTimeout(checkDupe, 200); });
      }
      formPanel.appendChild(drawingNoGroup);

      // 品名
      const productNameGroup = document.createElement('div');
      productNameGroup.className = 'field-group';
      const productNameLabel = document.createElement('label');
      productNameLabel.className = 'field-label';
      productNameLabel.textContent = '品名';
      const productNameCandidates = withOcrCandidate(fv.productNames, analyzeResult.productName, rv && rv.productName);
      const productNameAc = makeAutoCompleteInput(productNameCandidates, initialValue(rv && rv.productName, analyzeResult.productName));
      productNameInput = productNameAc.input;
      productNameInput.placeholder = '品名を入力（既存から選択も可）';
      productNameGroup.append(productNameLabel, productNameAc.element);
      formPanel.appendChild(productNameGroup);

      // 材質
      const materialGroup = document.createElement('div');
      materialGroup.className = 'field-group';
      const materialLabel = document.createElement('label');
      materialLabel.className = 'field-label';
      materialLabel.textContent = '材質';
      const materialCandidates = withOcrCandidate(fv.materials, analyzeResult.material, rv && rv.material);
      const materialAc = makeAutoCompleteInput(materialCandidates, initialValue(rv && rv.material, analyzeResult.material));
      materialInput = materialAc.input;
      materialInput.placeholder = '例: SPCC, SUS304, S45C';
      materialGroup.append(materialLabel, materialAc.element);
      formPanel.appendChild(materialGroup);

      // 寸法 (板厚 / 外径)
      const dimensionGroup = document.createElement('div');
      dimensionGroup.className = 'field-group';
      const dimensionLabel = document.createElement('label');
      dimensionLabel.className = 'field-label';
      dimensionLabel.textContent = '寸法 (板厚 / 外径)';
      const dimensionCandidates = withOcrCandidate(fv.dimensions, analyzeResult.dimension, rv && rv.dimension);
      const dimensionAc = makeAutoCompleteInput(dimensionCandidates, initialValue(rv && rv.dimension, analyzeResult.dimension));
      dimensionInput = dimensionAc.input;
      dimensionInput.placeholder = '例: t1.6, φ28.6';
      dimensionGroup.append(dimensionLabel, dimensionAc.element);
      formPanel.appendChild(dimensionGroup);

      // AI形状コメント（登録確認画面のみで表示。スコアリングには使わない参考情報）
      const shapeComment = analyzeResult.extracted && analyzeResult.extracted.shapeComment;
      if (shapeComment) {
        const shapeCommentEl = document.createElement('div');
        shapeCommentEl.className = 'sim-shape-comment';
        shapeCommentEl.textContent = 'AI形状コメント: ' + shapeComment;
        formPanel.appendChild(shapeCommentEl);
      }

      // 加工方法 autocomplete（更新時は既存レコードの加工方法を初期値にする。空始まりだと
      // 差し替え保存で既存の加工方法が消えてしまうため）
      let getProcessValues = () => [];
      {
        const { element, getValues } = makeAutoChipsField('加工方法', [...processOptions], false, rv ? [...rv.processes] : []);
        formPanel.appendChild(element);
        getProcessValues = getValues;
      }

      // タグ（ユーザータグ + AI形状タグの提案を同じ欄に表示、色で区別）
      // 更新時は既存レコードのタグを初期値にする（同上の理由）。AI形状タグは
      // レコードに保存済みのタグと今回のOCR新提案をマージ・重複排除して表示する。
      const shapeTagSuggestions = Array.isArray(analyzeResult.extracted && analyzeResult.extracted.shapeTags)
        ? analyzeResult.extracted.shapeTags
        : [];
      const initialAiTags = rv ? [...new Set([...rv.shapeTags, ...shapeTagSuggestions])] : shapeTagSuggestions;
      let getTagValues = () => ({ tags: [], shapeTags: [] });
      {
        const { element, getValues } = makeTagChipsField('タグ', [...availableTags], rv ? [...rv.tags] : [], initialAiTags);
        formPanel.appendChild(element);
        getTagValues = getValues;
      }

      // このアプリの必須項目（プラグインが自動設定しないフィールド）。新規登録時のみ渡される。
      // 対応外タイプの必須項目がある場合は保存時にkintoneの作成画面へリダイレクトするフォールバックになる。
      let requiredFieldsUi = null;
      if (requiredFields && requiredFields.length) {
        const sectionLabel = document.createElement('div');
        sectionLabel.className = 'section-label';
        sectionLabel.textContent = 'このアプリの必須項目';
        formPanel.appendChild(sectionLabel);
        requiredFieldsUi = buildRequiredFieldInputs(requiredFields);
        formPanel.appendChild(requiredFieldsUi.element);
        if (requiredFieldsUi.hasUnsupported) {
          const warn = document.createElement('div');
          warn.className = 'field-note warn';
          warn.textContent = '必須フィールド「' + requiredFieldsUi.unsupportedLabels.join('」「') +
            '」はプラグインから設定できないため、保存時にkintoneの作成画面へ移動します。';
          formPanel.appendChild(warn);
        }
      }

      // Actions
      const actions = document.createElement('div');
      actions.className = 'form-actions';
      const submitBtn = document.createElement('button');
      submitBtn.className = 'btn-primary';
      submitBtn.type = 'button';
      submitBtn.textContent = '登録する';
      const resetBtn = document.createElement('button');
      resetBtn.className = 'btn-secondary';
      resetBtn.type = 'button';
      resetBtn.textContent = 'やり直し';
      actions.append(submitBtn, resetBtn);
      formPanel.appendChild(actions);

      resetBtn.addEventListener('click', showDropState);

      submitBtn.addEventListener('click', async () => {
        const drawingNo = drawingNoInput.value.trim();
        if (!drawingNo) {
          drawingNoInput.classList.add('error');
          drawingNoInput.focus();
          return;
        }
        drawingNoInput.classList.remove('error');
        // 対応タイプの必須項目は保存前に埋まっていることを確認する
        // （対応外タイプはリダイレクトフォールバックでkintone側の必須チェックに任せる）
        if (requiredFieldsUi && !requiredFieldsUi.validate()) {
          return;
        }
        submitBtn.disabled = true;
        try {
          await doRegister(
            file,
            drawingNo,
            productNameInput.value.trim(),
            materialInput.value.trim(),
            dimensionInput.value.trim(),
            getProcessValues(),
            getTagValues(),
            reuseFileKey,
            requiredFieldsUi ? requiredFieldsUi.getValues() : {},
            requiredFieldsUi ? requiredFieldsUi.hasUnsupported : false
          );
        } catch (error) {
          showDoneState(false, '登録に失敗しました。', error.message);
          submitBtn.disabled = false;
        }
      });

      layout.append(previewPanel, formPanel);
      content.append(header, layout);
    };

    // --- State: Registering（ステップインジケータ付き） ---
    const REGISTER_STEPS = ['PDFをアップロード', 'kintoneレコードを保存', '検索インデックスを登録'];
    const showRegisteringState = (activeStep, messageOverride) => {
      clear();
      modal.classList.remove('wide');
      const title = document.createElement('h2');
      title.textContent = '登録しています...';
      const wrap = document.createElement('div');
      wrap.className = 'spinner-wrap';
      const spinnerEl = document.createElement('div');
      spinnerEl.className = 'pb-spinner';
      wrap.appendChild(spinnerEl);

      if (typeof activeStep === 'number') {
        const steps = document.createElement('div');
        steps.className = 'pb-steps';
        REGISTER_STEPS.forEach((label, index) => {
          const step = document.createElement('div');
          step.className = 'pb-step' + (index < activeStep ? ' done' : index === activeStep ? ' active' : '');
          const dot = document.createElement('span');
          dot.className = 'pb-step-dot';
          dot.textContent = index < activeStep ? '✓' : String(index + 1);
          const text = document.createElement('span');
          text.textContent = label;
          step.append(dot, text);
          steps.appendChild(step);
        });
        wrap.appendChild(steps);
      }
      if (messageOverride) {
        const msg = document.createElement('div');
        msg.textContent = messageOverride;
        wrap.appendChild(msg);
      }
      content.append(title, wrap);
    };

    // --- State: Done ---
    // backgroundNote を渡すと、バックグラウンドで実行中の検索インデックス登録について
    // 一言添える（進行・成否はUIに出さない。失敗時は console.warn のみ）。
    const showDoneState = (success, message, detail, backgroundNote, recordLinkId) => {
      clear();
      modal.classList.remove('wide');
      const title = document.createElement('h2');
      title.textContent = success ? '登録完了' : '登録失敗';
      const resultWrap = document.createElement('div');
      resultWrap.className = 'result-wrap ' + (success ? 'result-ok' : 'result-error');
      const icon = document.createElement('div');
      icon.className = 'result-icon';
      icon.textContent = success ? '✓' : '✗';
      const msg = document.createElement('div');
      msg.className = 'result-msg';
      msg.textContent = message;
      resultWrap.append(icon, msg);
      if (detail) {
        const det = document.createElement('div');
        det.className = 'result-detail';
        det.textContent = detail;
        resultWrap.appendChild(det);
      }
      // モーダル内でレコードを作成/更新した場合はkintoneの画面遷移が起きないため、
      // 作成したレコードへの導線をここに出す（インデックス登録だけ失敗した場合も
      // レコード自体は保存済みのためリンクを出す）。
      if (recordLinkId) {
        const linkWrap = document.createElement('div');
        linkWrap.style.cssText = 'margin-top:10px;';
        const link = document.createElement('a');
        link.className = 'sim-link';
        link.href = '/k/' + appId + '/show#record=' + encodeURIComponent(recordLinkId);
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'レコードを開く ↗';
        linkWrap.appendChild(link);
        resultWrap.appendChild(linkWrap);
      }
      if (backgroundNote) {
        const note = document.createElement('div');
        note.className = 'status-line';
        note.style.cssText = 'justify-content:center; margin-top:14px; text-align:center;';
        note.textContent = backgroundNote;
        resultWrap.appendChild(note);
      }
      const actions = document.createElement('div');
      actions.className = 'form-actions';
      const closeBtn2 = document.createElement('button');
      closeBtn2.className = 'btn-secondary';
      closeBtn2.type = 'button';
      closeBtn2.textContent = '閉じる';
      closeBtn2.addEventListener('click', closeModal);
      if (success) {
        const newBtn = document.createElement('button');
        newBtn.className = 'btn-primary';
        newBtn.type = 'button';
        newBtn.textContent = '続けて登録';
        newBtn.addEventListener('click', showDropState);
        actions.append(newBtn, closeBtn2);
      } else {
        actions.appendChild(closeBtn2);
      }
      content.append(title, resultWrap, actions);
    };

    // --- File handler ---
    const handleFile = async (file, reuseFileKey) => {
      showAnalyzingState(file);
      let analyzeResult;
      try {
        const base64 = await toBase64(file);
        const res = await fetch(apiBaseUrl + '/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...apiKeyHeader(config.apiKey) },
          body: JSON.stringify({ pdf_base64: base64 })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
        analyzeResult = data;
      } catch (error) {
        showDoneState(false, 'OCR解析に失敗しました。', error.message);
        return;
      }
      // 必須項目セクションは「新規登録」の入口（既存レコードの詳細画面からの更新ではない）
      // でのみ取得する。更新時はレコードにすでに値があり、空欄での再入力を強制すると
      // 既存の値を消しかねないため（Part3設計）。
      const isUpdateEntry = !!(existingContext && existingContext.recordId);
      const [availableTags, fieldValues, requiredFields] = await Promise.all([
        fetchExistingTags(apiBaseUrl, tenantId, config.apiKey),
        fetchFieldValueSuggestions(apiBaseUrl, tenantId, config.apiKey),
        isUpdateEntry ? Promise.resolve([]) : getUnmappedRequiredFields(config)
      ]);
      showFormState(file, analyzeResult, availableTags, fieldValues, reuseFileKey, requiredFields);
    };

    // --- Registration ---
    const doRegister = async (
      file, drawingNo, productName, material, dimension, processes, tagValues, reuseFileKey,
      requiredFieldValues, hasUnsupportedRequired
    ) => {
      const tags = tagValues.tags;
      const shapeTags = tagValues.shapeTags;
      let fileKey;
      if (reuseFileKey) {
        fileKey = reuseFileKey;
      } else {
        showRegisteringState(0);
        try {
          fileKey = await uploadFileToKintone(file);
        } catch (error) {
          throw new Error('ファイルアップロード失敗: ' + error.message);
        }
      }

      showRegisteringState(1);
      const recordFields = {};
      if (productNameField) recordFields[productNameField] = { value: productName };
      if (materialField) recordFields[materialField] = { value: material };
      if (dimensionField) recordFields[dimensionField] = { value: dimension };
      if (processField) recordFields[processField] = { value: processes.join(',') };
      if (tagsField) recordFields[tagsField] = { value: tags.join(',') };
      if (shapeTagField) recordFields[shapeTagField] = { value: shapeTags.join(',') };
      if (pdfFileField) recordFields[pdfFileField] = { value: [{ fileKey }] };
      Object.entries(requiredFieldValues || {}).forEach(([code, value]) => {
        recordFields[code] = { value };
      });

      let recordId;
      try {
        if (existingContext && existingContext.recordId) {
          recordId = existingContext.recordId;
          if (drawingNoField) recordFields[drawingNoField] = { value: drawingNo };
          await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', {
            app: appId, id: recordId, record: recordFields
          });
        } else {
          const existing = await findRecordByDrawingNo(drawingNo, drawingNoField, appId);
          if (existing) {
            recordId = existing['$id'].value;
            await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', {
              app: appId, id: recordId, record: recordFields
            });
          } else if (hasUnsupportedRequired) {
            // 対応外タイプの必須フィールドがあるため、従来どおりkintoneの作成画面へ
            // リダイレクトし、そちらで必須項目を入力してもらう。
            const pending = {
              appId: String(appId),
              tenantId,
              drawingNo,
              productName,
              material,
              dimension,
              processes,
              tags,
              shapeTags,
              fileKey,
              fileName: file ? file.name : ''
            };
            sessionStorage.setItem('pb_pending_registration', JSON.stringify(pending));
            showRegisteringState(undefined, '新規図面のため、kintoneの編集画面へ移動します...');
            setTimeout(() => { window.location.href = '/k/' + appId + '/edit'; }, 800);
            return;
          } else {
            // 新規レコードはモーダル内でkintone REST APIから直接作成する
            // （従来のリダイレクト→保存イベント内で/indexをawaitするフローは廃止）。
            if (drawingNoField) recordFields[drawingNoField] = { value: drawingNo };
            const created = await kintone.api(kintone.api.url('/k/v1/record', true), 'POST', {
              app: appId, record: recordFields
            });
            recordId = created.id;
          }
        }
      } catch (error) {
        throw new Error('kintoneレコード保存失敗: ' + error.message);
      }
      kintoneRecordChanged = true;

      // ファイル添付（POST/PUTいずれも）で一時 fileKey は消費されるため、/index には
      // レコードを読み直して得た永続 fileKey を渡す（消費済みキーだと 404 になる）。
      let indexFileKey = fileKey;
      let indexFileName = file ? file.name : '';
      if (fileKey && pdfFileField && recordId) {
        try {
          const updated = await kintone.api(kintone.api.url('/k/v1/record', true), 'GET', {
            app: appId, id: recordId
          });
          const files = updated.record[pdfFileField] && updated.record[pdfFileField].value;
          if (files && files.length > 0) {
            indexFileKey = files[0].fileKey || indexFileKey;
            indexFileName = files[0].name || indexFileName;
          }
        } catch (_) { /* 読み直しに失敗した場合は元の fileKey を使う */ }
      }

      // kintoneレコードの保存はここまでで完了。検索インデックス登録（/index、コールド
      // スタート時は1分弱）は、応答（Qdrant書き込み込み）をブラウザが待つ必要はない。
      // リクエストボディ（PDF）の送信さえサーバーに届き切れば、サーバー側で登録処理は
      // 完了するため、守るべきはその送信中の1〜3秒だけ。そこでモーダルは送信完了まで
      // ステップ表示（ステップ3「検索インデックスを登録」＝アップロード中）で待たせ、
      // 送信完了（XHRのupload load）を検知した時点で初めて完了画面を出す。その時点で
      // beforeunloadガードは解除済みのため、以降はページ移動も完全に自由になる。
      // bodyは手元の file をそのままバイナリ直送する（アップロード済みのバイト列と
      // 同一のため、kintoneからのダウンロードは不要）。
      showRegisteringState(2, 'アップロード中...');

      const releaseGuard = beginUploadGuard();
      let doneScreenShown = false;
      const onUploadComplete = () => {
        // アップロード（リクエストボディの送信）完了。ガードを解除し、モーダルが
        // まだ開いていれば完了画面を出す。Esc等で先に閉じられていた場合はDOM操作を
        // 行わない（送信自体・サーバー側の登録処理は継続している）。
        releaseGuard();
        doneScreenShown = true;
        if (modalClosed) return;
        showDoneState(
          true,
          '図番 ' + drawingNo + ' を保存しました。',
          'record ' + recordId,
          '検索登録はバックグラウンドで処理しています。しばらくすると検索結果に反映されます（ページを移動しても登録は完了します）',
          recordId
        );
      };

      const thumbKey = getThumbKey(config);
      sendIndexBinary(apiBaseUrl, config.apiKey, {
        appId: String(appId),
        recordId: String(recordId),
        tenantId,
        drawingNo,
        productName,
        material,
        dimension,
        tags: tags.join(','),
        shapeTags: shapeTags.join(','),
        fileKey: indexFileKey,
        fileName: indexFileName,
        limit: 10,
        ...(thumbKey ? { thumbKey } : {})
      }, file, onUploadComplete).catch((error) => {
        // 送信失敗時のガード解除（onUploadComplete未発火の場合の保険）。
        releaseGuard();
        console.warn('[index] 検索登録に失敗: ' + error.message);
        // 送信自体が失敗した場合（onUploadComplete未発火）は完了画面が出ておらず、
        // モーダルが「アップロード中...」のまま固まってしまうため、ここでエラー画面を出す。
        // レコード保存自体は完了済みなのでその旨を明記する。
        if (!doneScreenShown && !modalClosed) {
          showDoneState(
            false,
            '検索インデックスの登録に失敗しました。',
            error.message + '\n※レコード自体は保存済みです（record ' + recordId + '）。管理メニューの「一括図面登録 → 未登録を登録」で再登録できます。',
            undefined,
            recordId
          );
        }
      });
    };

    if (existingContext && existingContext.fileMeta) {
      showExistingState(existingContext.fileMeta);
    } else if (existingContext && existingContext.initialFile) {
      // アップロード検索から「この図面を登録」で遷移してきた場合は、
      // 手元のファイルをそのまま解析フローに乗せる（再アップロード不要）。
      handleFile(existingContext.initialFile);
    } else {
      showDropState();
    }
  };

  // === 類似図面検索（Shadow DOM モーダル、左に自分の図面・右に候補） ===

  // 確度表示の方針: high（サーバーが旧版でmediumを返してきた場合も含む）は
  // 「似た図面が見つかった」通常時であり、わざわざバッジで知らせる情報ではないため
  // 何も表示しない。low のときだけ「参考程度に見てほしい」注意書きを出す。
  // 生スコア（Top/2位/差）はどちらの場合も開発者向けデバッグ表示でのみ出す。
  const renderSimilarConfidence = (confidenceEl, confidence, debug) => {
    confidenceEl.innerHTML = '';
    confidenceEl.hidden = true;

    if (!confidence) {
      return;
    }

    if (confidence.level === 'low') {
      const note = document.createElement('span');
      note.className = 'sim-confidence-level level-low';
      note.textContent = '類似の図面が見つからなかった可能性があります（最も近い候補でも類似度が低め）。参考として候補を表示しています。';
      confidenceEl.appendChild(note);
      confidenceEl.hidden = false;
    }

    if (debug) {
      const scores = document.createElement('span');
      scores.className = 'sim-confidence-scores';
      scores.textContent = 'Top ' + formatVectorRaw(confidence.topScore) +
        ' / 2位 ' + formatVectorRaw(confidence.secondScore) +
        ' / 差 ' + formatVectorRaw(confidence.margin);
      confidenceEl.appendChild(scores);
      confidenceEl.hidden = false;
    }
  };

  const buildShapeTagsEl = (tags) => {
    if (!Array.isArray(tags) || !tags.length) {
      return null;
    }
    const wrap = document.createElement('div');
    wrap.className = 'sim-shape-tags';
    tags.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'sim-shape-tag';
      chip.textContent = tag;
      wrap.appendChild(chip);
    });
    return wrap;
  };

  // 上位3件はサムネイルを主役にした大きいカードで見せ、残りは品番中心の補助リストにする。
  // アーカイブ結果（doc_type='archive'）には kintone レコードが無いので、リンクの代わりに
  // ファイル名・相対パスをテキスト表示し、サムネイルの代わりに汎用アイコン＋バッジを出す。
  const buildArchiveBadge = () => {
    const badge = document.createElement('span');
    badge.className = 'sim-archive-badge';
    badge.textContent = 'アーカイブ（未登録）';
    return badge;
  };

  // アーカイブ結果に driveFileId があれば、Googleドライブで直接開けるリンクを返す（無ければ null）。
  const buildDriveLink = (item) => {
    if (!item.driveFileId) return null;
    const driveLink = document.createElement('a');
    driveLink.className = 'sim-drive-link';
    driveLink.href = 'https://drive.google.com/file/d/' + encodeURIComponent(item.driveFileId) + '/view' +
      (item.driveResourceKey ? '?resourcekey=' + encodeURIComponent(item.driveResourceKey) : '');
    driveLink.target = '_blank';
    driveLink.rel = 'noopener';
    driveLink.textContent = 'Google Driveで開く ↗';
    return driveLink;
  };

  // 追加フィールド（resultDetailFields）の「ラベル: 値」表示を container に描画する。
  const renderDetailFieldsInto = (container, fields) => {
    container.textContent = '';
    fields.forEach((field) => {
      const row = document.createElement('div');
      row.className = 'sim-detail-field';
      const label = document.createElement('span');
      label.className = 'sim-detail-label';
      label.textContent = field.label + ':';
      const value = document.createElement('span');
      value.className = 'sim-detail-value';
      value.textContent = field.value;
      row.append(label, value);
      container.appendChild(row);
    });
  };

  // kintone結果のカード/行に「追加フィールド」表示枠を作る。detailFieldsMap に取得済みデータが
  // あれば生成時点で即描画し、無ければ空のまま返す（loadResultDetailFields の完了後に後追いで埋める）。
  const buildDetailFieldsSlot = (item, detailFieldsMap) => {
    const slot = document.createElement('div');
    slot.className = 'sim-detail-fields';
    slot.dataset.recordId = String(item.recordId);
    const fields = detailFieldsMap && detailFieldsMap.get(String(item.recordId));
    if (fields && fields.length) renderDetailFieldsInto(slot, fields);
    return slot;
  };

  // レコードのフィールド値を表示用文字列に変換する。
  // 配列（チェックボックス等）は join、{name}配列（ユーザー選択等）は name を join。
  // 添付ファイル等の複雑な型は空文字を返して呼び出し側でスキップさせる。
  const extractFieldDisplayValue = (fieldValue) => {
    if (!fieldValue) return '';
    const value = fieldValue.value;
    if (value === null || value === undefined || value === '') return '';
    if (Array.isArray(value)) {
      return value
        .map((entry) => (entry && typeof entry === 'object') ? (entry.name || entry.code || '') : String(entry))
        .filter(Boolean)
        .join(', ');
    }
    if (typeof value === 'object') return '';
    return String(value);
  };

  // フィールドラベル（コード→表示名）をアプリのフォーム設定から取得し、モーダル表示中はキャッシュする。
  const fetchFieldLabels = async () => {
    if (_fieldLabelsCache) return _fieldLabelsCache;
    try {
      const resp = await kintone.api(kintone.api.url('/k/v1/app/form/fields', true), 'GET', { app: kintone.app.getId() });
      _fieldLabelsCache = (resp && resp.properties) || {};
    } catch (error) {
      console.warn('フィールドラベルの取得に失敗しました', error);
      _fieldLabelsCache = {};
    }
    return _fieldLabelsCache;
  };

  // === 新規登録（モーダル内REST API作成）向け：プラグインが自動設定しない必須フィールドの検出 ===

  // kintoneのシステム系フィールドタイプ（自動採番・作成者・更新者・ステータス等）は
  // ユーザーが値を入力する対象ではないため、必須項目の検出から除外する。
  const SYSTEM_FIELD_TYPES = new Set([
    'RECORD_NUMBER', 'CREATOR', 'CREATED_TIME', 'MODIFIER', 'UPDATED_TIME',
    'STATUS', 'STATUS_ASSIGNEE', 'CATEGORY', 'SUBTABLE', 'GROUP', 'LABEL',
    'SPACER', 'HR', 'REFERENCE_TABLE'
  ]);

  // プラグインが入力欄を出せるフィールドタイプ。DROP_DOWN/RADIO_BUTTONはoptionsも使う。
  const SUPPORTED_REQUIRED_FIELD_TYPES = new Set([
    'SINGLE_LINE_TEXT', 'MULTI_LINE_TEXT', 'NUMBER', 'DATE', 'DROP_DOWN', 'RADIO_BUTTON'
  ]);

  // アプリのフォーム定義（fetchFieldLabelsのキャッシュを再利用）から、必須（required）かつ
  // configで自動設定されないフィールド（drawingNoField等）・システム系タイプを除いた
  // {code,label,type,options} の配列を返す。
  const getUnmappedRequiredFields = async (config) => {
    const properties = await fetchFieldLabels();
    const mappedCodes = new Set([
      config.drawingNoField, config.productNameField, config.materialField,
      config.dimensionField, config.processField, config.tagField,
      config.shapeTagField, config.pdfFileField
    ].filter(Boolean));

    return Object.keys(properties || {})
      .map((code) => properties[code])
      .filter((field) => field && field.required === true)
      .filter((field) => !mappedCodes.has(field.code))
      .filter((field) => !SYSTEM_FIELD_TYPES.has(field.type))
      .map((field) => ({
        code: field.code,
        label: field.label || field.code,
        type: field.type,
        options: field.options
          ? Object.values(field.options)
            .sort((a, b) => Number(a.index) - Number(b.index))
            .map((o) => o.label)
          : []
      }));
  };

  // Part2の必須フィールド入力UI。対応タイプ（テキスト/数値/日付/選択）のみ入力欄を作る。
  // 対応外タイプが1つでもあれば hasUnsupported=true を返し、呼び出し側でフォールバック判定に使う。
  // validate() は空欄をエラー表示しつつ全項目が埋まっているかを返す。
  const buildRequiredFieldInputs = (fields) => {
    const element = document.createElement('div');
    let hasUnsupported = false;
    const unsupportedLabels = [];
    const inputs = [];

    fields.forEach((field) => {
      const group = document.createElement('div');
      group.className = 'field-group';
      const label = document.createElement('label');
      label.className = 'field-label';
      label.textContent = field.label + ' *';
      group.appendChild(label);

      if (!SUPPORTED_REQUIRED_FIELD_TYPES.has(field.type)) {
        hasUnsupported = true;
        unsupportedLabels.push(field.label);
        const note = document.createElement('div');
        note.className = 'field-note warn';
        note.textContent = 'このタイプ（' + field.type + '）はプラグインから設定できません。';
        group.appendChild(note);
        element.appendChild(group);
        return;
      }

      let input;
      if (field.type === 'MULTI_LINE_TEXT') {
        input = document.createElement('textarea');
        input.className = 'field-input';
        input.rows = 3;
      } else if (field.type === 'DROP_DOWN' || field.type === 'RADIO_BUTTON') {
        input = document.createElement('select');
        input.className = 'field-input';
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = '選択してください';
        input.appendChild(blank);
        (field.options || []).forEach((opt) => {
          const optionEl = document.createElement('option');
          optionEl.value = opt;
          optionEl.textContent = opt;
          input.appendChild(optionEl);
        });
      } else {
        input = document.createElement('input');
        input.className = 'field-input';
        input.type = field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text';
      }
      group.appendChild(input);
      element.appendChild(group);
      inputs.push({ code: field.code, el: input });
    });

    return {
      element,
      hasUnsupported,
      unsupportedLabels,
      getValues: () => {
        const values = {};
        inputs.forEach(({ code, el }) => { values[code] = String(el.value || '').trim(); });
        return values;
      },
      validate: () => {
        let ok = true;
        inputs.forEach(({ el }) => {
          if (String(el.value || '').trim()) {
            el.classList.remove('error');
          } else {
            el.classList.add('error');
            ok = false;
          }
        });
        return ok;
      }
    };
  };

  // config.resultDetailFields（カンマ区切りのフィールドコード）が設定されていれば、
  // 表示中の kintone 結果（アーカイブ以外）のレコードをバッチ取得して各カード/行に追記する。
  // 失敗しても検索結果自体には影響させない（console.warnのみ）。
  const loadResultDetailFields = async (listEl, results, config, detailFieldsMap) => {
    const fieldCodes = parseOptionsList(config && config.resultDetailFields);
    if (!fieldCodes.length) return;

    const ids = [...new Set(
      results
        .filter((item) => item.docType !== 'archive' && item.recordId)
        .map((item) => String(item.recordId))
    )];
    if (!ids.length) return;

    try {
      const [labelProps, recordsResp] = await Promise.all([
        fetchFieldLabels(),
        kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
          app: kintone.app.getId(),
          query: '$id in (' + ids.join(',') + ')',
          fields: ['$id', ...fieldCodes]
        })
      ]);

      const slots = listEl.querySelectorAll('.sim-detail-fields[data-record-id]');
      (recordsResp.records || []).forEach((record) => {
        const recordId = record.$id && record.$id.value;
        if (!recordId) return;
        const fields = fieldCodes
          .map((code) => {
            const display = extractFieldDisplayValue(record[code]);
            if (!display) return null;
            const label = (labelProps[code] && labelProps[code].label) || code;
            return { label, value: display };
          })
          .filter(Boolean);
        if (!fields.length) return;

        detailFieldsMap.set(String(recordId), fields);
        slots.forEach((slot) => {
          if (slot.dataset.recordId === String(recordId)) renderDetailFieldsInto(slot, fields);
        });
      });
    } catch (error) {
      console.warn('検索結果への追加フィールド表示に失敗しました', error);
    }
  };

  // options:
  //   debug: 内訳等の開発者向け表示
  //   autoLoad: kintone登録図面のサムネイルを即時取得するか（false時は「プレビュー取得」ボタンを出す）。
  //     アーカイブ（Google Drive由来）はまとめて読み込むボタンを別途出すため、ここでは常に未取得状態で始める。
  //   rank: 検索結果内の順位（1始まり）。表示専用でAPIリクエストには影響しない。
  //   detailFieldsMap: recordId(string)→[{label,value}] の取得済みキャッシュ（renderSimilarList参照）。
  //   config/trackObjectUrl: サムネイル取得（loadThumbnail）に必要なプラグイン設定とblob URL追跡関数。
  //   thumbUrl: 高速サムネイル（暗号化保存）で復号済みのblob URL。あればダウンロード・
  //     変換を待たずそのまま表示する（autoLoad指定に関わらず優先）。
  const buildHeroCard = (item, apiBaseUrl, options = {}) => {
    const { debug, autoLoad = true, rank, detailFieldsMap, config, trackObjectUrl, thumbUrl } = options;
    const card = document.createElement('div');
    card.className = 'sim-hero-card';
    const isArchive = item.docType === 'archive';

    let thumbBox;
    if (isArchive) {
      thumbBox = document.createElement('div');
      thumbBox.className = 'sim-hero-thumb sim-thumb-archive';
      thumbBox.textContent = '📁';
      if (item.driveFileId) {
        thumbBox.dataset.driveFileId = item.driveFileId;
        thumbBox.dataset.driveResourceKey = item.driveResourceKey || '';
      }
    } else {
      thumbBox = buildThumbnailBox(apiBaseUrl, item.fileKey, autoLoad, config, trackObjectUrl, 'sim-hero-thumb', thumbUrl);
    }

    const scoreBadge = document.createElement('div');
    scoreBadge.className = 'sim-hero-score ' + scoreBandClass(item.score);
    scoreBadge.textContent = formatPercent(item.score);
    thumbBox.appendChild(scoreBadge);

    if (rank) {
      const rankBadge = document.createElement('div');
      rankBadge.className = 'sim-hero-rank';
      rankBadge.textContent = rank + '位';
      thumbBox.appendChild(rankBadge);
    }

    const link = document.createElement(isArchive ? 'span' : 'a');
    link.className = 'sim-hero-link';
    if (!isArchive) {
      link.href = '/k/' + kintone.app.getId() + '/show#record=' + encodeURIComponent(item.recordId);
      link.target = '_blank';
      link.rel = 'noopener';
    }
    link.textContent = isArchive
      ? (item.drawingNo || item.archiveFileName || 'アーカイブ')
      : (item.drawingNo || 'record ' + item.recordId);

    const meta = document.createElement('div');
    meta.className = 'sim-hero-meta';
    meta.textContent = isArchive
      ? [item.productName, item.archiveRelPath].filter(Boolean).join(' / ')
      : [item.productName, item.customer].filter(Boolean).join(' / ');

    card.append(thumbBox, link, meta);

    if (isArchive) {
      card.appendChild(buildArchiveBadge());
      const driveLink = buildDriveLink(item);
      if (driveLink) card.appendChild(driveLink);
    } else {
      card.appendChild(buildDetailFieldsSlot(item, detailFieldsMap));
    }

    const reasonsEl = buildReasonBadges(item.reasons);
    if (reasonsEl) card.appendChild(reasonsEl);

    const shapeTagsEl = buildShapeTagsEl(item.shapeTags);
    if (shapeTagsEl) card.appendChild(shapeTagsEl);

    if (debug) card.appendChild(buildDebugDetails(item));

    // kintone登録図面はカード全体クリックでレコードを新規タブで開く。
    // ただし既存のリンク・ボタン・詳細summaryのクリックは二重発火を防ぐため素通りさせる。
    if (!isArchive) {
      card.classList.add('sim-hero-card-clickable');
      card.addEventListener('click', (e) => {
        if (e.target.closest('a,button,summary')) return;
        window.open(link.href, '_blank', 'noopener');
      });
    }

    return card;
  };

  // 上位3件より下位の結果は、まずこの小さい行で表示する（プレビュー未取得の暫定表示）。
  // kintone登録図面は「プレビュー取得」クリックで、アーカイブは一括読み込みボタン経由で、
  // その結果1件だけ buildHeroCard の大きいカードに差し替わる（expandToHeroCard参照）。
  // options は buildHeroCard と同じ意味（プレビュー取得でカードに展開する際にそのまま引き継ぐ）。
  const buildResultRow = (item, apiBaseUrl, options = {}) => {
    const { debug, rank, detailFieldsMap, config, trackObjectUrl } = options;
    const row = document.createElement('div');
    row.className = 'sim-item';
    const isArchive = item.docType === 'archive';

    const thumbBox = document.createElement('div');
    thumbBox.className = 'sim-thumb' + (isArchive ? ' sim-thumb-archive' : '');

    if (isArchive) {
      thumbBox.textContent = '📁';
      if (item.driveFileId) {
        thumbBox.dataset.driveFileId = item.driveFileId;
        thumbBox.dataset.driveResourceKey = item.driveResourceKey || '';
      }
    } else {
      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'sim-thumb-load';
      loadBtn.textContent = 'プレビュー取得';
      loadBtn.addEventListener('click', () => {
        row.replaceWith(buildHeroCard(item, apiBaseUrl, { debug, autoLoad: true, rank, detailFieldsMap, config, trackObjectUrl }));
      });
      thumbBox.appendChild(loadBtn);
    }

    const body = document.createElement('div');
    const link = document.createElement(isArchive ? 'span' : 'a');
    link.className = 'sim-link';
    if (!isArchive) {
      link.href = '/k/' + kintone.app.getId() + '/show#record=' + encodeURIComponent(item.recordId);
      link.target = '_blank';
      link.rel = 'noopener';
    }
    link.textContent = isArchive
      ? (item.drawingNo || item.archiveFileName || 'アーカイブ')
      : (item.drawingNo || 'record ' + item.recordId);

    const meta = document.createElement('div');
    meta.className = 'sim-meta';
    meta.textContent = isArchive
      ? [item.productName, item.archiveRelPath].filter(Boolean).join(' / ')
      : [item.productName, item.customer].filter(Boolean).join(' / ');

    body.append(link, meta);

    if (isArchive) {
      body.appendChild(buildArchiveBadge());
      const driveLink = buildDriveLink(item);
      if (driveLink) body.appendChild(driveLink);
    } else {
      body.appendChild(buildDetailFieldsSlot(item, detailFieldsMap));
    }

    const reasonsEl = buildReasonBadges(item.reasons);
    if (reasonsEl) body.appendChild(reasonsEl);

    const shapeTagsEl = buildShapeTagsEl(item.shapeTags);
    if (shapeTagsEl) body.appendChild(shapeTagsEl);

    const scoreBox = document.createElement('div');
    scoreBox.className = 'sim-scorebox';
    if (rank) {
      const rankLabel = document.createElement('div');
      rankLabel.className = 'sim-rank';
      rankLabel.textContent = rank + '位';
      scoreBox.appendChild(rankLabel);
    }
    const score = document.createElement('div');
    score.className = 'sim-score ' + scoreBandClass(item.score);
    score.textContent = formatPercent(item.score);
    scoreBox.appendChild(score);

    row.append(thumbBox, body, scoreBox);
    return row;
  };

  // デバッグ表示: スコア内訳を折りたたみで出す
  const buildDebugDetails = (item) => {
    const details = document.createElement('details');
    details.className = 'sim-debug';
    const summary = document.createElement('summary');
    summary.textContent = 'スコア内訳';
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify({
      score: item.score,
      breakdown: item.scoreBreakdown,
      rotation: item.embeddingRotation,
      reasons: item.reasons
    }, null, 2);
    details.append(summary, pre);
    return details;
  };

  const buildEmptyState = (subText, actionButtons) => {
    const empty = document.createElement('div');
    empty.className = 'sim-empty';
    const icon = document.createElement('div');
    icon.className = 'sim-empty-icon';
    icon.textContent = '🔍';
    const text = document.createElement('div');
    text.className = 'sim-empty-text';
    text.textContent = '類似図面は見つかりませんでした';
    const sub = document.createElement('div');
    sub.className = 'sim-empty-sub';
    sub.textContent = subText ||
      '検索対象はこのアプリでインデックス登録済みの図面です。' +
      '登録がまだの図面は「図面登録」から追加すると検索できるようになります。';
    empty.append(icon, text, sub);
    if (actionButtons && actionButtons.length) {
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex; justify-content:center; gap:8px; margin-top:14px;';
      actionButtons.forEach((btn) => actions.appendChild(btn));
      empty.appendChild(actions);
    }
    return empty;
  };

  // options: { debug: 内訳等の開発者向け表示, emptyActions: 0件時に出すボタン配列, config: プラグイン設定 }
  const renderSimilarList = (listEl, statusEl, confidenceEl, data, apiBaseUrl, options = {}) => {
    const results = Array.isArray(data && data.results) ? data.results : [];
    listEl.textContent = '';
    renderSimilarConfidence(confidenceEl, results.length ? (data ? data.matchConfidence : null) : null, options.debug);

    if (!results.length) {
      statusEl.textContent = '';
      listEl.appendChild(buildEmptyState(null, options.emptyActions));
      return;
    }

    statusEl.textContent = results.length + '件の候補が見つかりました。';

    // 表示順: ①一括アクションボタン群→②結果グリッド
    // （低確度の注意書きは renderSimilarConfidence が confidenceEl 側に一本化して出すため、
    // ここでは重複して出さない。末尾の「さらに表示」は runSimilarSearch 側で listEl に追加する）。

    // kintone結果（アーカイブ以外）の追加フィールド表示に使う取得済みキャッシュ。
    // buildHeroCard/buildResultRow に共有参照として渡し、行→カード展開後も表示が消えないようにする。
    const detailFieldsMap = new Map();

    // 上位 THUMBNAIL_AUTO_COUNT 件は大きいカード＋サムネイル自動取得、それより下位は
    // 小さい行で暫定表示する（プレビュー取得/一括取得のトリガーで、その1件だけ大きい
    // カードに差し替わる＝expand）。未取得のまま全件を大きくすると縦に長くなりすぎるため。
    const heroGrid = document.createElement('div');
    heroGrid.className = 'sim-hero-grid';
    // アーカイブ結果の現在の要素（行 or カード）を保持し、一括取得ボタンから
    // 差し替え・サムネイル取得先の特定に使う。
    const archiveTargets = [];
    // 上位3件より下位の kintone結果（アーカイブ以外）の行を保持し、「残りのプレビューを表示」
    // ボタンから一括でカードに展開するのに使う。
    const kintoneRowTargets = [];
    results.forEach((item, index) => {
      const isArchive = item.docType === 'archive';
      const rank = index + 1;
      // 高速サムネイル: 復号済みのblob URLが手元にあれば、順位に関わらず即座に大きい
      // カードで表示する（ヒットしなければ従来どおり上位3件autoLoad・以下は行表示）。
      const thumbUrl = !isArchive && options.thumbUrlMap ? options.thumbUrlMap.get(String(item.recordId)) : undefined;
      const autoLoad = index < THUMBNAIL_AUTO_COUNT || Boolean(thumbUrl);
      // buildHeroCard/buildResultRow に共通で渡すオプション（config/trackObjectUrl は
      // サムネイル取得=loadThumbnail に必要）。
      const cardOptions = {
        debug: options.debug, rank, detailFieldsMap,
        config: options.config, trackObjectUrl: options.trackObjectUrl, thumbUrl
      };
      let el = autoLoad
        ? buildHeroCard(item, apiBaseUrl, { ...cardOptions, autoLoad: true })
        : buildResultRow(item, apiBaseUrl, cardOptions);
      heroGrid.appendChild(el);

      if (isArchive && item.driveFileId) {
        archiveTargets.push({
          getThumbBox: () => {
            if (el.classList.contains('sim-item')) {
              const heroCard = buildHeroCard(item, apiBaseUrl, { ...cardOptions, autoLoad: true });
              el.replaceWith(heroCard);
              el = heroCard;
            }
            return el.querySelector('[data-drive-file-id]');
          }
        });
      }

      if (!isArchive && !autoLoad) {
        kintoneRowTargets.push({
          expand: () => {
            if (el.classList.contains('sim-item')) {
              const heroCard = buildHeroCard(item, apiBaseUrl, { ...cardOptions, autoLoad: true });
              el.replaceWith(heroCard);
              el = heroCard;
            }
          }
        });
      }
    });

    // Google Drive由来のアーカイブ結果や、下位のkintone結果が1件でもあれば一括操作ボタンを出す。
    // 2つとも出る場合は横並びにする。
    const actionButtons = [];
    if (archiveTargets.length) {
      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'btn-secondary';
      loadBtn.textContent = '🔓 Googleドライブのサムネイルを表示（' + archiveTargets.length + '件）';
      loadBtn.addEventListener('click', () => loadArchiveDriveThumbnails(archiveTargets, apiBaseUrl, loadBtn, options.config || {}, options.trackObjectUrl));
      actionButtons.push(loadBtn);
    }
    if (kintoneRowTargets.length) {
      const expandBtn = document.createElement('button');
      expandBtn.type = 'button';
      expandBtn.className = 'btn-secondary';
      expandBtn.textContent = '残りのプレビューを表示（' + kintoneRowTargets.length + '件）';
      expandBtn.addEventListener('click', () => {
        kintoneRowTargets.forEach((target) => target.expand());
        expandBtn.remove();
      });
      actionButtons.push(expandBtn);
    }
    if (actionButtons.length) {
      const actionsRow = document.createElement('div');
      actionsRow.className = 'sim-actions-row';
      actionButtons.forEach((btn) => actionsRow.appendChild(btn));
      listEl.appendChild(actionsRow);
    }

    listEl.appendChild(heroGrid);

    // resultDetailFields が設定されていれば、表示中のkintone結果へ非同期で追加フィールドを追記する。
    if (options.config) {
      loadResultDetailFields(listEl, results, options.config, detailFieldsMap);
    }
  };

  // 一括サムネイル取得の並列度。Google Drive/APIへの同時リクエスト数を抑えつつ体感を速くする。
  const ARCHIVE_THUMB_CONCURRENCY = 3;

  // Google連携ポップアップ（トークンのみ）→ 対象PDFをDriveから取得 → /render-thumbnail でPNG化、
  // という流れで、表示中のアーカイブ結果のサムネイルをまとめて置き換える。何も永続化しない。
  // targets: [{ getThumbBox }]（行のままなら大きいカードに差し替えてから箱を返す）。
  // レンダリング結果は _thumbCache が所有するため、呼び出し元のtrackObjectUrlはもう使わない
  // （引数は既存呼び出し元との互換のため残し、未使用であることを明示するため _ 接頭辞にする）。
  const loadArchiveDriveThumbnails = async (targets, apiBaseUrl, triggerBtn, config, _trackObjectUrl) => {
    triggerBtn.disabled = true;
    triggerBtn.textContent = 'Googleと連携しています...';
    let accessToken;
    try {
      ({ accessToken } = await openGoogleDriveTokenOnly(apiBaseUrl));
    } catch (error) {
      triggerBtn.disabled = false;
      triggerBtn.textContent = '⚠ ' + error.message + '（再試行）';
      return;
    }

    // getThumbBox() は行→カード展開のDOM置換を伴うため、まず全件分を直列に済ませてから
    // 箱の配列を確定し、fetch部分だけを並列化する（DOM置換自体の競合を避けるため）。
    const boxes = targets.map((target) => target.getThumbBox());

    triggerBtn.textContent = 'サムネイルを読み込み中... 0 / ' + boxes.length;
    let done = 0;
    let failed = 0;

    const loadOne = async (box) => {
      const fileId = box.dataset.driveFileId;
      const resourceKey = box.dataset.driveResourceKey || '';

      // レンダリング済みキャッシュがあれば、ダウンロード・変換を一切せず即表示する。
      const cacheKey = 'gdrive:' + fileId + ':default';
      const cachedUrl = getCachedThumbUrl(cacheKey);
      if (cachedUrl) {
        box.textContent = '';
        const cachedImg = document.createElement('img');
        cachedImg.className = 'sim-thumb-img';
        cachedImg.alt = '';
        cachedImg.src = cachedUrl;
        box.appendChild(cachedImg);
        done += 1;
        triggerBtn.textContent = 'サムネイルを読み込み中... ' + done + ' / ' + boxes.length;
        return;
      }

      box.textContent = '';
      const skeleton = document.createElement('div');
      skeleton.className = 'sim-skeleton';
      box.appendChild(skeleton);
      try {
        // バイナリ直送: base64化（+33%膨張）とJSON.stringifyの追加コピーを避ける
        // （/index と同じ方式）。レンダリング結果はキャッシュが所有するため、
        // trackObjectUrlには渡さない。
        const blob = await fetchDriveFileBlob(fileId, accessToken, resourceKey);
        const res = await fetch(apiBaseUrl + '/render-thumbnail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', ...apiKeyHeader(config.apiKey) },
          body: blob
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blobUrl = URL.createObjectURL(await res.blob());
        putCachedThumbUrl(cacheKey, blobUrl);
        const img = document.createElement('img');
        img.className = 'sim-thumb-img';
        img.alt = '';
        img.src = blobUrl;
        box.textContent = '';
        box.appendChild(img);
      } catch (error) {
        failed += 1;
        box.textContent = '📁';
      }
      done += 1;
      triggerBtn.textContent = 'サムネイルを読み込み中... ' + done + ' / ' + boxes.length;
    };

    // 共有インデックスを複数ワーカーが消費するシンプルなワーカープール（並列度3）。
    let nextIndex = 0;
    const runWorker = async () => {
      while (nextIndex < boxes.length) {
        const box = boxes[nextIndex];
        nextIndex += 1;
        await loadOne(box);
      }
    };
    const workerCount = Math.min(ARCHIVE_THUMB_CONCURRENCY, boxes.length) || 1;
    await Promise.all(Array.from({ length: workerCount }, runWorker));

    triggerBtn.textContent = failed
      ? '読み込み完了（' + failed + '件失敗）'
      : 'サムネイル読み込み済み';
  };

  // 検索中ステータス（スピナー＋経過に応じた文言）を statusEl に表示する
  const showSearchingStatus = (statusEl) => {
    statusEl.innerHTML = '';
    const spinner = document.createElement('div');
    spinner.className = 'pb-spinner';
    const text = document.createElement('span');
    statusEl.append(spinner, text);
    const stop = startProgressiveStatus((msg) => { text.textContent = msg; }, SEARCH_PHASES);
    return () => { stop(); statusEl.innerHTML = ''; };
  };

  // 検索実行（進行表示・エラー日本語化・再試行を共通化）
  const runSimilarSearch = ({ apiBaseUrl, config, payload, statusEl, confidenceEl, listEl, onData, emptyActions, trackObjectUrl }) => {
    listEl.textContent = '';
    confidenceEl.hidden = true;
    const stopStatus = showSearchingStatus(statusEl);

    fetch(apiBaseUrl + '/similar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...apiKeyHeader(config.apiKey) },
      body: JSON.stringify(payload)
    })
      .then(async (response) => {
        if (!response.ok) {
          let detail = '';
          try { detail = (await response.json()).error || ''; } catch (_) {}
          const error = new Error(describeApiError(response.status, detail));
          error.handled = true;
          throw error;
        }
        return response.json();
      })
      .then(async (data) => {
        stopStatus();
        if (onData) onData(data);

        // 高速サムネイル: 有効なテナントのみ、kintone結果（アーカイブ以外）の
        // recordIdをまとめて復号取得してから描画する。/thumbsは1リクエストのみで
        // 通常は数百msのため描画前に待っても体感の遅れにはならないが、失敗・遅延に
        // 備えて2秒でタイムアウトし、従来表示（都度取得）にフォールバックする。
        let thumbUrlMap = new Map();
        if (getThumbKey(config)) {
          const results = Array.isArray(data && data.results) ? data.results : [];
          const recordIds = results
            .filter((item) => item.docType !== 'archive' && item.recordId)
            .map((item) => item.recordId);
          if (recordIds.length) {
            const thumbsPromise = fetchDecryptedThumbs(apiBaseUrl, config, recordIds);
            const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(new Map()), 2000));
            thumbUrlMap = await Promise.race([thumbsPromise, timeoutPromise]);
          }
        }

        renderSimilarList(listEl, statusEl, confidenceEl, data, apiBaseUrl, {
          config,
          trackObjectUrl,
          debug: isDebugEnabled(config),
          emptyActions: emptyActions ? emptyActions() : undefined,
          thumbUrlMap
        });

        // 件数が limit に達しているときだけ「さらに表示」を出す（＝もっとある可能性がある場合）。
        // 未達なら、それ以上の候補は存在しないということなので出さない。
        const results = Array.isArray(data && data.results) ? data.results : [];
        if (payload.limit && results.length >= payload.limit) {
          const moreBtn = document.createElement('button');
          moreBtn.type = 'button';
          moreBtn.className = 'btn-secondary';
          moreBtn.style.cssText = 'margin-top:12px;';
          moreBtn.textContent = 'さらに表示（+10件）';
          moreBtn.addEventListener('click', () => {
            payload.limit += 10;
            runSimilarSearch({ apiBaseUrl, config, payload, statusEl, confidenceEl, listEl, onData, emptyActions, trackObjectUrl });
          });
          listEl.appendChild(moreBtn);
        }
      })
      .catch((error) => {
        stopStatus();
        const message = error.handled ? error.message : describeApiError(0, error.message);
        listEl.textContent = '';
        const errBox = document.createElement('div');
        errBox.className = 'sim-note';
        errBox.textContent = '⚠ ' + message;
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'btn-secondary';
        retryBtn.textContent = '再試行';
        retryBtn.style.cssText = 'margin-top:4px;';
        retryBtn.addEventListener('click', () => {
          runSimilarSearch({ apiBaseUrl, config, payload, statusEl, confidenceEl, listEl, onData, emptyActions, trackObjectUrl });
        });
        listEl.append(errBox, retryBtn);
      });
  };

  const openSimilarModal = (config, apiBaseUrl, event) => {
    const fileMeta = getFirstFile(event.record, config.pdfFileField);
    const shell = createModalShell();
    shell.host.id = 'pb-similar-host';
    shell.modal.classList.add('wide');
    const content = shell.content;

    const header = document.createElement('div');
    header.className = 'modal-header';
    const titleWrap = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = '類似図面検索';
    const sub = document.createElement('div');
    sub.className = 'modal-sub';
    sub.textContent = 'この図面と形が近い登録済み図面を検索します';
    titleWrap.append(title, sub);
    header.appendChild(titleWrap);

    const layout = document.createElement('div');
    layout.className = 'form-layout';

    const preview = buildPreviewPanel(
      fileMeta ? (fileMeta.name || '') : '自分の図面',
      shell.trackObjectUrl,
      { apiBaseUrl, config, cacheKey: fileMeta ? fileMeta.fileKey : undefined }
    );
    const previewPanel = preview.panel;
    if (fileMeta) {
      downloadKintoneFile(fileMeta.fileKey)
        .then((blob) => preview.showBlob(blob))
        .catch((error) => preview.showMessage('プレビューを表示できません: ' + error.message));
    } else {
      preview.showMessage('PDFが登録されていません');
    }

    const queryShapeTagsEl = document.createElement('div');
    queryShapeTagsEl.className = 'sim-shape-tags';
    previewPanel.appendChild(queryShapeTagsEl);

    const formPanel = document.createElement('div');
    formPanel.className = 'form-panel';

    const statusEl = document.createElement('div');
    statusEl.className = 'sim-status';

    const confidenceEl = document.createElement('div');
    confidenceEl.className = 'sim-confidence';
    confidenceEl.hidden = true;

    const listEl = document.createElement('div');
    listEl.className = 'sim-results';

    formPanel.append(statusEl, confidenceEl, listEl);
    layout.append(previewPanel, formPanel);
    attachPanelResizer(layout, previewPanel, formPanel);
    content.append(header, layout);

    runSimilarSearch({
      apiBaseUrl,
      config,
      payload: buildRecordPayload(event, config),
      statusEl,
      confidenceEl,
      listEl,
      onData: (data) => {
        const queryShapeTags = data && data.extracted && data.extracted.shapeTags;
        const queryShapeTagsChips = buildShapeTagsEl(queryShapeTags);
        if (queryShapeTagsChips) {
          queryShapeTagsEl.replaceWith(queryShapeTagsChips);
        }
      },
      trackObjectUrl: shell.trackObjectUrl
    });
  };

  // 共通のドロップゾーンを組み立てる（onFile に選択された File を渡す）
  const buildDropzone = ({ main, sub, note, onFile }) => {
    const dropWrap = document.createElement('div');
    dropWrap.className = 'dropzone';
    const icon = document.createElement('div');
    icon.className = 'drop-icon';
    icon.textContent = '📄';
    const mainEl = document.createElement('div');
    mainEl.className = 'drop-main';
    mainEl.textContent = main;
    const subEl = document.createElement('div');
    subEl.className = 'drop-sub';
    subEl.textContent = sub;
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,.tif,.tiff,application/pdf,image/tiff';
    fileInput.className = 'file-input';
    dropWrap.append(icon, mainEl, subEl, fileInput);
    if (note) {
      const noteEl = document.createElement('div');
      noteEl.className = 'drop-note';
      noteEl.textContent = note;
      dropWrap.appendChild(noteEl);
    }

    // ドロップゾーン下部にエラー/警告をインライン表示する（ブラウザのalert代替）。
    const errorEl = document.createElement('div');
    errorEl.className = 'drop-error';
    errorEl.hidden = true;
    dropWrap.appendChild(errorEl);

    const showDropMessage = (message, kind) => {
      errorEl.textContent = message;
      errorEl.className = 'drop-error drop-error-' + kind;
      errorEl.hidden = false;
    };
    const clearDropMessage = () => {
      errorEl.hidden = true;
      errorEl.textContent = '';
    };

    const acceptFiles = (files) => {
      clearDropMessage();
      const file = files && files[0];
      if (!file || !(file.type === 'application/pdf' || file.type === 'image/tiff' || /\.(pdf|tiff?)$/i.test(file.name))) {
        showDropMessage('PDFまたはTIFファイルを選択してください。', 'error');
        return;
      }
      if (files.length > 1) {
        // 処理は続行する警告なので onFile は呼ぶ（エラーとは異なり止めない）
        showDropMessage('複数のファイルが選択されました。1件目「' + file.name + '」のみ使用します。', 'warn');
      }
      onFile(file);
    };

    dropWrap.addEventListener('click', (e) => {
      if (e.target !== fileInput) fileInput.click();
    });
    dropWrap.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropWrap.classList.add('drag-over');
    });
    dropWrap.addEventListener('dragleave', () => dropWrap.classList.remove('drag-over'));
    dropWrap.addEventListener('drop', (e) => {
      e.preventDefault();
      dropWrap.classList.remove('drag-over');
      acceptFiles(e.dataTransfer && e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => {
      acceptFiles(fileInput.files);
    });
    return dropWrap;
  };

  // 一覧画面：kintone に登録せず、手元の PDF をアップロードしてその場で類似検索する。
  const openUploadSimilarModal = (config, apiBaseUrl) => {
    const shell = createModalShell();
    shell.host.id = 'pb-upload-similar-host';
    const { modal, content, closeModal, trackObjectUrl } = shell;

    const clear = () => { content.textContent = ''; };

    // --- State: 検索結果（プレビュー＋候補一覧） ---
    const showResultsState = (file) => {
      clear();
      modal.classList.add('wide');

      const header = document.createElement('div');
      header.className = 'modal-header';
      const titleWrap = document.createElement('div');
      const title = document.createElement('h2');
      title.textContent = '類似図面検索（アップロード）';
      const sub = document.createElement('div');
      sub.className = 'modal-sub';
      sub.textContent = 'このPDFはkintoneには登録されません';
      titleWrap.append(title, sub);

      const headerActions = document.createElement('div');
      headerActions.className = 'modal-header-actions';
      const reSearchBtn = document.createElement('button');
      reSearchBtn.type = 'button';
      reSearchBtn.className = 'btn-mini';
      reSearchBtn.textContent = '別のPDFで検索';
      reSearchBtn.addEventListener('click', showDropState);
      const registerThisBtn = document.createElement('button');
      registerThisBtn.type = 'button';
      registerThisBtn.className = 'btn-mini accent';
      registerThisBtn.textContent = 'この図面を登録';
      registerThisBtn.addEventListener('click', () => {
        closeModal();
        openRegisterModal(config, apiBaseUrl, { initialFile: file });
      });
      headerActions.append(reSearchBtn, registerThisBtn);
      header.append(titleWrap, headerActions);

      const layout = document.createElement('div');
      layout.className = 'form-layout';

      const preview = buildPreviewPanel(file.name || '', trackObjectUrl, { apiBaseUrl, config });
      preview.showBlob(file);
      const previewPanel = preview.panel;

      const formPanel = document.createElement('div');
      formPanel.className = 'form-panel';
      const statusEl = document.createElement('div');
      statusEl.className = 'sim-status';
      const confidenceEl = document.createElement('div');
      confidenceEl.className = 'sim-confidence';
      confidenceEl.hidden = true;
      const listEl = document.createElement('div');
      listEl.className = 'sim-results';
      formPanel.append(statusEl, confidenceEl, listEl);

      layout.append(previewPanel, formPanel);
      attachPanelResizer(layout, previewPanel, formPanel);
      content.append(header, layout);

      // 0件時は「この図面を登録」への導線をエンプティステートにも出す
      const buildEmptyActions = () => {
        const registerBtn = document.createElement('button');
        registerBtn.type = 'button';
        registerBtn.className = 'btn-primary';
        registerBtn.style.cssText = 'flex:0 0 auto; min-width:180px;';
        registerBtn.textContent = 'この図面を登録する';
        registerBtn.addEventListener('click', () => {
          closeModal();
          openRegisterModal(config, apiBaseUrl, { initialFile: file });
        });
        return [registerBtn];
      };

      toBase64(file).then((pdfBase64) => {
        runSimilarSearch({
          apiBaseUrl,
          config,
          payload: {
            appId: kintone.app.getId(),
            tenantId: deriveTenantId(),
            pdf_base64: pdfBase64,
            fileName: file.name || '',
            limit: 10
          },
          statusEl,
          confidenceEl,
          listEl,
          emptyActions: buildEmptyActions,
          trackObjectUrl
        });
      }).catch((error) => {
        statusEl.textContent = 'ファイルの読み込みに失敗しました: ' + error.message;
      });
    };

    // --- State: ドロップ ---
    const showDropState = () => {
      clear();
      modal.classList.remove('wide');

      const title = document.createElement('h2');
      title.textContent = '手元の図面で類似検索';

      const dropWrap = buildDropzone({
        main: 'PDF / TIF をここにドロップ',
        sub: 'またはクリックしてファイルを選択（kintoneには登録されません）',
        note: '※ 図面の1ページ目を使って検索します',
        onFile: showResultsState
      });

      content.append(title, dropWrap);
    };

    showDropState();
  };

  // === インデックス状況チェック（kintone ⇔ Qdrant の整合性確認） ===
  // 未登録（kintoneにあるが検索に出ない）・要更新（PDF差し替え済みでベクトルが古い）・
  // 孤児（レコード削除済みなのに検索に出る）を検知し、その場で修復できるようにする。
  const openIndexStatusModal = (config, apiBaseUrl, options = {}) => {
    if (!config.pdfFileField) {
      showPluginToast('プラグイン設定でPDFファイルフィールドコードを設定してください。', 'error');
      return;
    }
    // bulkMode: 「一括図面登録」メニューから開いた場合。状況チェックの結果画面に
    // 「全件登録」ボタンと案内文を追加し、まず状況を確認してから実行範囲を選べるようにする。
    const bulkMode = !!options.bulkMode;
    const shell = createModalShell();
    shell.host.id = 'pb-index-status-host';
    const { content, closeModal } = shell;
    const appId = kintone.app.getId();
    const tenantId = deriveTenantId();

    const recordLink = (entry) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '/k/' + appId + '/show#record=' + encodeURIComponent(entry.recordId);
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = entry.drawingNo || ('レコード ' + entry.recordId);
      li.appendChild(a);
      return li;
    };

    const buildSection = (label, entries, { linkable = true, max = 100 } = {}) => {
      const section = document.createElement('div');
      section.className = 'diff-section';
      const title = document.createElement('div');
      title.className = 'diff-title';
      title.textContent = label + '（' + entries.length + '件）';
      const list = document.createElement('ul');
      list.className = 'diff-list';
      entries.slice(0, max).forEach((entry) => {
        if (linkable) {
          list.appendChild(recordLink(entry));
        } else {
          const li = document.createElement('li');
          li.textContent = 'レコード ' + entry.recordId + '（kintone側に存在しません）';
          list.appendChild(li);
        }
      });
      if (entries.length > max) {
        const li = document.createElement('li');
        li.textContent = '… 他 ' + (entries.length - max) + ' 件';
        list.appendChild(li);
      }
      section.append(title, list);
      return section;
    };

    const run = async () => {
      content.textContent = '';
      const title = document.createElement('h2');
      title.textContent = bulkMode ? '一括図面登録' : 'インデックス状況チェック';
      const statusEl = document.createElement('div');
      statusEl.className = 'status-line';
      const spinner = document.createElement('div');
      spinner.className = 'pb-spinner';
      const statusText = document.createElement('span');
      statusText.textContent = bulkMode
        ? '登録前の状況を確認しています...'
        : 'kintoneレコードと検索インデックスを照合しています...';
      statusEl.append(spinner, statusText);
      content.append(title, statusEl);

      let records;
      let indexItems;
      try {
        const fields = ['$id', config.pdfFileField];
        if (config.drawingNoField) fields.push(config.drawingNoField);
        const [recordsResult, statusRes] = await Promise.all([
          fetchAllRecords(appId, fields, () => {}, { requested: false }),
          fetch(apiBaseUrl + '/index-status?tenantId=' + encodeURIComponent(tenantId) +
            '&appId=' + encodeURIComponent(String(appId || '')), {
            headers: apiKeyHeader(config.apiKey)
          })
        ]);
        records = recordsResult.records;
        if (!statusRes.ok) {
          let detail = '';
          try { detail = (await statusRes.json()).error || ''; } catch (_) {}
          throw new Error(describeApiError(statusRes.status, detail));
        }
        const statusData = await statusRes.json();
        indexItems = Array.isArray(statusData.items) ? statusData.items : [];
      } catch (error) {
        statusEl.remove();
        const err = document.createElement('div');
        err.className = 'sim-note';
        err.textContent = '⚠ 照合に失敗しました: ' + error.message;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'btn-secondary';
        retry.textContent = '再試行';
        retry.addEventListener('click', run);
        content.append(err, retry);
        return;
      }

      // --- 突き合わせ ---
      const indexMap = new Map(indexItems.map((it) => [String(it.recordId), String(it.fileKey || '')]));
      const drawingNoOf = (record) => config.drawingNoField && record[config.drawingNoField]
        ? String(record[config.drawingNoField].value || '') : '';
      const ok = [];
      const unindexed = [];
      const stale = [];
      const noPdf = [];
      const kintoneIds = new Set();
      for (const record of records) {
        const recordId = String(record['$id'].value);
        kintoneIds.add(recordId);
        const fileField = record[config.pdfFileField];
        const files = fileField && Array.isArray(fileField.value) ? fileField.value : [];
        const entry = { recordId, drawingNo: drawingNoOf(record) };
        if (!files.length) { noPdf.push(entry); continue; }
        const indexedFileKey = indexMap.get(recordId);
        if (indexedFileKey === undefined) { unindexed.push(entry); continue; }
        // file_key 未記録の旧データは差分判定不能のため OK 扱い
        if (indexedFileKey && indexedFileKey !== String(files[0].fileKey)) { stale.push(entry); continue; }
        ok.push(entry);
      }
      const orphans = [...indexMap.keys()]
        .filter((id) => !kintoneIds.has(id))
        .map((recordId) => ({ recordId }));

      // --- 結果表示 ---
      content.textContent = '';
      content.appendChild(title);

      if (bulkMode) {
        const sub = document.createElement('div');
        sub.className = 'modal-sub';
        sub.textContent = '登録前に現在の状況を確認しました。実行する範囲を選んでください。';
        content.appendChild(sub);
      }

      const grid = document.createElement('div');
      grid.className = 'stat-grid';
      [
        { num: ok.length, label: '登録済み', cls: 'ok' },
        { num: unindexed.length, label: '未登録', cls: unindexed.length ? 'warn' : '' },
        { num: stale.length, label: '要更新', cls: stale.length ? 'warn' : '' },
        { num: orphans.length, label: '孤児', cls: orphans.length ? 'err' : '' }
      ].forEach(({ num, label, cls }) => {
        const card = document.createElement('div');
        card.className = 'stat-card' + (cls ? ' ' + cls : '');
        const n = document.createElement('div');
        n.className = 'stat-num';
        n.textContent = String(num);
        const l = document.createElement('div');
        l.className = 'stat-label';
        l.textContent = label;
        card.append(n, l);
        grid.appendChild(card);
      });
      content.appendChild(grid);

      if (!unindexed.length && !stale.length && !orphans.length) {
        const done = document.createElement('div');
        done.className = 'result-wrap result-ok';
        done.innerHTML = '<div class="result-icon">✓</div><div class="result-msg">kintoneと検索インデックスは一致しています。</div>';
        content.appendChild(done);
        if (bulkMode) {
          const note = document.createElement('div');
          note.className = 'diff-note';
          note.textContent = 'すべて登録済みです。ベクトルを再計算したい場合のみ全件登録を実行してください。';
          content.appendChild(note);
        }
      }
      if (unindexed.length) content.appendChild(buildSection('未登録（検索に出ません）', unindexed));
      if (stale.length) content.appendChild(buildSection('要更新（PDFが差し替えられています）', stale));
      if (orphans.length) content.appendChild(buildSection('孤児（レコード削除済み・検索結果に残っています）', orphans, { linkable: false }));
      if (noPdf.length) {
        const note = document.createElement('div');
        note.className = 'diff-note';
        note.textContent = '※ PDF未添付のレコードが ' + noPdf.length + ' 件あります（チェック対象外）。';
        content.appendChild(note);
      }

      // --- アクション ---
      const actions = document.createElement('div');
      actions.className = 'form-actions';

      const runFiltered = (label, entries) => {
        closeModal();
        const overlay = createBulkModal();
        overlay.querySelector('.pb-bulk-title').textContent = label;
        runBulkIndex(overlay, config, apiBaseUrl, {
          onlyRecordIds: new Set(entries.map((entry) => entry.recordId))
        });
      };

      if (unindexed.length) {
        const registerBtn = document.createElement('button');
        registerBtn.type = 'button';
        registerBtn.className = 'btn-primary';
        registerBtn.textContent = '未登録を登録（' + unindexed.length + '件）';
        registerBtn.addEventListener('click', () => runFiltered('未登録レコードの登録', unindexed));
        actions.appendChild(registerBtn);
      }
      if (stale.length) {
        const staleBtn = document.createElement('button');
        staleBtn.type = 'button';
        staleBtn.className = unindexed.length ? 'btn-secondary' : 'btn-primary';
        staleBtn.textContent = '要更新を再登録（' + stale.length + '件）';
        staleBtn.addEventListener('click', () => runFiltered('要更新レコードの再登録', stale));
        actions.appendChild(staleBtn);
      }
      if (bulkMode) {
        // 全件登録の対象は PDF が添付されている全レコード（登録済み＋未登録＋要更新）。
        // 差分がある場合は「未登録を登録」等が主要ボタンになるため、全件登録は常に補助扱い。
        const allEntries = [...ok, ...unindexed, ...stale];
        if (allEntries.length) {
          const allBtn = document.createElement('button');
          allBtn.type = 'button';
          allBtn.className = 'btn-secondary';
          allBtn.textContent = '全件登録（' + allEntries.length + '件）';
          allBtn.addEventListener('click', () => runFiltered('一括図面登録（全件）', allEntries));
          actions.appendChild(allBtn);
        }
      }
      if (orphans.length) {
        const orphanBtn = document.createElement('button');
        orphanBtn.type = 'button';
        orphanBtn.className = 'btn-danger';
        orphanBtn.textContent = '孤児を削除（' + orphans.length + '件）';
        orphanBtn.addEventListener('click', async () => {
          orphanBtn.disabled = true;
          let done = 0;
          for (const orphan of orphans) {
            try {
              await fetch(apiBaseUrl + '/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...apiKeyHeader(config.apiKey) },
                body: JSON.stringify({
                  appId: String(appId || ''),
                  recordId: orphan.recordId,
                  tenantId
                })
              });
            } catch (_) { /* 個別失敗は再チェックで拾う */ }
            done += 1;
            orphanBtn.textContent = '削除中... ' + done + ' / ' + orphans.length;
          }
          run();
        });
        actions.appendChild(orphanBtn);
      }
      const recheckBtn = document.createElement('button');
      recheckBtn.type = 'button';
      recheckBtn.className = 'btn-secondary';
      recheckBtn.textContent = '再チェック';
      recheckBtn.addEventListener('click', run);
      actions.appendChild(recheckBtn);

      content.appendChild(actions);
    };

    run();
  };

  // 過去図面アーカイブの取込状況一覧。/index-status は意図的にアーカイブ点を除外して
  // いるため（孤児誤検知防止）、アーカイブだけを確認できる専用の一覧を別途用意する。
  const openArchiveStatusModal = (config, apiBaseUrl) => {
    const shell = createModalShell();
    shell.host.id = 'pb-archive-status-host';
    const { content } = shell;
    const tenantId = deriveTenantId();

    const run = async () => {
      content.textContent = '';
      const title = document.createElement('h2');
      title.textContent = 'アーカイブ取込状況';
      const statusEl = document.createElement('div');
      statusEl.className = 'status-line';
      const spinner = document.createElement('div');
      spinner.className = 'pb-spinner';
      const statusText = document.createElement('span');
      statusText.textContent = '取込済みのアーカイブを確認しています...';
      statusEl.append(spinner, statusText);
      content.append(title, statusEl);

      let data;
      try {
        const res = await fetch(apiBaseUrl + '/archive-status?tenantId=' + encodeURIComponent(tenantId), {
          headers: apiKeyHeader(config.apiKey)
        });
        if (!res.ok) {
          let detail = '';
          try { detail = (await res.json()).error || ''; } catch (_) {}
          throw new Error(describeApiError(res.status, detail));
        }
        data = await res.json();
      } catch (error) {
        statusEl.remove();
        const err = document.createElement('div');
        err.className = 'sim-note';
        err.textContent = '⚠ 取得に失敗しました: ' + error.message;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'btn-secondary';
        retry.textContent = '再試行';
        retry.addEventListener('click', run);
        content.append(err, retry);
        return;
      }

      content.textContent = '';
      content.appendChild(title);

      if (!data.configured) {
        const note = document.createElement('div');
        note.className = 'sim-note';
        note.textContent = '検索インデックス（Qdrant）が未設定のため確認できません。';
        content.appendChild(note);
        return;
      }

      const sub = document.createElement('div');
      sub.className = 'modal-sub';
      sub.textContent = '取込済み ' + data.count + ' 件（kintoneには登録されていません）';
      content.appendChild(sub);

      const list = document.createElement('ul');
      list.className = 'diff-list';
      list.style.maxHeight = '360px';
      (data.items || []).forEach((item) => {
        const li = document.createElement('li');
        const label = item.drawingNo || item.fileName || item.docId;
        const meta = [item.productName, item.relPath].filter(Boolean).join(' / ');
        const source = item.driveFileId ? '（Google Drive）' : '（ローカル）';
        li.textContent = label + source + (meta ? ' — ' + meta : '');
        list.appendChild(li);
      });
      if (!data.items || !data.items.length) {
        const li = document.createElement('li');
        li.textContent = 'まだアーカイブの取込はありません。';
        list.appendChild(li);
      }
      content.appendChild(list);
    };

    run();
  };

  // === 図面プレビューのギャラリービュー ===
  // カスタマイズビュー（一覧設定で作るHTMLビュー）のHTMLに
  // <div id="pb-drawing-gallery"></div> を置くだけで、図面サムネイルのカードグリッドを
  // 描画する。一覧の絞り込み（kintone.app.getQueryCondition）を尊重し、20件ずつページングする。
  const GALLERY_PAGE_SIZE = 20;
  const GALLERY_THUMB_CONCURRENCY = 3;

  // 並列度を制限したシンプルなタスクキュー。ここで作るインスタンスはギャラリーの
  // 1描画セッション（renderDrawingGallery 1回の呼び出し）につき1つで、「さらに表示」で
  // 追加されたサムネイル取得タスクも同じキューに積む（同時に走るのは最大 limit 件まで）。
  const createConcurrencyQueue = (limit) => {
    const pending = [];
    let active = 0;
    const pump = () => {
      while (active < limit && pending.length) {
        const task = pending.shift();
        active += 1;
        Promise.resolve()
          .then(task)
          .catch(() => { /* loadThumbnail側で再取得ボタンを出すのでここでは無視 */ })
          .finally(() => {
            active -= 1;
            pump();
          });
      }
    };
    return (task) => {
      pending.push(task);
      pump();
    };
  };

  // config: プラグイン設定（pdfFileField/drawingNoField/productNameFieldを使用）。
  // apiBaseUrl: サムネイル変換API（未設定でもギャラリー自体は表示し、サムネイルだけ「画像なし」になる）。
  // galleryEl: <div id="pb-drawing-gallery"> 本体。二重描画防止のため呼び出し側でチェック済みの前提。
  const renderDrawingGallery = (config, apiBaseUrl, galleryEl) => {
    // 描画済みマーカー。ビュー切替でこの要素ごとDOMが作り直されたときだけ、
    // 呼び出し側（app.record.index.show）が再度このマーカー無しを検知して呼び直す。
    galleryEl.dataset.pbRendered = '1';
    galleryEl.textContent = '';
    galleryEl.classList.add('pb-gallery-root');

    if (!config.pdfFileField) {
      const note = document.createElement('div');
      note.className = 'pb-gallery-note';
      note.textContent = '図面ギャラリーを表示するには、プラグイン設定で図面PDFの添付ファイルフィールドを指定してください。';
      galleryEl.appendChild(note);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'pb-gallery-grid';
    galleryEl.appendChild(grid);

    const moreWrap = document.createElement('div');
    moreWrap.className = 'pb-gallery-more-wrap';
    galleryEl.appendChild(moreWrap);

    // サムネイルはレンダリング済みキャッシュ（_thumbCache）が所有するblob URLを使い回すため、
    // trackObjectUrl（モーダルclose時の解放用）は何もしない関数を渡せばよい。
    const noop = () => {};
    const enqueueThumb = createConcurrencyQueue(GALLERY_THUMB_CONCURRENCY);

    const appId = kintone.app.getId();
    const fields = ['$id', config.drawingNoField, config.productNameField, config.pdfFileField].filter(Boolean);
    const baseQuery = kintone.app.getQueryCondition() || '';

    let offset = 0;
    let totalCount = 0;
    let loading = false;

    // thumbUrlMap: 高速サムネイルで復号済みのblob URL（recordId(string)→URL）。
    // ヒットしたレコードはキューに積まず即座に表示する。
    const buildCard = (record, thumbUrlMap) => {
      const recordId = record.$id && record.$id.value;
      const card = document.createElement('div');
      card.className = 'pb-gallery-card';
      card.addEventListener('click', () => {
        // 一覧URL（/k/123/ やゲストスペースの /g/1/123/ 等）からの相対で遷移するため、
        // ドメイン・スペース構成に関わらず壊れない。
        location.href = location.pathname + 'show#record=' + recordId;
      });

      const file = getFirstFile(record, config.pdfFileField);
      const thumbUrl = thumbUrlMap ? thumbUrlMap.get(String(recordId)) : undefined;
      let thumbBox;
      if (thumbUrl) {
        thumbBox = buildThumbnailBox(apiBaseUrl, file && file.fileKey, false, config, noop, 'pb-gallery-thumb', thumbUrl);
      } else if (file && file.fileKey) {
        // autoLoad: false でボックスだけ作り、実際の取得はギャラリー側の同時実行数キューに委ねる
        // （20件同時に自動取得するとダウンロード＋サーバー変換が集中するため）。
        thumbBox = buildThumbnailBox(apiBaseUrl, file.fileKey, false, config, noop, 'pb-gallery-thumb');
        enqueueThumb(() => loadThumbnail(thumbBox, apiBaseUrl, file.fileKey, config, noop));
      } else {
        thumbBox = document.createElement('div');
        thumbBox.className = 'pb-gallery-thumb pb-gallery-thumb-empty';
        thumbBox.textContent = 'ファイルなし';
      }
      card.appendChild(thumbBox);

      const drawingNo = config.drawingNoField ? getFieldValue(record, config.drawingNoField) : '';
      const productName = config.productNameField ? getFieldValue(record, config.productNameField) : '';
      if (drawingNo || productName) {
        const caption = document.createElement('div');
        caption.className = 'pb-gallery-caption';
        if (drawingNo) {
          const noEl = document.createElement('div');
          noEl.className = 'pb-gallery-drawing-no';
          noEl.textContent = drawingNo;
          caption.appendChild(noEl);
        }
        if (productName) {
          const nameEl = document.createElement('div');
          nameEl.className = 'pb-gallery-product-name';
          nameEl.textContent = productName;
          caption.appendChild(nameEl);
        }
        card.appendChild(caption);
      }

      return card;
    };

    // 総件数から残り件数を算出し、「さらに表示」ボタンを出す/隠すを切り替える。
    const renderMoreButton = () => {
      moreWrap.textContent = '';
      const remaining = totalCount - offset;
      if (remaining <= 0) {
        return;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pb-gallery-more-btn';
      btn.textContent = 'さらに表示（残り' + remaining + '件）';
      btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = '読み込み中...';
        loadPage();
      });
      moreWrap.appendChild(btn);
    };

    const renderLoadError = () => {
      moreWrap.textContent = '';
      const err = document.createElement('div');
      err.className = 'pb-gallery-note pb-gallery-note-error';
      err.textContent = '図面の取得に失敗しました。';
      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'pb-gallery-more-btn';
      retryBtn.textContent = '再試行';
      retryBtn.addEventListener('click', () => loadPage());
      moreWrap.append(err, retryBtn);
    };

    const loadPage = () => {
      if (loading) {
        return;
      }
      loading = true;
      const query = baseQuery + ' order by $id desc limit ' + GALLERY_PAGE_SIZE + ' offset ' + offset;
      kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
        app: appId,
        query,
        fields,
        totalCount: true
      }).then(async (resp) => {
        loading = false;
        totalCount = Number(resp.totalCount || 0);
        const records = resp.records || [];

        if (offset === 0 && !records.length) {
          moreWrap.textContent = '';
          const empty = document.createElement('div');
          empty.className = 'pb-gallery-empty';
          empty.textContent = 'レコードがありません。';
          galleryEl.insertBefore(empty, moreWrap);
          return;
        }

        // 高速サムネイル: このページの分をまとめて復号取得してから描画する
        // （機能オフ時は getThumbKey が空のため fetchDecryptedThumbs は即座に空Mapを返し、
        // 追加リクエストは一切発生しない）。
        const recordIds = records.map((record) => record.$id && record.$id.value).filter(Boolean);
        const thumbUrlMap = await fetchDecryptedThumbs(apiBaseUrl, config, recordIds);

        records.forEach((record) => {
          grid.appendChild(buildCard(record, thumbUrlMap));
        });
        offset += records.length;
        renderMoreButton();
      }).catch((error) => {
        loading = false;
        console.warn('[pb] 図面ギャラリーの取得に失敗しました', error);
        renderLoadError();
      });
    };

    loadPage();
  };

  kintone.events.on('app.record.index.show', (event) => {
    const config = kintone.plugin.app.getConfig(PLUGIN_ID);
    const apiBaseUrl = normalizeBaseUrl(config.apiBaseUrl);

    // 図面プレビューのギャラリービュー: カスタマイズビューのHTMLに
    // <div id="pb-drawing-gallery"></div> があれば描画する。kintoneの一覧はビュー切替の
    // たびにDOMを作り直すのでこのハンドラも毎回発火し直すが、描画済みマーカー
    // （dataset.pbRendered）が無い＝新しく現れた要素のときだけ改めて描画する。
    const galleryEl = document.getElementById('pb-drawing-gallery');
    if (galleryEl && !galleryEl.dataset.pbRendered) {
      renderDrawingGallery(config, apiBaseUrl, galleryEl);
    }

    if (document.getElementById('pb-list-btns')) {
      return event;
    }

    if (!apiBaseUrl) {
      return event;
    }

    const header = kintone.app.getHeaderMenuSpaceElement();
    if (!header) {
      return event;
    }

    const group = document.createElement('div');
    group.id = 'pb-list-btns';
    group.className = 'pb-btn-group';

    const registerBtn = createHeaderButton({ id: 'pb-register-btn', label: '図面登録', variant: 'primary', icon: 'plus' });
    registerBtn.addEventListener('click', () => {
      openRegisterModal(config, apiBaseUrl);
    });
    group.appendChild(registerBtn);

    const uploadSearchBtn = createHeaderButton({ id: 'pb-upload-search-btn', label: '図面検索', variant: 'secondary', icon: 'upload' });
    uploadSearchBtn.addEventListener('click', () => {
      if (document.getElementById('pb-upload-similar-host')) {
        return;
      }
      openUploadSimilarModal(config, apiBaseUrl);
    });
    group.appendChild(uploadSearchBtn);

    // 管理系のアクションは「管理」メニューに集約する。
    // 今後機能が増えてもヘッダーのボタンを増やさず、メニュー項目を足すだけで済む。
    const menuItems = [{
      label: 'インデックス状況チェック',
      description: 'kintoneと検索インデックスの差分を確認・修復',
      onClick: () => {
        if (document.getElementById('pb-index-status-host')) return;
        openIndexStatusModal(config, apiBaseUrl);
      }
    }];
    // 一括図面登録は設定でオフにできる（既定は表示）。
    // 即時実行はせず、まずインデックス状況チェックを表示してから実行範囲を選んでもらう。
    if (config.showBulkButton !== 'false') {
      menuItems.push({
        label: '一括図面登録',
        description: '登録状況を確認してから一括登録',
        onClick: () => {
          if (document.getElementById('pb-index-status-host') || document.getElementById('pb-bulk-overlay')) return;
          openIndexStatusModal(config, apiBaseUrl, { bulkMode: true });
        }
      });
      menuItems.push({
        label: '複数PDF登録',
        description: '手元のPDF/TIFからレコード作成と検索登録をまとめて実行',
        onClick: () => {
          if (document.getElementById('pb-bulk-pdf-select-host') || document.getElementById('pb-bulk-pdf-overlay')) return;
          openBulkPdfRegisterModal(config, apiBaseUrl);
        }
      });
    }
    // 過去図面アーカイブ取り込みは設定でオフにできる（既定は表示）。
    if (config.showArchiveButton !== 'false') {
      menuItems.push({
        label: '過去図面アーカイブ取り込み',
        description: 'フォルダをまとめて検索対象に追加（kintoneには登録しません）',
        onClick: () => {
          if (document.getElementById('pb-archive-select-host') || document.getElementById('pb-archive-overlay')) return;
          openArchiveIngestModal(config, apiBaseUrl);
        }
      });
      menuItems.push({
        label: 'アーカイブ取込状況',
        description: '取込済みの過去図面アーカイブを一覧で確認',
        onClick: () => {
          if (document.getElementById('pb-archive-status-host')) return;
          openArchiveStatusModal(config, apiBaseUrl);
        }
      });
    }
    group.appendChild(createManageMenu(menuItems));

    header.appendChild(group);

    return event;
  });
})();
