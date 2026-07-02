(() => {
  'use strict';

  const PLUGIN_ID = kintone.$PLUGIN_ID;
  const editableTextFields = ['apiBaseUrl', 'apiKey', 'tagSpaceId', 'processOptions'];
  const textFields = [...editableTextFields, 'tenantId'];
  const selectFields = ['drawingNoField', 'productNameField', 'pdfFileField', 'materialField', 'dimensionField', 'tagField', 'shapeTagField', 'processField'];
  const fields = [...textFields, ...selectFields];

  const LAYOUT_ONLY_TYPES = new Set(['SUBTABLE', 'GROUP', 'REFERENCE_TABLE', 'LABEL', 'SPACER', 'HR', 'RECORD_NUMBER', 'CATEGORY', 'STATUS', 'STATUS_ASSIGNEE']);

  // kintoneのサブドメインをテナントIDとして使う。手入力にすると環境間でズレるため常にドメインから再計算する。
  const deriveTenantId = () => (window.location.hostname || '').split('.')[0] || 'default';

  const getElement = (id) => document.getElementById(id);

  const config = kintone.plugin.app.getConfig(PLUGIN_ID);

  const populateSelect = (selectEl, fieldCode, properties) => {
    selectEl.innerHTML = '';

    const blankOption = document.createElement('option');
    blankOption.value = '';
    blankOption.textContent = '（未選択）';
    selectEl.appendChild(blankOption);

    const isFileField = selectEl.id === 'pdfFileField';
    const codes = Object.keys(properties)
      .filter((code) => {
        const type = properties[code].type;
        if (isFileField) return type === 'FILE';
        return !LAYOUT_ONLY_TYPES.has(type);
      })
      .sort((a, b) => a.localeCompare(b, 'ja'));

    codes.forEach((code) => {
      const option = document.createElement('option');
      option.value = code;
      const label = properties[code].label;
      option.textContent = label && label !== code ? code + '（' + label + '）' : code;
      selectEl.appendChild(option);
    });

    if (fieldCode && !codes.includes(fieldCode)) {
      const missingOption = document.createElement('option');
      missingOption.value = fieldCode;
      missingOption.textContent = fieldCode + '（現在の設定 / フィールド未検出）';
      selectEl.appendChild(missingOption);
    }

    selectEl.value = fieldCode || '';
  };

  editableTextFields.forEach((field) => {
    const element = getElement(field);
    if (element) {
      element.value = config[field] || '';
    }
  });

  getElement('tenantId').value = deriveTenantId();

  // 一括登録ボタンの表示トグル（既定: 表示）
  const bulkToggle = getElement('showBulkButton');
  if (bulkToggle) {
    bulkToggle.checked = config.showBulkButton !== 'false';
  }

  // デバッグ情報の表示トグル（既定: 非表示）
  const debugToggle = getElement('showDebugInfo');
  if (debugToggle) {
    debugToggle.checked = config.showDebugInfo === 'true';
  }

  // 接続テスト: /health で疎通、/tags（認証対象）でAPIキーを検証する
  const testBtn = getElement('testConnection');
  const testStatus = getElement('testStatus');
  const setTestStatus = (state, message) => {
    testStatus.hidden = false;
    testStatus.className = 'pb-test-status ' + state;
    testStatus.textContent = message;
  };
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      const baseUrl = (getElement('apiBaseUrl').value || '').trim().replace(/\/+$/, '');
      const apiKey = (getElement('apiKey').value || '').trim();
      if (!baseUrl) {
        setTestStatus('err', 'API Base URLを入力してください');
        return;
      }
      testBtn.disabled = true;
      setTestStatus('pending', '接続しています...（サーバー起動中は1分ほどかかることがあります）');
      try {
        const healthRes = await fetch(baseUrl + '/health');
        if (!healthRes.ok) {
          setTestStatus('err', '✗ サーバーに接続できません（HTTP ' + healthRes.status + '）');
          return;
        }
        const health = await healthRes.json();
        const engine = health.runtime ? (health.runtime.embeddingProvider || '') : '';
        const qdrant = health.runtime && health.runtime.qdrantConfigured;

        const authHeaders = apiKey ? { 'X-API-Key': apiKey } : {};
        const tagsRes = await fetch(
          baseUrl + '/tags?tenantId=' + encodeURIComponent(deriveTenantId()),
          { headers: authHeaders }
        );
        if (tagsRes.status === 401) {
          setTestStatus('err', '✗ サーバーは稼働していますが、APIキーが無効です');
          return;
        }
        if (!tagsRes.ok) {
          setTestStatus('err', '✗ 認証確認に失敗しました（HTTP ' + tagsRes.status + '）');
          return;
        }
        setTestStatus('ok',
          '✓ 接続OK（' + [engine, qdrant ? 'Qdrant接続済み' : 'Qdrant未設定'].filter(Boolean).join(' / ') + '）'
        );
      } catch (e) {
        setTestStatus('err', '✗ 接続できません: ' + e.message);
      } finally {
        testBtn.disabled = false;
      }
    });
  }

  kintone.api(kintone.api.url('/k/v1/app/form/fields', true), 'GET', { app: kintone.app.getId() })
    .then((resp) => {
      const properties = resp.properties || {};
      selectFields.forEach((field) => {
        const element = getElement(field);
        if (element) {
          populateSelect(element, config[field] || '', properties);
        }
      });
    })
    .catch(() => {
      selectFields.forEach((field) => {
        const element = getElement(field);
        if (!element) return;
        element.innerHTML = '';
        const fallbackOption = document.createElement('option');
        fallbackOption.value = config[field] || '';
        fallbackOption.textContent = (config[field] || '') + '（フィールド一覧の取得に失敗しました）';
        element.appendChild(fallbackOption);
        element.value = config[field] || '';
      });
      window.alert('フィールド一覧の取得に失敗しました。アプリの設定を確認してください。');
    });

  getElement('save').addEventListener('click', () => {
    const nextConfig = fields.reduce((acc, field) => {
      const element = getElement(field);
      acc[field] = (element.value || '').trim();
      return acc;
    }, {});

    nextConfig.showBulkButton = getElement('showBulkButton') && getElement('showBulkButton').checked ? 'true' : 'false';
    nextConfig.showDebugInfo = getElement('showDebugInfo') && getElement('showDebugInfo').checked ? 'true' : 'false';

    if (!nextConfig.apiBaseUrl) {
      window.alert('API Base URLを入力してください。');
      return;
    }

    kintone.plugin.app.setConfig(nextConfig);
  });

  getElement('cancel').addEventListener('click', () => {
    window.location.href = '../../' + kintone.app.getId() + '/plugin/';
  });
})();
