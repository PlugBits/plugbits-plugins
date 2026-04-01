(function (PLUGIN_ID) {
  'use strict';

  if (!PLUGIN_ID) {
    console.warn('kintone-work-progress: plugin id is missing.');
    return;
  }

  const I18N = {
    ja: {
      defaultMemoTemplate: 'スクショ追加',
      defaultCommentBody: 'スクショを追加しました',
      configLoadFailed: 'kintone-work-progress: 設定の読み込みに失敗したため既定値を使用します。',
      pageTitle: '進捗スクショ・ギャラリー設定',
      pageHeading: '進捗スクショ・ギャラリー',
      lead: 'サブテーブルに保存した進捗ファイルをギャラリーで表示するプラグインです。フィールドと表示場所を設定してください。',
      fieldSettings: 'フィールド設定',
      uiBehavior: 'UI・挙動',
      loadingFields: 'アプリのフィールド情報を取得しています…',
      loadingShort: '読み込み中…',
      required: '必須',
      subtable: 'サブテーブル',
      subtableHint: 'ファイルを保存するサブテーブルを選択します。',
      fileField: '添付ファイルフィールド',
      fileFieldHint: 'サブテーブル内の添付ファイル（FILE）フィールドを選択します。',
      memoField: 'メモフィールド',
      memoFieldHint: 'サブテーブル内のテキスト系フィールドを選択します（シングル・複数行）。',
      authorField: '作成者フィールド',
      authorFieldHint: 'サブテーブル内のユーザー選択フィールド。選択すると追加時にログインユーザーを自動設定します（任意）。',
      timestampField: '作成日時フィールド',
      timestampFieldHint: 'サブテーブル内の日時（DATETIME）フィールド。追加時に現在日時を自動設定します（任意）。',
      spaceField: '表示スペース',
      spaceFieldHint: 'アップロード欄とギャラリーを表示するスペースフィールドを選択します。',
      layout: '表示レイアウト',
      layoutGrid: 'グリッド',
      layoutScroll: '横スクロール',
      layoutHint: 'ギャラリーのレイアウトを選択します。',
      galleryTitle: 'ギャラリータイトル',
      galleryTitleNone: '表示しない',
      galleryTitleSubtable: 'サブテーブル名を表示',
      galleryTitleHint: 'スペースに表示するギャラリーの見出しを選択します（表示名はサブテーブルコードを使用）。',
      imageCompression: '画像圧縮',
      enable: '有効にする',
      maxImageEdge: '最大辺（px）',
      imageQuality: 'JPEG品質（0.1〜1.0）',
      compressionHint: '貼り付け・ドラッグ&ドロップで追加した画像を自動圧縮します。',
      gridColumns: 'グリッド列数',
      gridAuto: '自動（画面幅に合わせる）',
      gridTwo: '2列固定',
      gridThree: '3列固定',
      gridColumnsHint: 'レイアウトがグリッドの場合の列数。横スクロールでは無効です。',
      memoTemplate: 'メモ初期値',
      memoTemplatePlaceholder: '例: スクショ追加',
      memoTemplateHint: '新規追加時にメモへ挿入する初期文字列。',
      recordComment: 'レコードコメント',
      autoComment: '自動でコメントを投稿する',
      commentBody: 'コメント本文',
      commentBodyPlaceholder: '例: スクショを追加しました',
      save: '保存する',
      cancel: 'キャンセル',
      selectSubtableFirst: 'サブテーブルを選択してください',
      notSet: '未設定',
      notSetDatetimeOnly: '未設定（日時フィールドのみ）',
      selectPlease: '選択してください',
      noSelectableFields: '選択できるフィールドがありません',
      noSubtableFound: 'サブテーブルが見つかりません',
      noSpaceFound: 'スペースフィールドが見つかりません',
      metadataLoadFailed: 'フィールド情報の取得に失敗しました。ページを再読み込みしてやり直してください。',
      errorSubtableRequired: 'サブテーブルを選択してください。',
      errorFileRequired: '添付ファイルフィールドを選択してください。',
      errorMemoRequired: 'メモフィールドを選択してください。',
      errorSpaceRequired: '表示スペースを選択してください。',
      errorMaxImageEdge: '最大辺は200〜4000の範囲で設定してください。',
      errorImageQuality: 'JPEG品質は0.1〜1.0の範囲で設定してください。',
      errorCommentBody: 'コメント本文を入力してください。',
      errorTimestampField: '作成日時フィールドには日時フィールドのみ指定できます。',
      errorGridColumns: 'グリッド列数の設定が不正です。',
      errorGalleryTitleMode: 'ギャラリータイトルの設定が不正です。',
      errorMetadataUnavailable: 'フィールド情報が取得できていません。ページを再読み込みしてから保存してください。'
    },
    en: {
      defaultMemoTemplate: 'File added',
      defaultCommentBody: 'Added files',
      configLoadFailed: 'kintone-work-progress: failed to load config; using defaults.',
      pageTitle: 'Work Progress Gallery Settings',
      pageHeading: 'Work Progress Gallery',
      lead: 'This plugin displays files stored in a subtable as a gallery on the record details page. Configure the fields and display space.',
      fieldSettings: 'Field settings',
      uiBehavior: 'UI and behavior',
      loadingFields: 'Loading field information from the app…',
      loadingShort: 'Loading…',
      required: 'Required',
      subtable: 'Subtable',
      subtableHint: 'Select the subtable that stores the files.',
      fileField: 'Attachment field',
      fileFieldHint: 'Select the attachment (FILE) field inside the subtable.',
      memoField: 'Memo field',
      memoFieldHint: 'Select a text field inside the subtable (single-line or multi-line).',
      authorField: 'Author field',
      authorFieldHint: 'Optional user selection field inside the subtable. When set, the logged-in user is filled automatically.',
      timestampField: 'Timestamp field',
      timestampFieldHint: 'Optional Date and time field inside the subtable. When set, the current date and time is filled in automatically.',
      spaceField: 'Display space',
      spaceFieldHint: 'Select the space field where the upload card and gallery are shown.',
      layout: 'Layout',
      layoutGrid: 'Grid',
      layoutScroll: 'Horizontal scroll',
      layoutHint: 'Choose the gallery layout.',
      galleryTitle: 'Gallery title',
      galleryTitleNone: 'Hide',
      galleryTitleSubtable: 'Show subtable label',
      galleryTitleHint: 'Choose the gallery heading shown in the space field. The subtable label is used when available.',
      imageCompression: 'Image compression',
      enable: 'Enable',
      maxImageEdge: 'Max edge (px)',
      imageQuality: 'JPEG quality (0.1 to 1.0)',
      compressionHint: 'Automatically compress images added by paste or drag and drop.',
      gridColumns: 'Grid columns',
      gridAuto: 'Auto-fit to width',
      gridTwo: 'Fixed 2 columns',
      gridThree: 'Fixed 3 columns',
      gridColumnsHint: 'Number of columns when the layout is Grid. Ignored in Horizontal scroll mode.',
      memoTemplate: 'Default memo text',
      memoTemplatePlaceholder: 'Example: Screenshot added',
      memoTemplateHint: 'Initial text inserted into the memo field when a file is added.',
      recordComment: 'Record comment',
      autoComment: 'Post a record comment automatically',
      commentBody: 'Comment body',
      commentBodyPlaceholder: 'Example: Added screenshots',
      save: 'Save',
      cancel: 'Cancel',
      selectSubtableFirst: 'Select a subtable first',
      notSet: 'Not set',
      notSetDatetimeOnly: 'Not set (Date and time fields only)',
      selectPlease: 'Please select',
      noSelectableFields: 'No selectable fields were found',
      noSubtableFound: 'No subtable was found',
      noSpaceFound: 'No space field was found',
      metadataLoadFailed: 'Failed to load field information. Reload the page and try again.',
      errorSubtableRequired: 'Select a subtable.',
      errorFileRequired: 'Select an attachment field.',
      errorMemoRequired: 'Select a memo field.',
      errorSpaceRequired: 'Select a display space.',
      errorMaxImageEdge: 'Max edge must be between 200 and 4000.',
      errorImageQuality: 'JPEG quality must be between 0.1 and 1.0.',
      errorCommentBody: 'Enter a comment body.',
      errorTimestampField: 'The timestamp field must be a Date and time field.',
      errorGridColumns: 'The grid column setting is invalid.',
      errorGalleryTitleMode: 'The gallery title setting is invalid.',
      errorMetadataUnavailable: 'Field information is unavailable. Reload the page before saving.'
    }
  };

  function normalizeLanguage(value) {
    const lower = String(value || '').toLowerCase();
    if (lower.indexOf('ja') === 0) {
      return 'ja';
    }
    if (lower.indexOf('en') === 0) {
      return 'en';
    }
    return '';
  }

  function getLanguage() {
    const cybozuRef = typeof cybozu !== 'undefined' ? cybozu : null;
    const loginUser = (typeof kintone !== 'undefined' && kintone.getLoginUser) ? kintone.getLoginUser() : null;
    const candidates = [
      cybozuRef && cybozuRef.data && cybozuRef.data.LOCALE,
      cybozuRef && cybozuRef.data && cybozuRef.data.LOGIN_USER && cybozuRef.data.LOGIN_USER.language,
      loginUser && loginUser.language,
      document.documentElement && document.documentElement.getAttribute('lang'),
      typeof navigator !== 'undefined' ? navigator.language : '',
      typeof navigator !== 'undefined' ? navigator.userLanguage : ''
    ];
    for (let i = 0; i < candidates.length; i += 1) {
      const normalized = normalizeLanguage(candidates[i]);
      if (normalized) {
        return normalized;
      }
    }
    return 'ja';
  }

  function t(key) {
    const lang = getLanguage();
    return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
  }

  function getDefaults() {
    return {
      subtableCode: '',
      fileFieldCode: '',
      memoFieldCode: '',
      authorFieldCode: '',
      timestampFieldCode: '',
      timestampFieldType: '',
      spaceFieldCode: '',
      gridColumns: 'auto',
      layout: 'grid',
      compressionEnabled: true,
      maxImageEdge: 1600,
      imageQuality: 0.85,
      memoTemplate: t('defaultMemoTemplate'),
      commentEnabled: false,
      commentBody: t('defaultCommentBody'),
      galleryTitleMode: 'none'
    };
  }

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
    let settings = getDefaults();
    if (rawConfig) {
      try {
        if (rawConfig.settings) {
          settings = { ...settings, ...JSON.parse(rawConfig.settings) };
        } else {
          settings = { ...settings, ...rawConfig };
        }
      } catch (error) {
        console.warn(t('configLoadFailed'), error);
      }
    }
    settings.gridColumns = normalizeGridColumnsValue(settings.gridColumns);
    settings.galleryTitleMode = normalizeGalleryTitleMode(settings.galleryTitleMode);
    return settings;
  }

  function setRequiredLabel(forName, text) {
    const label = document.querySelector(`label[for="${forName}"]`);
    if (!label) {
      return;
    }
    label.innerHTML = `${text}<span class="kwp-field__required">${t('required')}</span>`;
  }

  function setLabelText(forName, text) {
    const label = document.querySelector(`label[for="${forName}"]`);
    if (label) {
      label.textContent = text;
    }
  }

  function setFieldHint(control, text) {
    const hint = control && control.closest('.kwp-field') && control.closest('.kwp-field').querySelector('.kwp-field__hint');
    if (hint) {
      hint.textContent = text;
    }
  }

  function applyTranslations() {
    document.documentElement.lang = getLanguage();
    document.title = t('pageTitle');
    const pageTitle = document.querySelector('.kwp-config__title');
    if (pageTitle) {
      pageTitle.textContent = t('pageHeading');
    }
    const lead = document.querySelector('.kwp-config__lead');
    if (lead) {
      lead.textContent = t('lead');
    }
    const sectionTitles = document.querySelectorAll('.kwp-section__title');
    if (sectionTitles[0]) {
      sectionTitles[0].textContent = t('fieldSettings');
    }
    if (sectionTitles[1]) {
      sectionTitles[1].textContent = t('uiBehavior');
    }
    if (controls.loadingNote) {
      controls.loadingNote.textContent = t('loadingFields');
    }
    if (controls.subtableCode && controls.subtableCode.options[0] && !state.metadataLoaded) {
      controls.subtableCode.options[0].textContent = t('loadingShort');
    }

    setRequiredLabel('subtableCode', t('subtable'));
    setRequiredLabel('fileFieldCode', t('fileField'));
    setRequiredLabel('memoFieldCode', t('memoField'));
    setLabelText('authorFieldCode', t('authorField'));
    setLabelText('timestampFieldCode', t('timestampField'));
    setRequiredLabel('spaceFieldCode', t('spaceField'));
    setLabelText('layout', t('layout'));
    setLabelText('galleryTitleMode', t('galleryTitle'));
    setLabelText('gridColumns', t('gridColumns'));
    setLabelText('memoTemplate', t('memoTemplate'));

    setFieldHint(controls.subtableCode, t('subtableHint'));
    setFieldHint(controls.fileFieldCode, t('fileFieldHint'));
    setFieldHint(controls.memoFieldCode, t('memoFieldHint'));
    setFieldHint(controls.authorFieldCode, t('authorFieldHint'));
    setFieldHint(controls.timestampFieldCode, t('timestampFieldHint'));
    setFieldHint(controls.spaceFieldCode, t('spaceFieldHint'));
    setFieldHint(controls.layout, t('layoutHint'));
    setFieldHint(controls.galleryTitleMode, t('galleryTitleHint'));
    setFieldHint(controls.gridColumns, t('gridColumnsHint'));
    setFieldHint(controls.memoTemplate, t('memoTemplateHint'));

    const legends = document.querySelectorAll('legend.kwp-field__label');
    if (legends[0]) {
      legends[0].textContent = t('imageCompression');
    }
    if (legends[1]) {
      legends[1].textContent = t('recordComment');
    }

    if (controls.compressionEnabled && controls.compressionEnabled.nextElementSibling) {
      controls.compressionEnabled.nextElementSibling.textContent = t('enable');
    }
    if (controls.commentEnabled && controls.commentEnabled.nextElementSibling) {
      controls.commentEnabled.nextElementSibling.textContent = t('autoComment');
    }

    const maxImageEdgeLabel = controls.maxImageEdge && controls.maxImageEdge.closest('label');
    if (maxImageEdgeLabel) {
      const span = maxImageEdgeLabel.querySelector('span');
      if (span) {
        span.textContent = t('maxImageEdge');
      }
    }
    const imageQualityLabel = controls.imageQuality && controls.imageQuality.closest('label');
    if (imageQualityLabel) {
      const span = imageQualityLabel.querySelector('span');
      if (span) {
        span.textContent = t('imageQuality');
      }
    }
    const compressionHint = document.querySelector('.kwp-field--group .kwp-field__hint');
    if (compressionHint) {
      compressionHint.textContent = t('compressionHint');
    }

    const commentBodyLabel = controls.commentBody && controls.commentBody.closest('.kwp-field__sub');
    if (commentBodyLabel) {
      const span = commentBodyLabel.querySelector('span');
      if (span) {
        span.textContent = t('commentBody');
      }
    }

    controls.layout.options[0].textContent = t('layoutGrid');
    controls.layout.options[1].textContent = t('layoutScroll');
    controls.galleryTitleMode.options[0].textContent = t('galleryTitleNone');
    controls.galleryTitleMode.options[1].textContent = t('galleryTitleSubtable');
    controls.gridColumns.options[0].textContent = t('gridAuto');
    controls.gridColumns.options[1].textContent = t('gridTwo');
    controls.gridColumns.options[2].textContent = t('gridThree');

    controls.memoTemplate.placeholder = t('memoTemplatePlaceholder');
    controls.commentBody.placeholder = t('commentBodyPlaceholder');
    controls.save.textContent = t('save');
    controls.cancel.textContent = t('cancel');
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
      populateSelect(controls.fileFieldCode, [], { value: '', label: t('selectSubtableFirst'), disabled: true });
      populateSelect(controls.memoFieldCode, [], { value: '', label: t('selectSubtableFirst'), disabled: true });
      populateSelect(controls.authorFieldCode, [{ value: '', label: t('notSet') }]);
      populateSelect(controls.timestampFieldCode, [{ value: '', label: t('notSetDatetimeOnly') }]);
      controls.fileFieldCode.disabled = true;
      controls.memoFieldCode.disabled = true;
      controls.authorFieldCode.disabled = true;
      controls.timestampFieldCode.disabled = true;
      return;
    }

    const fileOptions = findFieldOptions(subtableCode, (field) => field.type === 'FILE');
    const memoOptions = findFieldOptions(subtableCode, (field) => ['SINGLE_LINE_TEXT', 'MULTI_LINE_TEXT', 'RICH_TEXT'].includes(field.type));
    const authorOptions = findFieldOptions(subtableCode, (field) => field.type === 'USER_SELECT');
    const timestampOptions = findFieldOptions(subtableCode, (field) => field.type === 'DATETIME');

    populateSelect(
      controls.fileFieldCode,
      fileOptions,
      fileOptions.length
        ? { value: '', label: t('selectPlease'), disabled: true }
        : { value: '', label: t('noSelectableFields'), disabled: true }
    );
    populateSelect(
      controls.memoFieldCode,
      memoOptions,
      memoOptions.length
        ? { value: '', label: t('selectPlease'), disabled: true }
        : { value: '', label: t('noSelectableFields'), disabled: true }
    );
    populateSelect(controls.authorFieldCode, [{ value: '', label: t('notSet') }, ...authorOptions]);
    populateSelect(controls.timestampFieldCode, [{ value: '', label: t('notSetDatetimeOnly') }, ...timestampOptions]);

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
          ? { value: '', label: t('selectPlease'), disabled: true }
          : { value: '', label: t('noSubtableFound'), disabled: true }
      );
      controls.subtableCode.disabled = state.subtableOptions.length === 0;

      populateSelect(
        controls.spaceFieldCode,
        state.spaceOptions,
        state.spaceOptions.length
          ? { value: '', label: t('selectPlease'), disabled: true }
          : { value: '', label: t('noSpaceFound'), disabled: true }
      );
      controls.spaceFieldCode.disabled = state.spaceOptions.length === 0;

      state.metadataLoaded = true;
      setLoadingState({ loading: false });
    } catch (error) {
      console.error(error);
      state.metadataLoaded = false;
      setLoadingState({ loading: false, error: t('metadataLoadFailed') });
    }
  }

  function applyBasicSettings(settings) {
    controls.layout.value = settings.layout;
    controls.compressionEnabled.checked = Boolean(settings.compressionEnabled);
    controls.maxImageEdge.value = settings.maxImageEdge;
    controls.imageQuality.value = settings.imageQuality;
    controls.memoTemplate.value = settings.memoTemplate || '';
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
    ensureFirstEnabledOption(controls.spaceFieldCode);
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
      commentEnabled: controls.commentEnabled.checked,
      commentBody: controls.commentBody.value,
      galleryTitleMode: controls.galleryTitleMode.value
    };
  }

  function validate(settings) {
    const errors = [];
    if (!settings.subtableCode) {
      errors.push(t('errorSubtableRequired'));
    }
    if (!settings.fileFieldCode) {
      errors.push(t('errorFileRequired'));
    }
    if (!settings.memoFieldCode) {
      errors.push(t('errorMemoRequired'));
    }
    if (!settings.spaceFieldCode) {
      errors.push(t('errorSpaceRequired'));
    }
    if (settings.compressionEnabled) {
      if (!Number.isFinite(settings.maxImageEdge) || settings.maxImageEdge < 200 || settings.maxImageEdge > 4000) {
        errors.push(t('errorMaxImageEdge'));
      }
      if (!Number.isFinite(settings.imageQuality) || settings.imageQuality < 0.1 || settings.imageQuality > 1) {
        errors.push(t('errorImageQuality'));
      }
    }
    if (settings.commentEnabled && !settings.commentBody.trim()) {
      errors.push(t('errorCommentBody'));
    }
    if (settings.timestampFieldCode && settings.timestampFieldType !== 'DATETIME') {
      errors.push(t('errorTimestampField'));
    }
    if (!['auto', 'two', 'three'].includes(normalizeGridColumnsValue(settings.gridColumns))) {
      errors.push(t('errorGridColumns'));
    }
    if (!['none', 'subtable'].includes(normalizeGalleryTitleMode(settings.galleryTitleMode))) {
      errors.push(t('errorGalleryTitleMode'));
    }
    if (!state.metadataLoaded) {
      errors.push(t('errorMetadataUnavailable'));
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
    applyTranslations();
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
