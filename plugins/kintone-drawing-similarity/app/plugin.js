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
      fileKey: file ? file.fileKey : '',
      fileName: file ? file.name : '',
      limit: 10
    };
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
})();
