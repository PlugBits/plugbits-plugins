(() => {
  'use strict';

  const PLUGIN_ID = kintone.$PLUGIN_ID;
  const textFields = ['apiBaseUrl', 'tenantId', 'tagSpaceId', 'processOptions'];
  const selectFields = ['drawingNoField', 'productNameField', 'pdfFileField', 'materialField', 'dimensionField', 'tagField', 'processField'];
  const fields = [...textFields, ...selectFields];

  const LAYOUT_ONLY_TYPES = new Set(['SUBTABLE', 'GROUP', 'REFERENCE_TABLE', 'LABEL', 'SPACER', 'HR', 'RECORD_NUMBER', 'CATEGORY', 'STATUS', 'STATUS_ASSIGNEE']);

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

  textFields.forEach((field) => {
    const element = getElement(field);
    if (element) {
      element.value = config[field] || '';
    }
  });

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
