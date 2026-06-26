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
