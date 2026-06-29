(() => {
  'use strict';

  const PLUGIN_ID = kintone.$PLUGIN_ID;

  const normalizeBaseUrl = (value) => String(value || '').replace(/\/+$/, '');

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
      tenantId: config.tenantId || 'default',
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

  let _tagsCache = null;
  const fetchTags = async (apiBaseUrl, tenantId, appId) => {
    if (_tagsCache) {
      return _tagsCache;
    }
    try {
      const params = new URLSearchParams({ tenantId });
      if (appId) {
        params.set('appId', String(appId));
      }
      const res = await fetch(apiBaseUrl + '/tags?' + params);
      const data = await res.json();
      _tagsCache = Array.isArray(data.tags) ? data.tags : [];
    } catch (_) {
      _tagsCache = [];
    }
    return _tagsCache;
  };

  const renderTagUi = (spaceEl, initialTags, allTags, editable, onTagsChange) => {
    if (!spaceEl) {
      return;
    }
    spaceEl.innerHTML = '';

    let currentTags = [...initialTags];

    const container = document.createElement('div');
    container.className = 'pb-tag-container';

    const chipsWrap = document.createElement('div');
    chipsWrap.className = 'pb-tag-chips';

    const renderChips = () => {
      chipsWrap.innerHTML = '';
      if (!currentTags.length && !editable) {
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
            onTagsChange(currentTags);
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
        onTagsChange(currentTags);
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

  const setStatus = (panel, message) => {
    const status = panel.querySelector('.pb-similarity-status');
    status.textContent = message;
  };

  const renderConfidence = (panel, confidence) => {
    const summary = panel.querySelector('.pb-similarity-confidence');
    if (!confidence) {
      summary.hidden = true;
      summary.textContent = '';
      return;
    }

    summary.hidden = false;
    summary.innerHTML = '';

    const level = document.createElement('span');
    level.className = 'pb-similarity-confidence-level level-' + String(confidence.level || 'low');
    level.textContent = '信頼度 ' + confidenceLabel(confidence.level);

    const scores = document.createElement('span');
    scores.className = 'pb-similarity-confidence-scores';
    scores.textContent = 'Top ' + formatVectorRaw(confidence.topScore) +
      ' / 2位 ' + formatVectorRaw(confidence.secondScore) +
      ' / 差 ' + formatVectorRaw(confidence.margin);

    summary.append(level, scores);
  };

  const renderResults = (panel, data) => {
    const results = Array.isArray(data && data.results) ? data.results : [];
    const list = panel.querySelector('.pb-similarity-list');
    list.textContent = '';
    renderConfidence(panel, data ? data.matchConfidence : null);

    if (!results.length) {
      setStatus(panel, '類似図面は見つかりませんでした。');
      return;
    }

    setStatus(panel, results.length + '件の候補を表示しています。');

    results.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'pb-similarity-item';

      const body = document.createElement('div');
      const link = document.createElement('a');
      link.className = 'pb-similarity-link';
      link.href = '/k/' + kintone.app.getId() + '/show#record=' + encodeURIComponent(item.recordId);
      link.textContent = item.drawingNo || 'record ' + item.recordId;

      const meta = document.createElement('div');
      meta.className = 'pb-similarity-meta';
      meta.textContent = [item.productName, item.customer].filter(Boolean).join(' / ');

      const rawScore = item.vectorRaw || (item.scoreBreakdown && item.scoreBreakdown.vectorRaw);
      const detail = document.createElement('div');
      detail.className = 'pb-similarity-detail';
      const rotationText = item.embeddingRotation === null || item.embeddingRotation === undefined
        ? ''
        : ' / rot ' + item.embeddingRotation;
      detail.textContent = 'vectorRaw ' + formatVectorRaw(rawScore) + rotationText;

      const scoreBox = document.createElement('div');
      scoreBox.className = 'pb-similarity-scorebox';

      const vector = document.createElement('div');
      vector.className = 'pb-similarity-vectorraw';
      vector.textContent = formatVectorRaw(rawScore);

      const score = document.createElement('div');
      score.className = 'pb-similarity-score';
      score.textContent = formatPercent(item.score);

      body.append(link, meta, detail);
      scoreBox.append(vector, score);
      li.append(body, scoreBox);
      list.append(li);
    });
  };

  const createPanel = (button) => {
    const panel = document.createElement('section');
    panel.id = 'pb-similarity-panel';
    panel.className = 'pb-similarity-panel';
    panel.innerHTML = [
      '<div class="pb-similarity-header">',
      '<h2 class="pb-similarity-title">類似図面検索</h2>',
      '</div>',
      '<div class="pb-similarity-status">検索ボタンを押すと候補を表示します。</div>',
      '<div class="pb-similarity-confidence" hidden></div>',
      '<ul class="pb-similarity-list"></ul>'
    ].join('');

    button.parentNode.insertAdjacentElement('afterend', panel);
    return panel;
  };

  const clearPluginUi = () => {
    document.querySelectorAll('#pb-similarity-index, #pb-similarity-search, #pb-similarity-panel, .pb-similarity-panel').forEach((element) => {
      element.remove();
    });
  };

  kintone.events.on(['app.record.edit.show', 'app.record.create.show'], async (event) => {
    const config = kintone.plugin.app.getConfig(PLUGIN_ID);
    if (!config.tagField || !config.tagSpaceId) {
      return event;
    }
    const spaceEl = kintone.app.record.getSpaceElement(config.tagSpaceId);
    if (!spaceEl) {
      return event;
    }
    const apiBaseUrl = normalizeBaseUrl(config.apiBaseUrl);
    const tenantId = config.tenantId || 'default';
    const appId = String(kintone.app.getId() || '');
    const currentTags = parseTags(getFieldValue(event.record, config.tagField));
    const allTags = apiBaseUrl ? await fetchTags(apiBaseUrl, tenantId, appId) : [];
    renderTagUi(spaceEl, currentTags, allTags, true, (tags) => {
      const obj = kintone.app.record.get();
      obj.record[config.tagField].value = stringifyTags(tags);
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
    fetch(apiBaseUrl + '/tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: config.tenantId || 'default',
        appId: String(kintone.app.getId() || ''),
        recordId,
        tags
      })
    }).catch(() => {});
    return event;
  });

  kintone.events.on('app.record.detail.show', (event) => {
    clearPluginUi();

    const config = kintone.plugin.app.getConfig(PLUGIN_ID);
    const apiBaseUrl = normalizeBaseUrl(config.apiBaseUrl);
    const header = kintone.app.record.getHeaderMenuSpaceElement();
    const indexButton = document.createElement('button');
    indexButton.id = 'pb-similarity-index';
    indexButton.className = 'pb-similarity-button secondary';
    indexButton.type = 'button';
    indexButton.textContent = '図面を登録/更新';

    const button = document.createElement('button');
    button.id = 'pb-similarity-search';
    button.className = 'pb-similarity-button';
    button.type = 'button';
    button.textContent = '類似図面検索';
    header.append(indexButton, button);

    const panel = createPanel(button);

    if (config.tagField && config.tagSpaceId) {
      const spaceEl = kintone.app.record.getSpaceElement(config.tagSpaceId);
      const tags = parseTags(getFieldValue(event.record, config.tagField));
      renderTagUi(spaceEl, tags, [], false, null);
    }

    indexButton.addEventListener('click', async () => {
      if (!apiBaseUrl) {
        setStatus(panel, 'プラグイン設定でAPI Base URLを設定してください。');
        return;
      }

      const payload = buildRecordPayload(event, config);
      if (!payload.fileKey) {
        setStatus(panel, 'PDFファイルフィールドにファイルが見つかりません。');
        return;
      }

      indexButton.disabled = true;
      setStatus(panel, 'PDFを取得して画像化・登録しています...');

      try {
        const response = await fetch(apiBaseUrl + '/index', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'API returned ' + response.status);
        }

        const qdrantStatus = data.qdrant && data.qdrant.upserted
          ? ' / Qdrant登録済み'
          : ' / Qdrant未設定';
        const vectorStatus = data.vector
          ? ' / ' + data.vector.provider + ' ' + data.vector.size + 'd'
          : '';
        const rotationStatus = data.vector && Array.isArray(data.vector.rotations)
          ? ' / rot ' + data.vector.rotations.join(',')
          : '';
        const collectionStatus = data.qdrant && data.qdrant.collection
          ? ' / ' + data.qdrant.collection
          : '';
        const recordStatus = data.recordId
          ? ' / record ' + data.recordId
          : '';
        setStatus(
          panel,
          '登録が完了しました: ' + data.fileName + ' / ' + data.image.widthHint + 'px相当 / ' + data.image.bytes + ' bytes' + qdrantStatus + vectorStatus + rotationStatus + collectionStatus + recordStatus
        );
      } catch (error) {
        setStatus(panel, '図面登録に失敗しました: ' + error.message);
      } finally {
        indexButton.disabled = false;
      }
    });

    button.addEventListener('click', async () => {
      if (!apiBaseUrl) {
        setStatus(panel, 'プラグイン設定でAPI Base URLを設定してください。');
        return;
      }

      button.disabled = true;
      setStatus(panel, '検索しています...');

      try {
        const response = await fetch(apiBaseUrl + '/similar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(buildRecordPayload(event, config))
        });

        if (!response.ok) {
          throw new Error('API returned ' + response.status);
        }

        const data = await response.json();
        renderResults(panel, data);
      } catch (error) {
        setStatus(panel, '類似図面検索に失敗しました: ' + error.message);
      } finally {
        button.disabled = false;
      }
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

  const runBulkIndex = async (overlay, config, apiBaseUrl) => {
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
        tenantId: config.tenantId || 'default',
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
          headers: { 'Content-Type': 'application/json' },
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

  // === 図面登録（Shadow DOM モーダル） ===

  const REGISTER_CSS = [
    '* { box-sizing: border-box; margin: 0; }',
    '.overlay { position: fixed; top: 0; right: 0; bottom: 0; left: 0;',
    '  background: rgba(0,0,0,.55); display: flex; align-items: center;',
    '  justify-content: center; z-index: 9999; }',
    '.modal { background: #fff; border-radius: 8px; padding: 24px;',
    '  width: 580px; max-width: calc(100vw - 32px); max-height: 90vh;',
    '  overflow-y: auto; position: relative; }',
    '.modal.wide { width: min(1160px, calc(100vw - 32px)); padding: 0;',
    '  overflow: hidden; display: flex; flex-direction: column; max-height: 90vh; }',
    '.modal.wide .btn-close { top: 10px; right: 14px; }',
    '.modal-header { padding: 14px 20px 14px 24px; border-bottom: 1px solid #e5e7eb;',
    '  display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }',
    '.modal-header h2 { margin: 0; }',
    '.form-layout { display: flex; flex: 1; overflow: hidden; }',
    '.preview-panel { flex: 0 0 58%; display: flex; flex-direction: column;',
    '  border-right: 1px solid #e5e7eb; background: #f5f6f7; min-height: 0; }',
    '.preview-label { padding: 6px 12px; font-size: 11px; color: #6b7280;',
    '  background: #fff; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }',
    '.preview-embed { flex: 1; width: 100%; border: none; display: block; min-height: 0; }',
    '.preview-placeholder { flex: 1; display: flex; align-items: center; justify-content: center;',
    '  color: #9ca3af; font-size: 13px; }',
    '.form-panel { flex: 0 0 42%; overflow-y: auto; padding: 20px 24px 24px; }',
    '.modal.wide .modal-content { display: flex; flex-direction: column; flex: 1; overflow: hidden; min-height: 0; }',
    '.modal-content { }',
    'h2 { font-size: 17px; font-weight: 600; color: #1a1a1a; margin-bottom: 20px; }',
    '.btn-close { position: absolute; top: 10px; right: 14px;',
    '  background: none; border: none; font-size: 22px; cursor: pointer;',
    '  color: #999; line-height: 1; padding: 2px 6px; }',
    '.btn-close:hover { color: #333; }',
    '.dropzone { border: 2px dashed #c8c8c8; border-radius: 8px; padding: 48px 24px;',
    '  text-align: center; cursor: pointer; transition: border-color .2s, background .2s; }',
    '.dropzone.drag-over { border-color: #3b82f6; background: #eff6ff; }',
    '.dropzone .drop-icon { font-size: 36px; color: #9ca3af; margin-bottom: 12px; }',
    '.dropzone .drop-main { font-size: 15px; color: #374151; font-weight: 500; margin-bottom: 6px; }',
    '.dropzone .drop-sub { font-size: 13px; color: #6b7280; }',
    '.file-input { display: none; }',
    '.spinner-wrap { text-align: center; padding: 40px 0; color: #6b7280; font-size: 14px; }',
    '.section-label { font-size: 11px; color: #6b7280; font-weight: 600;',
    '  text-transform: uppercase; letter-spacing: .05em; margin-bottom: 8px; }',
    '.ocr-candidates { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }',
    '.ocr-pill { display: inline-flex; align-items: center; gap: 4px;',
    '  background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 4px; padding: 3px 6px; }',
    '.ocr-pill-text { max-width: 200px; overflow: hidden; text-overflow: ellipsis;',
    '  white-space: nowrap; font-size: 12px; }',
    '.ocr-btn { font-size: 10px; padding: 1px 5px; border-radius: 3px; border: 1px solid;',
    '  cursor: pointer; background: transparent; transition: background .1s, color .1s; }',
    '.ocr-btn-no { border-color: #2563eb; color: #2563eb; }',
    '.ocr-btn-no:hover { background: #2563eb; color: #fff; }',
    '.ocr-btn-name { border-color: #059669; color: #059669; }',
    '.ocr-btn-name:hover { background: #059669; color: #fff; }',
    '.field-group { margin-bottom: 16px; }',
    '.field-label { display: block; font-size: 12px; color: #374151; font-weight: 500; margin-bottom: 5px; }',
    '.field-input { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db;',
    '  border-radius: 5px; font-size: 14px; color: #111; }',
    '.field-input:focus { outline: none; border-color: #3b82f6; }',
    '.field-input.error { border-color: #dc2626; }',
    '.chip-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }',
    '.chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px;',
    '  border-radius: 9999px; border: 1px solid #d1d5db; background: #f9fafb;',
    '  font-size: 13px; cursor: pointer; user-select: none;',
    '  transition: border-color .15s, background .15s; }',
    '.chip input[type=checkbox] { display: none; }',
    '.chip.selected { background: #eff6ff; border-color: #3b82f6; color: #1d4ed8; }',
    '.ac-chips { display: flex; flex-wrap: wrap; gap: 6px; min-height: 26px; margin-top: 6px; }',
    '.ac-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px;',
    '  background: #eff6ff; border: 1px solid #3b82f6; color: #1d4ed8;',
    '  border-radius: 9999px; font-size: 13px; }',
    '.ac-chip-del { background: none; border: none; cursor: pointer; color: #93c5fd;',
    '  font-size: 14px; line-height: 1; padding: 0 0 0 4px; }',
    '.ac-chip-del:hover { color: #1d4ed8; }',
    '.ac-input-row { position: relative; margin-top: 6px; }',
    '.ac-dropdown { position: absolute; top: 100%; left: 0; right: 0; background: #fff;',
    '  border: 1px solid #d1d5db; border-top: none; border-radius: 0 0 5px 5px;',
    '  max-height: 200px; overflow-y: auto; z-index: 10; list-style: none; padding: 0; margin: 0;',
    '  box-shadow: 0 4px 8px rgba(0,0,0,.1); }',
    '.ac-item { padding: 8px 12px; font-size: 13px; cursor: pointer; color: #374151; }',
    '.ac-item:hover, .ac-item.active { background: #eff6ff; color: #1d4ed8; }',
    '.ac-item.new { color: #059669; font-style: italic; }',
    '.form-actions { display: flex; gap: 10px; margin-top: 24px; padding-top: 20px;',
    '  border-top: 1px solid #f0f0f0; }',
    '.btn-primary { flex: 1; padding: 10px; background: #3b82f6; color: #fff;',
    '  border: none; border-radius: 5px; font-size: 14px; cursor: pointer; font-weight: 500; }',
    '.btn-primary:disabled { opacity: .5; cursor: not-allowed; }',
    '.btn-primary:not(:disabled):hover { background: #2563eb; }',
    '.btn-secondary { padding: 10px 16px; background: #f9fafb; color: #374151;',
    '  border: 1px solid #d1d5db; border-radius: 5px; font-size: 14px; cursor: pointer; }',
    '.btn-secondary:hover { background: #f3f4f6; }',
    '.result-wrap { text-align: center; padding: 32px 0; }',
    '.result-icon { font-size: 40px; margin-bottom: 12px; }',
    '.result-msg { font-size: 15px; margin-bottom: 8px; color: #1a1a1a; }',
    '.result-detail { font-size: 12px; color: #6b7280; white-space: pre-wrap; }',
    '.result-ok .result-icon { color: #059669; }',
    '.result-error .result-icon { color: #dc2626; }'
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
    fd.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', kintone.api.url('/k/v1/file', true));
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhr.onload = () => {
      if (xhr.status === 200) {
        try { resolve(JSON.parse(xhr.responseText).fileKey); }
        catch { reject(new Error('ファイルアップロードレスポンス解析失敗')); }
      } else {
        reject(new Error('ファイルアップロード失敗: HTTP ' + xhr.status));
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

  const fetchExistingTags = async (apiBaseUrl, tenantId) => {
    try {
      const res = await fetch(apiBaseUrl + '/tags?tenantId=' + encodeURIComponent(tenantId || 'default'));
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.tags) ? data.tags : [];
    } catch {
      return [];
    }
  };

  const openRegisterModal = (config, apiBaseUrl) => {
    const appId = kintone.app.getId();
    const tenantId = config.tenantId || 'default';
    const drawingNoField = config.drawingNoField || '';
    const productNameField = config.productNameField || '';
    const processField = config.processField || '';
    const tagsField = config.tagField || '';
    const pdfFileField = config.pdfFileField || '';
    const processOptions = parseOptionsList(config.processOptions);

    const host = document.createElement('div');
    host.id = 'pb-register-host';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = REGISTER_CSS;

    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const xBtn = document.createElement('button');
    xBtn.className = 'btn-close';
    xBtn.type = 'button';
    xBtn.textContent = '×';

    const content = document.createElement('div');
    content.className = 'modal-content';

    modal.append(xBtn, content);
    overlay.appendChild(modal);
    shadow.append(style, overlay);

    const closeModal = () => host.remove();
    xBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    const clear = () => { content.textContent = ''; };

    // --- State: Drop ---
    const showDropState = () => {
      clear();
      modal.classList.remove('wide');

      const title = document.createElement('h2');
      title.textContent = '図面を登録';

      const dropWrap = document.createElement('div');
      dropWrap.className = 'dropzone';
      const icon = document.createElement('div');
      icon.className = 'drop-icon';
      icon.textContent = '📄';
      const main = document.createElement('div');
      main.className = 'drop-main';
      main.textContent = 'PDFをここにドロップ';
      const sub = document.createElement('div');
      sub.className = 'drop-sub';
      sub.textContent = 'またはクリックしてファイルを選択';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.pdf,application/pdf';
      fileInput.className = 'file-input';
      dropWrap.append(icon, main, sub, fileInput);

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
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
          handleFile(file);
        } else {
          window.alert('PDFファイルをドロップしてください。');
        }
      });
      fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
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

      const previewPanel = document.createElement('div');
      previewPanel.className = 'preview-panel';
      const previewLabel = document.createElement('div');
      previewLabel.className = 'preview-label';
      previewLabel.textContent = file ? file.name : '';
      previewPanel.appendChild(previewLabel);
      if (file) {
        const blobUrl = URL.createObjectURL(file);
        const embed = document.createElement('embed');
        embed.src = blobUrl;
        embed.type = 'application/pdf';
        embed.className = 'preview-embed';
        previewPanel.appendChild(embed);
      } else {
        const ph = document.createElement('div');
        ph.className = 'preview-placeholder';
        ph.textContent = 'プレビューなし';
        previewPanel.appendChild(ph);
      }

      const formPanel = document.createElement('div');
      formPanel.className = 'form-panel';
      const spinner = document.createElement('div');
      spinner.className = 'spinner-wrap';
      spinner.textContent = '図面を解析しています...';
      formPanel.appendChild(spinner);

      layout.append(previewPanel, formPanel);
      content.append(header, layout);
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

    // --- State: Form ---
    const showFormState = (file, analyzeResult, availableTags) => {
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
      const previewPanel = document.createElement('div');
      previewPanel.className = 'preview-panel';
      const previewLabel = document.createElement('div');
      previewLabel.className = 'preview-label';
      previewLabel.textContent = file ? file.name : '';
      previewPanel.appendChild(previewLabel);
      if (file) {
        const blobUrl = URL.createObjectURL(file);
        const embed = document.createElement('embed');
        embed.src = blobUrl;
        embed.type = 'application/pdf';
        embed.className = 'preview-embed';
        previewPanel.appendChild(embed);
      } else {
        const ph = document.createElement('div');
        ph.className = 'preview-placeholder';
        ph.textContent = 'プレビューなし';
        previewPanel.appendChild(ph);
      }

      // Right: Form panel
      const formPanel = document.createElement('div');
      formPanel.className = 'form-panel';

      // OCR candidates
      const ocrLines = Array.isArray(analyzeResult.ocrLines) ? analyzeResult.ocrLines : [];
      if (ocrLines.length > 0) {
        const ocrLabel = document.createElement('div');
        ocrLabel.className = 'section-label';
        ocrLabel.textContent = 'OCR候補 — 図番・品名に振り分け';
        const candidates = document.createElement('div');
        candidates.className = 'ocr-candidates';
        ocrLines.slice(0, 15).forEach((line) => {
          const pill = document.createElement('span');
          pill.className = 'ocr-pill';
          const text = document.createElement('span');
          text.className = 'ocr-pill-text';
          text.textContent = line;
          text.title = line;
          const btnNo = document.createElement('button');
          btnNo.className = 'ocr-btn ocr-btn-no';
          btnNo.type = 'button';
          btnNo.textContent = '図番';
          btnNo.addEventListener('click', () => { if (drawingNoInput) drawingNoInput.value = line; });
          const btnName = document.createElement('button');
          btnName.className = 'ocr-btn ocr-btn-name';
          btnName.type = 'button';
          btnName.textContent = '品名';
          btnName.addEventListener('click', () => { if (productNameInput) productNameInput.value = line; });
          pill.append(text, btnNo, btnName);
          candidates.appendChild(pill);
        });
        formPanel.append(ocrLabel, candidates);
      }

      // 図番
      const drawingNoGroup = document.createElement('div');
      drawingNoGroup.className = 'field-group';
      const drawingNoLabel = document.createElement('label');
      drawingNoLabel.className = 'field-label';
      drawingNoLabel.textContent = '図番 *';
      drawingNoInput = document.createElement('input');
      drawingNoInput.className = 'field-input';
      drawingNoInput.type = 'text';
      drawingNoInput.placeholder = '図番を入力';
      drawingNoInput.value = analyzeResult.drawingNo || '';
      drawingNoGroup.append(drawingNoLabel, drawingNoInput);
      formPanel.appendChild(drawingNoGroup);

      // 品名
      const productNameGroup = document.createElement('div');
      productNameGroup.className = 'field-group';
      const productNameLabel = document.createElement('label');
      productNameLabel.className = 'field-label';
      productNameLabel.textContent = '品名';
      productNameInput = document.createElement('input');
      productNameInput.className = 'field-input';
      productNameInput.type = 'text';
      productNameInput.placeholder = '品名を入力';
      productNameInput.value = analyzeResult.productName || '';
      productNameGroup.append(productNameLabel, productNameInput);
      formPanel.appendChild(productNameGroup);

      // 材質
      const materialGroup = document.createElement('div');
      materialGroup.className = 'field-group';
      const materialLabel = document.createElement('label');
      materialLabel.className = 'field-label';
      materialLabel.textContent = '材質';
      materialInput = document.createElement('input');
      materialInput.className = 'field-input';
      materialInput.type = 'text';
      materialInput.placeholder = '例: SPCC, SUS304, S45C';
      materialInput.value = analyzeResult.material || '';
      materialGroup.append(materialLabel, materialInput);
      formPanel.appendChild(materialGroup);

      // 寸法 (板厚 / 外径)
      const dimensionGroup = document.createElement('div');
      dimensionGroup.className = 'field-group';
      const dimensionLabel = document.createElement('label');
      dimensionLabel.className = 'field-label';
      dimensionLabel.textContent = '寸法 (板厚 / 外径)';
      dimensionInput = document.createElement('input');
      dimensionInput.className = 'field-input';
      dimensionInput.type = 'text';
      dimensionInput.placeholder = '例: t1.6, φ28.6';
      dimensionInput.value = analyzeResult.dimension || '';
      dimensionGroup.append(dimensionLabel, dimensionInput);
      formPanel.appendChild(dimensionGroup);

      // 加工方法 autocomplete
      let getProcessValues = () => [];
      {
        const { element, getValues } = makeAutoChipsField('加工方法', [...processOptions], false);
        formPanel.appendChild(element);
        getProcessValues = getValues;
      }

      // タグ autocomplete
      let getTagValues = () => [];
      {
        const { element, getValues } = makeAutoChipsField('タグ', [...availableTags], true);
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
            getTagValues()
          );
        } catch (error) {
          showDoneState(false, '登録に失敗しました。', error.message);
        }
      });

      layout.append(previewPanel, formPanel);
      content.append(header, layout);
    };

    // --- State: Registering ---
    const showRegisteringState = (step) => {
      clear();
      modal.classList.remove('wide');
      const title = document.createElement('h2');
      title.textContent = '登録中...';
      const spinner = document.createElement('div');
      spinner.className = 'spinner-wrap';
      spinner.textContent = step || 'kintoneに保存しています...';
      content.append(title, spinner);
    };

    // --- State: Done ---
    const showDoneState = (success, message, detail) => {
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
    const handleFile = async (file) => {
      showAnalyzingState(file);
      let analyzeResult;
      try {
        const base64 = await toBase64(file);
        const res = await fetch(apiBaseUrl + '/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdf_base64: base64 })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
        analyzeResult = data;
      } catch (error) {
        showDoneState(false, 'OCR解析に失敗しました。', error.message);
        return;
      }
      const availableTags = await fetchExistingTags(apiBaseUrl, tenantId);
      showFormState(file, analyzeResult, availableTags);
    };

    // --- Registration ---
    const doRegister = async (file, drawingNo, productName, material, dimension, processes, tags) => {
      showRegisteringState('ファイルをアップロード中...');
      let fileKey;
      try {
        fileKey = await uploadFileToKintone(file);
      } catch (error) {
        throw new Error('ファイルアップロード失敗: ' + error.message);
      }

      showRegisteringState('kintoneレコードを保存中...');
      const recordFields = {};
      if (productNameField) recordFields[productNameField] = { value: productName };
      if (processField) recordFields[processField] = { value: processes.join(',') };
      if (tagsField) recordFields[tagsField] = { value: tags.join(',') };
      if (pdfFileField) recordFields[pdfFileField] = { value: [{ fileKey }] };

      let recordId;
      try {
        const existing = await findRecordByDrawingNo(drawingNo, drawingNoField, appId);
        if (existing) {
          recordId = existing['$id'].value;
          await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', {
            app: appId, id: recordId, record: recordFields
          });
        } else {
          if (drawingNoField) recordFields[drawingNoField] = { value: drawingNo };
          const res = await kintone.api(kintone.api.url('/k/v1/record', true), 'POST', {
            app: appId, record: recordFields
          });
          recordId = res.id;
        }
      } catch (error) {
        throw new Error('kintoneレコード保存失敗: ' + error.message);
      }

      showRegisteringState('ベクトルインデックスを登録中...');
      try {
        const indexRes = await fetch(apiBaseUrl + '/index', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appId: String(appId),
            recordId: String(recordId),
            tenantId,
            drawingNo,
            productName,
            material,
            dimension,
            tags: tags.join(','),
            fileKey,
            fileName: file.name,
            limit: 10
          })
        });
        const data = await indexRes.json();
        if (!indexRes.ok) {
          showDoneState(false,
            'kintoneには保存しましたが、検索インデックス登録に失敗しました。\n再度「図面を登録/更新」ボタンで再登録してください。',
            'record ' + recordId + ' / ' + (data.error || 'HTTP ' + indexRes.status)
          );
          return;
        }
        const detail = [
          'record ' + recordId,
          data.qdrant && data.qdrant.collection ? data.qdrant.collection : '',
          data.vector ? data.vector.provider + ' ' + data.vector.size + 'd' : ''
        ].filter(Boolean).join(' / ');
        showDoneState(true, '図番 ' + drawingNo + ' を登録しました。', detail);
      } catch (error) {
        showDoneState(false,
          'kintoneには保存しましたが、検索インデックス登録に失敗しました。\n再度「図面を登録/更新」ボタンで再登録してください。',
          'record ' + recordId + ' / ' + error.message
        );
      }
    };

    showDropState();
  };

  kintone.events.on('app.record.index.show', (event) => {
    if (document.getElementById('pb-bulk-index-btn')) {
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

    const registerBtn = document.createElement('button');
    registerBtn.id = 'pb-register-btn';
    registerBtn.className = 'pb-similarity-button';
    registerBtn.type = 'button';
    registerBtn.textContent = '図面登録';
    header.appendChild(registerBtn);

    registerBtn.addEventListener('click', () => {
      openRegisterModal(config, apiBaseUrl);
    });

    const button = document.createElement('button');
    button.id = 'pb-bulk-index-btn';
    button.className = 'pb-similarity-button secondary';
    button.type = 'button';
    button.textContent = '一括図面登録';
    header.appendChild(button);

    button.addEventListener('click', () => {
      if (document.getElementById('pb-bulk-overlay')) {
        return;
      }
      if (!config.pdfFileField) {
        window.alert('プラグイン設定でPDFファイルフィールドコードを設定してください。');
        return;
      }
      const overlay = createBulkModal();
      runBulkIndex(overlay, config, apiBaseUrl);
    });

    return event;
  });
})();
