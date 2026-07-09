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

  const confidenceLabel = (level) => ({
    high: '高',
    medium: '中',
    low: '低'
  }[level] || '-');

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

  // --- ヘッダーボタン（アイコン付き・SaaS 風） ---
  const PB_ICONS = {
    search: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>',
    upload: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"></path><path d="m7 8 5-5 5 5"></path><path d="M5 21h14"></path></svg>',
    plus: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
    layers: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 9 5-9 5-9-5 9-5Z"></path><path d="m3 12 9 5 9-5"></path><path d="m3 17 9 5 9-5"></path></svg>',
    refresh: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v5h-5"></path></svg>',
    gear: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"></path></svg>'
  };

  const createHeaderButton = ({ id, label, variant = 'primary', icon }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    if (id) btn.id = id;
    btn.className = 'pb-similarity-button' + (variant && variant !== 'primary' ? ' ' + variant : '');
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

  // PDFプレビューパネル（モーダル左ペイン）の共通ヘルパー。
  // trackUrl に createModalShell の trackObjectUrl を渡すと close 時に blob URL を解放する。
  const buildPreviewPanel = (name, trackUrl) => {
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

    const showBlob = (blobOrFile) => {
      let blobUrl = URL.createObjectURL(blobOrFile);
      if (trackUrl) blobUrl = trackUrl(blobUrl);
      const embed = document.createElement('embed');
      embed.src = blobUrl;
      embed.type = 'application/pdf';
      embed.className = 'preview-embed';
      if (placeholder.parentNode === panel) {
        panel.replaceChild(embed, placeholder);
      } else {
        panel.appendChild(embed);
      }
    };
    const showMessage = (message) => { placeholder.textContent = message; };
    return { panel, showBlob, showMessage };
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

  const THUMBNAIL_AUTO_COUNT = 3;

  // 一覧では上位3件だけ自動でサムネイルを取得し、残りはボタンを押したときだけ取得する。
  // サムネイルはAPI側で都度レンダリングするだけでどこにも保存されない（kintoneが正本のまま）。
  // thumbToken: 認証有効時に /thumbnail が要求する HMAC トークン（/similar の結果に同梱）
  const loadThumbnail = (thumbBox, apiBaseUrl, fileKey, thumbToken) => {
    if (!apiBaseUrl || !fileKey) {
      thumbBox.textContent = '画像なし';
      return;
    }
    // 読み込み中はシマー（スケルトン）を表示し、失敗時は再取得ボタンを出す。
    thumbBox.textContent = '';
    const skeleton = document.createElement('div');
    skeleton.className = 'sim-skeleton';
    thumbBox.appendChild(skeleton);

    const img = document.createElement('img');
    img.className = 'sim-thumb-img';
    img.alt = '';
    img.addEventListener('load', () => {
      thumbBox.textContent = '';
      thumbBox.appendChild(img);
    }, { once: true });
    img.addEventListener('error', () => {
      thumbBox.textContent = '';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'sim-thumb-retry';
      retry.textContent = '再取得';
      retry.addEventListener('click', (e) => {
        e.stopPropagation();
        loadThumbnail(thumbBox, apiBaseUrl, fileKey, thumbToken);
      });
      thumbBox.appendChild(retry);
    }, { once: true });
    img.src = apiBaseUrl + '/thumbnail?fileKey=' + encodeURIComponent(fileKey) +
      (thumbToken ? '&token=' + encodeURIComponent(thumbToken) : '');
  };

  const buildThumbnailBox = (apiBaseUrl, fileKey, autoLoad, thumbToken) => {
    const thumbBox = document.createElement('div');
    thumbBox.className = 'sim-thumb';

    if (autoLoad) {
      loadThumbnail(thumbBox, apiBaseUrl, fileKey, thumbToken);
      return thumbBox;
    }

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'sim-thumb-load';
    loadBtn.textContent = 'プレビュー取得';
    loadBtn.addEventListener('click', () => loadThumbnail(thumbBox, apiBaseUrl, fileKey, thumbToken));
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
              // Register similarity index in the background — do not await so navigation is not blocked
              fetch(apiBaseUrl + '/index', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...apiKeyHeader(config.apiKey) },
                body: JSON.stringify({
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
                  limit: 10
                })
              }).catch(() => {});
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
        window.alert('プラグイン設定でAPI Base URLを設定してください。');
        return;
      }

      const fileMeta = getFirstFile(event.record, config.pdfFileField);
      openRegisterModal(config, apiBaseUrl, {
        recordId: event.recordId,
        fileMeta
      });
    });

    button.addEventListener('click', () => {
      if (!apiBaseUrl) {
        window.alert('プラグイン設定でAPI Base URLを設定してください。');
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

    for (const record of records) {
      if (cancel.requested) {
        break;
      }

      const recordId = record['$id'].value;
      const fileField = config.pdfFileField ? record[config.pdfFileField] : null;
      const files = fileField && Array.isArray(fileField.value) ? fileField.value : [];

      if (!files.length) {
        state.skip += 1;
        state.processed += 1;
        updateBulkModal(overlay, state);
        continue;
      }

      const file = files[0];
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
        limit: 10
      };

      try {
        const response = await fetch(apiBaseUrl + '/index', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...apiKeyHeader(config.apiKey) },
          body: JSON.stringify(payload)
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
    }

    state.phase = cancel.requested ? 'cancelled' : 'done';
    updateBulkModal(overlay, state);
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

  const runArchiveIndex = async (overlay, config, apiBaseUrl, files) => {
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

    for (const file of files) {
      if (cancel.requested) {
        break;
      }

      const relPath = (file.webkitRelativePath || file.name).normalize('NFC');

      try {
        const docId = await sha256Hex(relPath);
        const pdf_base64 = await toBase64(file);
        const response = await fetch(apiBaseUrl + '/archive-index', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...apiKeyHeader(config.apiKey) },
          body: JSON.stringify({ tenantId, appId, docId, relPath, fileName: file.name, pdf_base64 })
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
    noteEl.textContent = '選択したフォルダ内のPDFファイルのみが対象です（原本はそのまま・kintoneには送信されません）';
    const folderInput = document.createElement('input');
    folderInput.type = 'file';
    folderInput.webkitdirectory = true;
    folderInput.multiple = true;
    folderInput.className = 'file-input';
    zone.append(icon, mainEl, subEl, folderInput, noteEl);
    formPanel.appendChild(zone);

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

    let selectedFiles = [];

    zone.addEventListener('click', (e) => {
      if (e.target !== folderInput) folderInput.click();
    });

    folderInput.addEventListener('change', () => {
      selectedFiles = Array.from(folderInput.files || []).filter((f) => /\.pdf$/i.test(f.name));
      if (!selectedFiles.length) {
        statusEl.textContent = 'このフォルダにPDFファイルが見つかりませんでした。';
        startBtn.disabled = true;
        return;
      }
      statusEl.textContent = selectedFiles.length + ' 件のPDFが見つかりました。';
      startBtn.disabled = false;
    });

    startBtn.addEventListener('click', () => {
      const files = selectedFiles;
      shell.closeModal();
      const overlay = createArchiveModal();
      runArchiveIndex(overlay, config, apiBaseUrl, files);
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
    '.preview-panel { flex: 0 0 58%; display: flex; flex-direction: column;',
    '  border-right: 1px solid var(--pb-line); background: var(--pb-bg); min-height: 0; }',
    '.preview-label { padding: 8px 14px; font-size: 11px; color: var(--pb-muted); font-weight: 600;',
    '  background: #fff; border-bottom: 1px solid var(--pb-line); flex-shrink: 0;',
    '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.preview-embed { flex: 1; width: 100%; border: none; display: block; min-height: 0; }',
    '.preview-placeholder { flex: 1; display: flex; align-items: center; justify-content: center;',
    '  color: var(--pb-faint); font-size: 13px; }',
    '.form-panel { flex: 0 0 42%; overflow-y: auto; padding: 20px 24px 28px; }',
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
    '.sim-confidence-level.level-high { background: var(--pb-green-soft); color: #166534; }',
    '.sim-confidence-level.level-medium { background: var(--pb-amber-soft); color: #92400e; }',
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
    '.sim-list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }',
    '.sim-item { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; padding: 12px;',
    '  border: 1px solid var(--pb-line); border-radius: var(--pb-radius); background: #fff;',
    '  transition: border-color .15s, box-shadow .15s; }',
    '.sim-item:hover { border-color: var(--pb-line-2); box-shadow: 0 4px 14px rgba(15,23,42,.07); }',
    '.sim-thumb { display: flex; align-items: center; justify-content: center; box-sizing: border-box;',
    '  width: 68px; height: 68px; border: 1px solid var(--pb-line); border-radius: 8px; background: var(--pb-bg);',
    '  color: var(--pb-faint); font-size: 10px; text-align: center; overflow: hidden; }',
    '.sim-thumb-img { max-width: 100%; max-height: 100%; object-fit: contain; }',
    '.sim-thumb-load { border: none; background: transparent; color: var(--pb-primary); font-size: 10px;',
    '  cursor: pointer; padding: 4px; font-weight: 600; }',
    '.sim-skeleton { width: 100%; height: 100%; border-radius: inherit;',
    '  background: linear-gradient(90deg, #eef1f5 25%, #f7f9fb 50%, #eef1f5 75%);',
    '  background-size: 200% 100%; animation: pb-shimmer 1.3s ease-in-out infinite; }',
    '.sim-thumb-retry { border: none; background: transparent; color: var(--pb-muted); font-size: 10px;',
    '  cursor: pointer; padding: 4px; text-decoration: underline; }',
    '.sim-link { color: var(--pb-primary-hover); font-weight: 700; text-decoration: none; font-size: 13.5px; }',
    '.sim-link:hover { text-decoration: underline; }',
    '.sim-meta { margin-top: 3px; color: var(--pb-muted); font-size: 12px; }',
    '.sim-detail { margin-top: 4px; color: var(--pb-faint);',
    '  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; font-size: 11px; }',
    '.sim-scorebox { display: grid; min-width: 60px; justify-items: end; align-content: start; gap: 4px; }',
    '.sim-vectorraw { color: var(--pb-faint);',
    '  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;',
    '  font-size: 11px; font-weight: 600; }',
    '.sim-score { display: inline-flex; align-items: center; min-height: 24px; padding: 0 10px;',
    '  border-radius: 9999px; font-size: 12.5px; font-weight: 700; background: #f1f5f9; color: var(--pb-ink-2); }',
    '.sim-score.band-high { background: var(--pb-green-soft); color: #166534; }',
    '.sim-score.band-mid { background: var(--pb-amber-soft); color: #92400e; }',
    '.sim-reasons { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }',
    '.sim-reason { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px;',
    '  background: var(--pb-primary-soft); color: var(--pb-primary-hover); font-size: 10.5px; font-weight: 600; }',
    '.sim-thumb-archive { font-size: 26px; }',
    '.sim-archive-badge { display: inline-flex; align-items: center; margin-top: 6px; padding: 2px 8px;',
    '  border-radius: 999px; background: var(--pb-violet-soft); color: var(--pb-violet);',
    '  font-size: 10.5px; font-weight: 700; }',
    // ---- hero cards ----
    '.sim-hero-grid { display: flex; flex-direction: column; gap: 14px; margin-bottom: 18px; }',
    '.sim-hero-card { display: flex; flex-direction: column; padding: 12px; border: 1px solid var(--pb-line);',
    '  border-radius: 14px; background: #fff; transition: border-color .15s, box-shadow .15s; }',
    '.sim-hero-card:hover { border-color: var(--pb-line-2); box-shadow: 0 6px 20px rgba(15,23,42,.08); }',
    '.sim-hero-thumb { position: relative; width: 100%; height: 250px; display: flex;',
    '  align-items: center; justify-content: center; box-sizing: border-box;',
    '  border: 1px solid var(--pb-line); border-radius: 10px; background: var(--pb-bg);',
    '  color: var(--pb-faint); font-size: 13px; text-align: center; overflow: hidden; }',
    '.sim-hero-thumb .sim-thumb-img { width: 100%; height: 100%; object-fit: contain; }',
    '.sim-hero-score { position: absolute; top: 10px; right: 10px; padding: 4px 11px; border-radius: 9999px;',
    '  background: rgba(15,23,42,.82); color: #fff; font-size: 12px; font-weight: 700;',
    '  backdrop-filter: blur(2px); }',
    '.sim-hero-score.band-high { background: rgba(5,150,105,.92); }',
    '.sim-hero-score.band-mid { background: rgba(180,83,9,.92); }',
    '.sim-hero-link { display: inline-block; margin-top: 10px; color: var(--pb-primary-hover);',
    '  font-weight: 700; font-size: 14px; text-decoration: none; }',
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
    const shell = createModalShell({
      onClose: () => {
        if (kintoneRecordChanged) {
          window.location.reload();
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
        main: 'PDFをここにドロップ',
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

      const preview = buildPreviewPanel(file ? file.name : '', trackObjectUrl);
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

      const preview = buildPreviewPanel(fileMeta.name || '', trackObjectUrl);
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
        currentFile = new File([blob], fileMeta.name || 'drawing.pdf', { type: 'application/pdf' });
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
    const makeAutoChipsField = (labelText, suggestions, allowNew) => {
      const selected = [];
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
    const showFormState = (file, analyzeResult, availableTags, fieldValues, reuseFileKey) => {
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
      const preview = buildPreviewPanel(file ? file.name : '', trackObjectUrl);
      if (file) preview.showBlob(file); else preview.showMessage('プレビューなし');
      const previewPanel = preview.panel;

      // Right: Form panel
      const formPanel = document.createElement('div');
      formPanel.className = 'form-panel';

      const fv = fieldValues || { drawingNos: [], productNames: [], materials: [], dimensions: [] };

      // 図番
      const drawingNoGroup = document.createElement('div');
      drawingNoGroup.className = 'field-group';
      const drawingNoLabel = document.createElement('label');
      drawingNoLabel.className = 'field-label';
      drawingNoLabel.textContent = '図番 *';
      const drawingNoAc = makeAutoCompleteInput(fv.drawingNos, analyzeResult.drawingNo || '');
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
      const productNameAc = makeAutoCompleteInput(fv.productNames, analyzeResult.productName || '');
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
      const materialAc = makeAutoCompleteInput(fv.materials, analyzeResult.material || '');
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
      const dimensionAc = makeAutoCompleteInput(fv.dimensions, analyzeResult.dimension || '');
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

      // 加工方法 autocomplete
      let getProcessValues = () => [];
      {
        const { element, getValues } = makeAutoChipsField('加工方法', [...processOptions], false);
        formPanel.appendChild(element);
        getProcessValues = getValues;
      }

      // タグ（ユーザータグ + AI形状タグの提案を同じ欄に表示、色で区別）
      const shapeTagSuggestions = Array.isArray(analyzeResult.extracted && analyzeResult.extracted.shapeTags)
        ? analyzeResult.extracted.shapeTags
        : [];
      let getTagValues = () => ({ tags: [], shapeTags: [] });
      {
        const { element, getValues } = makeTagChipsField('タグ', [...availableTags], [], shapeTagSuggestions);
        formPanel.appendChild(element);
        getTagValues = getValues;
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
            reuseFileKey
          );
        } catch (error) {
          showDoneState(false, '登録に失敗しました。', error.message);
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
    // indexPromise を渡すと「検索インデックス登録」の進行/結果をライブ表示する
    const showDoneState = (success, message, detail, indexPromise) => {
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
      if (indexPromise) {
        const indexStatus = document.createElement('div');
        indexStatus.className = 'status-line';
        indexStatus.style.cssText = 'justify-content:center; margin-top:14px;';
        const spinnerEl = document.createElement('div');
        spinnerEl.className = 'pb-spinner';
        spinnerEl.style.cssText = 'width:16px; height:16px; border-width:2px;';
        const statusText = document.createElement('span');
        statusText.textContent = '検索インデックスを登録中...（閉じても処理は続きます）';
        indexStatus.append(spinnerEl, statusText);
        resultWrap.appendChild(indexStatus);
        indexPromise.then((data) => {
          spinnerEl.remove();
          statusText.textContent = '✓ 検索インデックスの登録が完了しました' +
            (data && data.vector ? '（' + data.vector.provider + ' ' + data.vector.size + 'd）' : '');
        }).catch((error) => {
          spinnerEl.remove();
          indexStatus.style.color = '#b45309';
          statusText.textContent = '⚠ 検索インデックス登録に失敗しました。「図面を登録/更新」から再登録してください。（' + error.message + '）';
        });
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
      const [availableTags, fieldValues] = await Promise.all([
        fetchExistingTags(apiBaseUrl, tenantId, config.apiKey),
        fetchFieldValueSuggestions(apiBaseUrl, tenantId, config.apiKey)
      ]);
      showFormState(file, analyzeResult, availableTags, fieldValues, reuseFileKey);
    };

    // --- Registration ---
    const doRegister = async (file, drawingNo, productName, material, dimension, processes, tagValues, reuseFileKey) => {
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
          } else {
            // New record: redirect to kintone create form so user can fill required fields
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
          }
        }
      } catch (error) {
        throw new Error('kintoneレコード保存失敗: ' + error.message);
      }
      kintoneRecordChanged = true;

      // PUT でファイルを添付すると一時 fileKey は消費されるため、/index には
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

      // 検索インデックス登録は時間がかかる（コールドスタート時は1分弱）ので
      // モーダルをブロックせずバックグラウンドで実行し、完了画面上で状態を反映する。
      const indexPromise = fetch(apiBaseUrl + '/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...apiKeyHeader(config.apiKey) },
        body: JSON.stringify({
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
          limit: 10
        })
      }).then(async (indexRes) => {
        const data = await indexRes.json().catch(() => ({}));
        if (!indexRes.ok) {
          throw new Error(describeApiError(indexRes.status, data.error));
        }
        return data;
      });

      showDoneState(true, '図番 ' + drawingNo + ' を保存しました。', 'record ' + recordId, indexPromise);
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

  const renderSimilarConfidence = (confidenceEl, confidence, debug) => {
    if (!confidence) {
      confidenceEl.hidden = true;
      confidenceEl.textContent = '';
      return;
    }

    confidenceEl.hidden = false;
    confidenceEl.innerHTML = '';

    const level = document.createElement('span');
    level.className = 'sim-confidence-level level-' + String(confidence.level || 'low');
    level.textContent = '検索の確度: ' + confidenceLabel(confidence.level);
    confidenceEl.appendChild(level);

    // 生スコア（Top/2位/差）は開発者向け。デバッグ表示が有効なときだけ出す。
    if (debug) {
      const scores = document.createElement('span');
      scores.className = 'sim-confidence-scores';
      scores.textContent = 'Top ' + formatVectorRaw(confidence.topScore) +
        ' / 2位 ' + formatVectorRaw(confidence.secondScore) +
        ' / 差 ' + formatVectorRaw(confidence.margin);
      confidenceEl.appendChild(scores);
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

  const buildHeroCard = (item, apiBaseUrl, debug) => {
    const card = document.createElement('div');
    card.className = 'sim-hero-card';
    const isArchive = item.docType === 'archive';

    const thumbBox = document.createElement('div');
    thumbBox.className = 'sim-hero-thumb' + (isArchive ? ' sim-thumb-archive' : '');
    if (isArchive) {
      thumbBox.textContent = '📁';
    } else {
      loadThumbnail(thumbBox, apiBaseUrl, item.fileKey, item.thumbToken);
    }

    const scoreBadge = document.createElement('div');
    scoreBadge.className = 'sim-hero-score ' + scoreBandClass(item.score);
    scoreBadge.textContent = formatPercent(item.score);
    thumbBox.appendChild(scoreBadge);

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

    if (isArchive) card.appendChild(buildArchiveBadge());

    const reasonsEl = buildReasonBadges(item.reasons);
    if (reasonsEl) card.appendChild(reasonsEl);

    const shapeTagsEl = buildShapeTagsEl(item.shapeTags);
    if (shapeTagsEl) card.appendChild(shapeTagsEl);

    if (debug) card.appendChild(buildDebugDetails(item));

    return card;
  };

  const buildResultRow = (item, apiBaseUrl, debug) => {
    const li = document.createElement('li');
    li.className = 'sim-item';
    const isArchive = item.docType === 'archive';

    let thumbBox;
    if (isArchive) {
      thumbBox = document.createElement('div');
      thumbBox.className = 'sim-thumb sim-thumb-archive';
      thumbBox.textContent = '📁';
    } else {
      thumbBox = buildThumbnailBox(apiBaseUrl, item.fileKey, false, item.thumbToken);
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

    if (isArchive) body.appendChild(buildArchiveBadge());

    const reasonsEl = buildReasonBadges(item.reasons);
    if (reasonsEl) body.appendChild(reasonsEl);

    const shapeTagsEl = buildShapeTagsEl(item.shapeTags);
    if (shapeTagsEl) body.appendChild(shapeTagsEl);

    const scoreBox = document.createElement('div');
    scoreBox.className = 'sim-scorebox';

    const score = document.createElement('div');
    score.className = 'sim-score ' + scoreBandClass(item.score);
    score.textContent = formatPercent(item.score);
    scoreBox.appendChild(score);

    // vectorRaw / rotation は開発者向け情報。デバッグ表示のときだけ出す。
    if (debug) {
      const rawScore = item.vectorRaw || (item.scoreBreakdown && item.scoreBreakdown.vectorRaw);
      const rotationText = item.embeddingRotation === null || item.embeddingRotation === undefined
        ? ''
        : ' / rot ' + item.embeddingRotation;
      const detail = document.createElement('div');
      detail.className = 'sim-detail';
      detail.textContent = 'vectorRaw ' + formatVectorRaw(rawScore) + rotationText;
      body.appendChild(detail);
    }

    li.append(thumbBox, body, scoreBox);
    return li;
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

  // options: { debug: 内訳等の開発者向け表示, emptyActions: 0件時に出すボタン配列 }
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

    // 確度が低いときは注意書きを添える
    const level = data && data.matchConfidence && data.matchConfidence.level;
    if (level === 'low') {
      const note = document.createElement('div');
      note.className = 'sim-note';
      note.textContent = '⚠ 有力な候補を絞り込めていません。以下は参考程度にご覧ください。';
      listEl.appendChild(note);
    }

    const heroResults = results.slice(0, THUMBNAIL_AUTO_COUNT);
    const restResults = results.slice(THUMBNAIL_AUTO_COUNT);

    if (heroResults.length) {
      const heroGrid = document.createElement('div');
      heroGrid.className = 'sim-hero-grid';
      heroResults.forEach((item) => heroGrid.appendChild(buildHeroCard(item, apiBaseUrl, options.debug)));
      listEl.appendChild(heroGrid);
    }

    if (restResults.length) {
      const restList = document.createElement('ul');
      restList.className = 'sim-list';
      restResults.forEach((item) => restList.appendChild(buildResultRow(item, apiBaseUrl, options.debug)));
      listEl.appendChild(restList);
    }
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
  const runSimilarSearch = ({ apiBaseUrl, config, payload, statusEl, confidenceEl, listEl, onData, emptyActions }) => {
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
      .then((data) => {
        stopStatus();
        if (onData) onData(data);
        renderSimilarList(listEl, statusEl, confidenceEl, data, apiBaseUrl, {
          debug: isDebugEnabled(config),
          emptyActions: emptyActions ? emptyActions() : undefined
        });
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
          runSimilarSearch({ apiBaseUrl, config, payload, statusEl, confidenceEl, listEl, onData, emptyActions });
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

    const preview = buildPreviewPanel(fileMeta ? (fileMeta.name || '') : '自分の図面', shell.trackObjectUrl);
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
      }
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
    fileInput.accept = '.pdf,application/pdf';
    fileInput.className = 'file-input';
    dropWrap.append(icon, mainEl, subEl, fileInput);
    if (note) {
      const noteEl = document.createElement('div');
      noteEl.className = 'drop-note';
      noteEl.textContent = note;
      dropWrap.appendChild(noteEl);
    }

    const acceptFiles = (files) => {
      const file = files && files[0];
      if (!file || !(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
        window.alert('PDFファイルを選択してください。');
        return;
      }
      if (files.length > 1) {
        window.alert('複数のファイルが選択されました。1件目「' + file.name + '」のみ使用します。');
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

      const preview = buildPreviewPanel(file.name || '', trackObjectUrl);
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
          emptyActions: buildEmptyActions
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
        main: 'PDFをここにドロップ',
        sub: 'またはクリックしてファイルを選択（kintoneには登録されません）',
        note: '※ PDFの1ページ目を使って検索します',
        onFile: showResultsState
      });

      content.append(title, dropWrap);
    };

    showDropState();
  };

  // === インデックス状況チェック（kintone ⇔ Qdrant の整合性確認） ===
  // 未登録（kintoneにあるが検索に出ない）・要更新（PDF差し替え済みでベクトルが古い）・
  // 孤児（レコード削除済みなのに検索に出る）を検知し、その場で修復できるようにする。
  const openIndexStatusModal = (config, apiBaseUrl) => {
    if (!config.pdfFileField) {
      window.alert('プラグイン設定でPDFファイルフィールドコードを設定してください。');
      return;
    }
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
      title.textContent = 'インデックス状況チェック';
      const statusEl = document.createElement('div');
      statusEl.className = 'status-line';
      const spinner = document.createElement('div');
      spinner.className = 'pb-spinner';
      const statusText = document.createElement('span');
      statusText.textContent = 'kintoneレコードと検索インデックスを照合しています...';
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

  kintone.events.on('app.record.index.show', (event) => {
    if (document.getElementById('pb-list-btns')) {
      return event;
    }

    const config = kintone.plugin.app.getConfig(PLUGIN_ID);
    const apiBaseUrl = normalizeBaseUrl(config.apiBaseUrl);
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

    const uploadSearchBtn = createHeaderButton({ id: 'pb-upload-search-btn', label: '類似検索（アップロード）', variant: 'secondary', icon: 'upload' });
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
    if (config.showBulkButton !== 'false') {
      menuItems.push({
        label: '一括図面登録（全件）',
        description: '表示中アプリの全レコードを順次登録',
        onClick: () => {
          if (document.getElementById('pb-bulk-overlay')) return;
          if (!config.pdfFileField) {
            window.alert('プラグイン設定でPDFファイルフィールドコードを設定してください。');
            return;
          }
          const overlay = createBulkModal();
          runBulkIndex(overlay, config, apiBaseUrl);
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
    }
    group.appendChild(createManageMenu(menuItems));

    header.appendChild(group);

    return event;
  });
})();
