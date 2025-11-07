(function (PLUGIN_ID) {
  'use strict';

  if (!PLUGIN_ID) {
    console.warn('kintone-work-progress: プラグインIDを取得できませんでした。');
    return;
  }

  const DEFAULTS = {
    subtableCode: '証拠',
    fileFieldCode: '画像',
    memoFieldCode: 'メモ',
    authorFieldCode: '',
    timestampFieldCode: '',
    timestampFieldType: '',
    spaceFieldCode: '',
    gridColumns: 'auto',
    layout: 'grid',
    compressionEnabled: true,
    maxImageEdge: 1600,
    imageQuality: 0.85,
    memoTemplate: 'スクショ追加',
    postAddBehavior: 'instant',
    commentEnabled: false,
    commentBody: 'スクショを追加しました',
    galleryTitleMode: 'none'
  };

  const form = document.getElementById('config-form');
  const controls = {
    subtableCode: document.getElementById('subtableCode'),
    fileFieldCode: document.getElementById('fileFieldCode'),
    memoFieldCode: document.getElementById('memoFieldCode'),
    authorFieldCode: document.getElementById('authorFieldCode'),
    timestampFieldCode: document.getElementById('timestampFieldCode'),
    spaceFieldCode: document.getElementById('spaceFieldCode'),
    gridColumns: document.getElementById('gridColumns'),
    layout: document.getElementById('layout'),
    galleryTitleMode: document.getElementById('galleryTitleMode'),
    compressionEnabled: document.getElementById('compressionEnabled'),
    maxImageEdge: document.getElementById('maxImageEdge'),
    imageQuality: document.getElementById('imageQuality'),
    memoTemplate: document.getElementById('memoTemplate'),
    postAddBehaviorInstant: form.querySelector('input[name="postAddBehavior"][value="instant"]'),
    postAddBehaviorToast: form.querySelector('input[name="postAddBehavior"][value="toast"]'),
    commentEnabled: document.getElementById('commentEnabled'),
    commentBody: document.getElementById('commentBody'),
    save: document.getElementById('save'),
    cancel: document.getElementById('cancel'),
    loadingNote: document.querySelector('[data-state="loading"]'),
    errorNote: document.querySelector('[data-state="error"]')
  };

  const state = {
    metadataLoaded: false,
    subtableMap: {},
    subtableOptions: [],
    spaceOptions: []
  };

  function normalizeGridColumnsValue(value) {
    if (!value) {
      return 'auto';
    }
    const lower = String(value).toLowerCase();
    if (lower === 'two' || lower === '2' || lower === '2col') {
      return 'two';
    }
    if (lower === 'three' || lower === '3' || lower === '3col') {
      return 'three';
    }
    return 'auto';
  }
  function normalizeGalleryTitleMode(value) {
    const lower = String(value || '').toLowerCase();
    if (lower === 'subtable') {
      return 'subtable';
    }
    return 'none';
  }

  function parseConfig(rawConfig) {
    let settings = { ...DEFAULTS };
    if (rawConfig) {
      try {
        if (rawConfig.settings) {
          settings = { ...settings, ...JSON.parse(rawConfig.settings) };
        } else {
          settings = { ...settings, ...rawConfig };
        }
      } catch (error) {
        console.warn('kintone-work-progress: 設定の読み込みに失敗したため既定値を使用します。', error);
      }
    }
    settings.gridColumns = normalizeGridColumnsValue(settings.gridColumns);
    settings.galleryTitleMode = normalizeGalleryTitleMode(settings.galleryTitleMode);
    return settings;
  }

  function toggleCompressionFields(enabled) {
    controls.maxImageEdge.disabled = !enabled;
    controls.imageQuality.disabled = !enabled;
  }

  function toggleCommentBody(enabled) {
    controls.commentBody.disabled = !enabled;
  }

  function updateGridColumnsControl(layout) {
    const isGrid = layout !== 'scroll';
    controls.gridColumns.disabled = !isGrid;
    if (!isGrid) {
      controls.gridColumns.value = 'auto';
    }
  }

  function setLoadingState({ loading, error }) {
    if (controls.loadingNote) {
      controls.loadingNote.hidden = !loading;
    }
    if (controls.errorNote) {
      if (error) {
        controls.errorNote.textContent = error;
        controls.errorNote.hidden = false;
      } else {
        controls.errorNote.hidden = true;
      }
    }
  }

  function createOption(value, label, disabled = false) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.disabled = disabled;
    return option;
  }

  function populateSelect(select, options, placeholder) {
    select.innerHTML = '';
    if (placeholder) {
      select.appendChild(createOption(placeholder.value, placeholder.label, placeholder.disabled));
    }
    options.forEach((opt) => {
      select.appendChild(createOption(opt.value, opt.label));
    });
  }

  function findFieldOptions(subtableCode, predicate) {
    const fields = state.subtableMap[subtableCode];
    if (!Array.isArray(fields)) {
      return [];
    }
    return fields
      .filter(predicate)
      .map((field) => ({
        value: field.code,
        label: `${field.label || field.code} (${field.code})`
      }));
  }

  function findFieldDefinition(subtableCode, fieldCode) {
    if (!subtableCode || !fieldCode) {
      return null;
    }
    const fields = state.subtableMap[subtableCode];
    if (!Array.isArray(fields)) {
      return null;
    }
    return fields.find((field) => field.code === fieldCode) || null;
  }

  function setSelectValue(select, value) {
    if (typeof value !== 'string' || !value) {
      return;
    }
    const option = Array.from(select.options).find((opt) => opt.value === value && !opt.disabled);
    if (option) {
      select.value = value;
    }
  }

  function ensureFirstEnabledOption(select, allowEmpty = false) {
    if (!select || select.disabled || select.value) {
      return;
    }
    if (allowEmpty) {
      return;
    }
    const candidate = Array.from(select.options).find((opt) => !opt.disabled && opt.value);
    if (candidate) {
      select.value = candidate.value;
    }
  }

  function handleSubtableChange(subtableCode, preset = {}) {
    if (!subtableCode || !state.subtableMap[subtableCode]) {
      populateSelect(controls.fileFieldCode, [], { value: '', label: 'サブテーブルを選択してください', disabled: true });
      populateSelect(controls.memoFieldCode, [], { value: '', label: 'サブテーブルを選択してください', disabled: true });
      populateSelect(controls.authorFieldCode, [{ value: '', label: '未設定' }]);
      populateSelect(controls.timestampFieldCode, [{ value: '', label: '未設定' }]);
      controls.fileFieldCode.disabled = true;
      controls.memoFieldCode.disabled = true;
      controls.authorFieldCode.disabled = true;
      controls.timestampFieldCode.disabled = true;
      return;
    }

    const fileOptions = findFieldOptions(subtableCode, (field) => field.type === 'FILE');
    const memoOptions = findFieldOptions(subtableCode, (field) => ['SINGLE_LINE_TEXT', 'MULTI_LINE_TEXT', 'RICH_TEXT'].includes(field.type));
    const authorOptions = findFieldOptions(subtableCode, (field) => field.type === 'USER_SELECT');
    const timestampOptions = findFieldOptions(subtableCode, (field) => field.type === 'DATETIME' || field.type === 'DATE');

    populateSelect(
      controls.fileFieldCode,
      fileOptions,
      fileOptions.length
        ? { value: '', label: '選択してください', disabled: true }
        : { value: '', label: '選択できるフィールドがありません', disabled: true }
    );
    populateSelect(
      controls.memoFieldCode,
      memoOptions,
      memoOptions.length
        ? { value: '', label: '選択してください', disabled: true }
        : { value: '', label: '選択できるフィールドがありません', disabled: true }
    );
    populateSelect(controls.authorFieldCode, [{ value: '', label: '未設定' }, ...authorOptions]);
    populateSelect(controls.timestampFieldCode, [{ value: '', label: '未設定' }, ...timestampOptions]);

    controls.fileFieldCode.disabled = fileOptions.length === 0;
    controls.memoFieldCode.disabled = memoOptions.length === 0;
    controls.authorFieldCode.disabled = false;
    controls.timestampFieldCode.disabled = false;

    setSelectValue(controls.fileFieldCode, preset.fileFieldCode || '');
    setSelectValue(controls.memoFieldCode, preset.memoFieldCode || '');
    setSelectValue(controls.authorFieldCode, preset.authorFieldCode || '');
    setSelectValue(controls.timestampFieldCode, preset.timestampFieldCode || '');

    ensureFirstEnabledOption(controls.fileFieldCode);
    ensureFirstEnabledOption(controls.memoFieldCode);
    ensureFirstEnabledOption(controls.authorFieldCode, true);
    ensureFirstEnabledOption(controls.timestampFieldCode, true);
  }

  async function loadMetadata() {
    setLoadingState({ loading: true });
    try {
      const appId = kintone.app.getId();
      const [fieldsResponse, layoutResponse] = await Promise.all([
        kintone.api(kintone.api.url('/k/v1/app/form/fields', true), 'GET', { app: appId }),
        kintone.api(kintone.api.url('/k/v1/app/form/layout', true), 'GET', { app: appId })
      ]);

      const properties = fieldsResponse.properties || {};
      const subtableEntries = Object.keys(properties)
        .map((code) => properties[code])
        .filter((prop) => prop.type === 'SUBTABLE');

      state.subtableOptions = subtableEntries.map((prop) => ({
        value: prop.code,
        label: `${prop.label || prop.code} (${prop.code})`
      }));
      state.subtableMap = subtableEntries.reduce((acc, prop) => {
        const rawFields = prop.fields || {};
        const fieldList = Array.isArray(rawFields)
          ? rawFields.map((field) => ({ code: field.code, ...field }))
          : Object.keys(rawFields).map((code) => ({ code, ...rawFields[code] }));
        acc[prop.code] = fieldList;
        return acc;
      }, {});

      const spaceEntries = Object.keys(properties)
        .map((code) => properties[code])
        .filter((prop) => prop.type === 'SPACER');

      const spaceMap = new Map();
      spaceEntries.forEach((prop) => {
        const spaceId = prop.elementId || prop.code;
        if (spaceId && !spaceMap.has(spaceId)) {
          spaceMap.set(spaceId, prop.label || spaceId);
        }
      });

      function walk(node) {
        if (!node || typeof node !== 'object') {
          return;
        }
        if (Array.isArray(node)) {
          node.forEach((child) => walk(child));
          return;
        }
        if (node.type === 'SPACER') {
          const spaceId = node.elementId || node.code;
          if (spaceId && !spaceMap.has(spaceId)) {
            spaceMap.set(spaceId, node.label || spaceId);
          }
        }
        Object.keys(node).forEach((key) => {
          const value = node[key];
          if (Array.isArray(value) || (value && typeof value === 'object')) {
            walk(value);
          }
        });
      }

      walk(layoutResponse.layout || []);
      state.spaceOptions = Array.from(spaceMap.entries()).map(([value, label]) => ({ value, label }));

      populateSelect(
        controls.subtableCode,
        state.subtableOptions,
        state.subtableOptions.length
          ? { value: '', label: '選択してください', disabled: true }
          : { value: '', label: 'サブテーブルが見つかりません', disabled: true }
      );
      controls.subtableCode.disabled = state.subtableOptions.length === 0;

      populateSelect(controls.spaceFieldCode, [{ value: '', label: '自動配置（推奨）' }, ...state.spaceOptions]);
      controls.spaceFieldCode.disabled = false;

      state.metadataLoaded = true;
      setLoadingState({ loading: false });
    } catch (error) {
      console.error(error);
      state.metadataLoaded = false;
      setLoadingState({ loading: false, error: 'フィールド情報の取得に失敗しました。ページを再読み込みしてやり直してください。' });
    }
  }

  function applyBasicSettings(settings) {
    controls.layout.value = settings.layout;
    controls.compressionEnabled.checked = Boolean(settings.compressionEnabled);
    controls.maxImageEdge.value = settings.maxImageEdge;
    controls.imageQuality.value = settings.imageQuality;
    controls.memoTemplate.value = settings.memoTemplate || '';
    if (settings.postAddBehavior === 'toast') {
      controls.postAddBehaviorToast.checked = true;
    } else {
      controls.postAddBehaviorInstant.checked = true;
    }
    controls.commentEnabled.checked = Boolean(settings.commentEnabled);
    controls.commentBody.value = settings.commentBody || '';
    controls.gridColumns.value = normalizeGridColumnsValue(settings.gridColumns);
    controls.galleryTitleMode.value = normalizeGalleryTitleMode(settings.galleryTitleMode);

    toggleCompressionFields(controls.compressionEnabled.checked);
    toggleCommentBody(controls.commentEnabled.checked);
    updateGridColumnsControl(settings.layout);
  }

  function applyFieldSettings(settings) {
    if (!state.metadataLoaded || state.subtableOptions.length === 0) {
      return;
    }

    setSelectValue(controls.subtableCode, settings.subtableCode || '');
    ensureFirstEnabledOption(controls.subtableCode);
    handleSubtableChange(controls.subtableCode.value, settings);

    setSelectValue(controls.spaceFieldCode, settings.spaceFieldCode || '');
    ensureFirstEnabledOption(controls.spaceFieldCode, true);
  }

  function collectSettings() {
    const subtableCode = controls.subtableCode.value;
    const fileFieldCode = controls.fileFieldCode.value;
    const memoFieldCode = controls.memoFieldCode.value;
    const authorFieldCode = controls.authorFieldCode.value;
    const timestampFieldCode = controls.timestampFieldCode.value;
    const timestampFieldDefinition = findFieldDefinition(subtableCode, timestampFieldCode);

    return {
      subtableCode,
      fileFieldCode,
      memoFieldCode,
      authorFieldCode,
      timestampFieldCode,
      timestampFieldType: timestampFieldDefinition?.type || '',
      spaceFieldCode: controls.spaceFieldCode.value,
      gridColumns: controls.gridColumns.value,
      layout: controls.layout.value,
      compressionEnabled: controls.compressionEnabled.checked,
      maxImageEdge: Number(controls.maxImageEdge.value),
      imageQuality: Number(controls.imageQuality.value),
      memoTemplate: controls.memoTemplate.value,
      postAddBehavior: controls.postAddBehaviorToast.checked ? 'toast' : 'instant',
      commentEnabled: controls.commentEnabled.checked,
      commentBody: controls.commentBody.value,
      galleryTitleMode: controls.galleryTitleMode.value
    };
  }

  function validate(settings) {
    const errors = [];
    if (!settings.subtableCode) {
      errors.push('サブテーブルを選択してください。');
    }
    if (!settings.fileFieldCode) {
      errors.push('添付ファイルフィールドを選択してください。');
    }
    if (!settings.memoFieldCode) {
      errors.push('メモフィールドを選択してください。');
    }
    if (settings.compressionEnabled) {
      if (!Number.isFinite(settings.maxImageEdge) || settings.maxImageEdge < 200 || settings.maxImageEdge > 4000) {
        errors.push('最大辺は200〜4000の範囲で設定してください。');
      }
      if (!Number.isFinite(settings.imageQuality) || settings.imageQuality < 0.1 || settings.imageQuality > 1) {
        errors.push('JPEG品質は0.1〜1.0の範囲で設定してください。');
      }
    }
    if (settings.commentEnabled && !settings.commentBody.trim()) {
      errors.push('コメント本文を入力してください。');
    }
    if (!['auto', 'two', 'three'].includes(normalizeGridColumnsValue(settings.gridColumns))) {
      errors.push('グリッド列数の設定が不正です。');
    }
    if (!['none', 'subtable'].includes(normalizeGalleryTitleMode(settings.galleryTitleMode))) {
      errors.push('ギャラリータイトルの設定が不正です。');
    }
    if (!state.metadataLoaded) {
      errors.push('フィールド情報が取得できていません。ページを再読み込みしてから保存してください。');
    }
    return errors;
  }

  controls.cancel.addEventListener('click', () => {
    history.back();
  });

  controls.compressionEnabled.addEventListener('change', (event) => {
    toggleCompressionFields(event.target.checked);
  });

  controls.commentEnabled.addEventListener('change', (event) => {
    toggleCommentBody(event.target.checked);
  });

  controls.layout.addEventListener('change', (event) => {
    updateGridColumnsControl(event.target.value);
  });

  controls.subtableCode.addEventListener('change', (event) => {
    handleSubtableChange(event.target.value, {});
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const settings = collectSettings();
    const errors = validate(settings);
    if (errors.length > 0) {
      window.alert(errors.join('\n'));
      return;
    }
    kintone.plugin.app.setConfig({ settings: JSON.stringify(settings) });
  });

  (async () => {
    const raw = kintone.plugin.app.getConfig(PLUGIN_ID);
    const settings = parseConfig(raw);
    applyBasicSettings(settings);
    await loadMetadata();
    if (state.metadataLoaded) {
      applyFieldSettings(settings);
    }
    setLoadingState({ loading: false });
  })();
})(kintone.$PLUGIN_ID);
