(function (PLUGIN_ID) {
  'use strict';

  if (!PLUGIN_ID) {
    console.warn('kintone-work-progress: plugin id is missing.');
    return;
  }

  const EVENT_TYPES = ['app.record.detail.show'];

  const state = {
    settings: null,
    appId: kintone.app.getId(),
    recordId: null,
    revision: null,
    record: null,
    rows: [],
    canEdit: true,
    busy: false,
    elements: {},
    lightbox: null,
    fieldTypes: {},
    metadataLoaded: false,
    subtableLabel: '',
    dragResetCleanup: null
  };

  const fileUrlCache = new Map();
  const fileUrlPromises = new Map();

  const TEXT = {
    ja: {
      defaultMemoTemplate: 'スクショ追加',
      defaultCommentBody: 'スクショを追加しました',
      invalidDate: '---',
      imageLoadFailed: '画像の読み込みに失敗しました。',
      busyProcessing: '処理中です…',
      pasteHint: 'Ctrl/⌘+V ですぐに貼り付けられます',
      recordIdMissing: 'レコードIDが不明です。',
      fieldMetadataLoadFailed: 'kintone-work-progress: フィールド情報の取得に失敗しました。',
      deleteFileAria: 'ファイルを削除',
      unknownFile: 'ファイル',
      openFileAria: '{name} を開く',
      emptyMemo: 'メモは未入力',
      clickToEdit: 'クリックして編集',
      viewOnly: '閲覧のみ',
      memoUpdateFailed: 'メモの更新に失敗しました。',
      subtableUnavailable: 'サブテーブルを取得できませんでした。',
      targetRowMissing: '対象の行が見つかりません。',
      targetRowMissingDelete: '対象の行が見つかりませんでした。',
      confirmDelete: 'このファイルを削除しますか？',
      deletingFile: 'ファイルを削除しています…',
      deleteFileFailed: 'ファイルの削除に失敗しました。',
      closePreview: 'プレビューを閉じる',
      close: '閉じる',
      loading: '読み込み中…',
      fileLoadFailed: 'ファイルを読み込めませんでした。',
      openExternal: '外部で表示',
      previewTitle: '{name} プレビュー',
      unsupportedPreview: 'このファイル形式はプレビューに対応していません。',
      uploadTitle: 'アップロード',
      uploadStatus: 'D&D / Ctrl/⌘+V',
      chooseFile: 'ファイルを選択',
      pasteShort: '貼る',
      uploadHint: '画像・PDF・その他のファイルを追加できます',
      gallery: 'ギャラリー',
      emptyGallery: 'まだファイルがありません。Ctrl/⌘+V やドラッグ&ドロップで追加できます。',
      dropToAdd: 'ドロップして追加',
      noPasteableImage: '貼り付け可能な画像が見つかりませんでした。',
      noReadableFile: '読み取れるファイルがありませんでした。',
      noReadableFileSelected: '読み取れるファイルが選択されませんでした。',
      spaceNotFound: 'kintone-work-progress: 表示スペースが見つからないため描画を停止します。',
      imageCompressFailed: '画像の圧縮に失敗しました。',
      uploadFailed: 'ファイルのアップロードに失敗しました。',
      timestampMustBeDatetime: '作成日時フィールドには日時フィールドのみ対応しています。設定を見直してください。',
      commentPostFailed: 'kintone-work-progress: コメント投稿に失敗しました。',
      processingFiles: 'ファイルを処理しています…',
      uploadFailedWithName: 'アップロードに失敗しました: {name}',
      noUploadableFiles: 'アップロード可能なファイルがありませんでした。',
      addFileFailed: 'ファイルの追加に失敗しました。',
      settingsMissing: 'kintone-work-progress: 設定が不足しているため停止します。',
      recordLoadFailed: 'ファイルを読み込めませんでした。',
      fileKeyMissing: 'fileKey is missing.',
      fetchFileFailed: 'ファイルの取得に失敗しました: {status}',
      configLoadFailed: 'kintone-work-progress: 設定の読み込みに失敗したため既定値を使用します。'
    },
    en: {
      defaultMemoTemplate: 'File added',
      defaultCommentBody: 'Added files',
      invalidDate: '---',
      imageLoadFailed: 'Failed to load the image.',
      busyProcessing: 'Processing…',
      pasteHint: 'Paste with Ctrl/⌘+V',
      recordIdMissing: 'Record ID is missing.',
      fieldMetadataLoadFailed: 'kintone-work-progress: failed to load field metadata.',
      deleteFileAria: 'Delete file',
      unknownFile: 'File',
      openFileAria: 'Open {name}',
      emptyMemo: 'No memo',
      clickToEdit: 'Click to edit',
      viewOnly: 'View only',
      memoUpdateFailed: 'Failed to update the memo.',
      subtableUnavailable: 'Could not load the subtable.',
      targetRowMissing: 'The target row could not be found.',
      targetRowMissingDelete: 'The target row could not be found.',
      confirmDelete: 'Delete this file?',
      deletingFile: 'Deleting file…',
      deleteFileFailed: 'Failed to delete the file.',
      closePreview: 'Close preview',
      close: 'Close',
      loading: 'Loading…',
      fileLoadFailed: 'Failed to load the file.',
      openExternal: 'Open externally',
      previewTitle: '{name} preview',
      unsupportedPreview: 'Preview is not available for this file type.',
      uploadTitle: 'Upload',
      uploadStatus: 'Drag & drop / Ctrl/⌘+V',
      chooseFile: 'Select files',
      pasteShort: 'Paste',
      uploadHint: 'Add images, PDFs, and other files.',
      gallery: 'Gallery',
      emptyGallery: 'No files yet. Add them with Ctrl/⌘+V or drag and drop.',
      dropToAdd: 'Drop to add',
      noPasteableImage: 'No pasteable image was found.',
      noReadableFile: 'No readable file was found.',
      noReadableFileSelected: 'No readable file was selected.',
      spaceNotFound: 'kintone-work-progress: display space was not found; rendering stopped.',
      imageCompressFailed: 'Failed to compress the image.',
      uploadFailed: 'Failed to upload the file.',
      timestampMustBeDatetime: 'The timestamp field must be a Date and time field.',
      commentPostFailed: 'kintone-work-progress: failed to post the comment.',
      processingFiles: 'Processing files…',
      uploadFailedWithName: 'Upload failed: {name}',
      noUploadableFiles: 'No uploadable files were found.',
      addFileFailed: 'Failed to add the file.',
      settingsMissing: 'kintone-work-progress: required settings are missing.',
      recordLoadFailed: 'Failed to load the files.',
      fileKeyMissing: 'fileKey is missing.',
      fetchFileFailed: 'Failed to fetch the file: {status}',
      configLoadFailed: 'kintone-work-progress: failed to load config; using defaults.'
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

  function getLocaleTag() {
    return getLanguage() === 'ja' ? 'ja-JP' : 'en-US';
  }

  function t(key, replacements) {
    const lang = getLanguage();
    const source = (TEXT[lang] && TEXT[lang][key]) || TEXT.en[key] || key;
    if (!replacements) {
      return source;
    }
    return source.replace(/\{(\w+)\}/g, (match, token) => (
      Object.prototype.hasOwnProperty.call(replacements, token) ? String(replacements[token]) : match
    ));
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

  function normalizeGalleryTitleMode(value) {
    if (!value) {
      return 'none';
    }
    const lower = String(value).toLowerCase();
    if (lower === 'subtable') {
      return 'subtable';
    }
    return 'none';
  }

  function parseSettings(raw) {
    if (!raw) {
      return getDefaults();
    }
    try {
      if (raw.settings) {
        const parsed = { ...getDefaults(), ...JSON.parse(raw.settings) };
        parsed.galleryTitleMode = normalizeGalleryTitleMode(parsed.galleryTitleMode);
        return parsed;
      }
      const merged = { ...getDefaults(), ...raw };
      merged.galleryTitleMode = normalizeGalleryTitleMode(merged.galleryTitleMode);
      return merged;
    } catch (error) {
      console.warn(t('configLoadFailed'), error);
      return getDefaults();
    }
  }

  function detectEditable(record) {
    if (record && record.$permissions && typeof record.$permissions.editable === 'boolean') {
      return record.$permissions.editable;
    }
    return true;
  }

  function hydrateFieldTypesFromRecord(record) {
    if (!record || !state.settings || !state.settings.subtableCode) {
      return;
    }
    const subtable = record[state.settings.subtableCode];
    if (!subtable || subtable.type !== 'SUBTABLE' || !Array.isArray(subtable.value)) {
      return;
    }
    subtable.value.forEach((row) => {
      const value = row?.value;
      if (!value) {
        return;
      }
      Object.keys(value).forEach((code) => {
        const field = value[code];
        if (field && field.type && !state.fieldTypes[code]) {
          state.fieldTypes[code] = field.type;
        }
      });
    });
  }

  function formatTimestamp(isoLike) {
    if (!isoLike) {
      return t('invalidDate');
    }
    const date = new Date(isoLike);
    if (Number.isNaN(date.getTime())) {
      return t('invalidDate');
    }
    const formatter = new Intl.DateTimeFormat(getLocaleTag(), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    return formatter.format(date);
  }

  function formatLocalDateString(date = new Date()) {
    const pad = (value) => String(Math.abs(value)).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function formatLocalDateTimeString(date = new Date()) {
    // Generates an ISO-8601 string that preserves the user's local timezone offset.
    const pad = (value) => String(Math.abs(value)).padStart(2, '0');
    const datePart = formatLocalDateString(date);
    const timePart = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    const offsetMinutes = date.getTimezoneOffset();
    const sign = offsetMinutes <= 0 ? '+' : '-';
    const offsetHours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
    const offsetRemainder = pad(Math.abs(offsetMinutes) % 60);
    return `${datePart}T${timePart}${sign}${offsetHours}:${offsetRemainder}`;
  }

  function getTimestampFieldType() {
    if (!state.settings || !state.settings.timestampFieldCode) {
      return null;
    }
    const code = state.settings.timestampFieldCode;
    if (state.fieldTypes && state.fieldTypes[code]) {
      return state.fieldTypes[code];
    }
    return state.settings.timestampFieldType || null;
  }

  function getRequestToken() {
    if (typeof kintone.getRequestToken === 'function') {
      return kintone.getRequestToken();
    }
    const token = document.querySelector('input[name="__REQUEST_TOKEN__"]');
    return token ? token.value : '';
  }

  function setStatusMessage(message) {
    const status = state.elements.status;
    if (!status) {
      return;
    }
    if (!status.dataset.kwpDefaultMessage) {
      status.dataset.kwpDefaultMessage = status.textContent || '';
    }
    status.textContent = message || status.dataset.kwpDefaultMessage;
  }

  function extractExtension(name) {
    if (!name) {
      return '';
    }
    const dot = name.lastIndexOf('.');
    if (dot <= 0 || dot === name.length - 1) {
      return '';
    }
    return name.slice(dot + 1).toLowerCase();
  }

  function describeFile(file) {
    if (!file) {
      return { kind: 'unknown', extension: '' };
    }
    const type = (file.contentType || '').toLowerCase();
    const extension = extractExtension(file.name || '');
    if (type.startsWith('image/')) {
      return { kind: 'image', extension };
    }
    if (type === 'application/pdf' || extension === 'pdf') {
      return { kind: 'pdf', extension: 'pdf' };
    }
    return { kind: 'other', extension };
  }

  function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) {
      return '';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    const precision = size >= 100 || unitIndex === 0 ? 0 : 1;
    return `${size.toFixed(precision)} ${units[unitIndex]}`;
  }

  function clampZoom(lightbox, value) {
    const min = typeof lightbox.zoomMin === 'number' ? lightbox.zoomMin : 0.5;
    const max = typeof lightbox.zoomMax === 'number' ? lightbox.zoomMax : 4;
    return Math.min(max, Math.max(min, value));
  }

  function applyLightboxZoom(lightbox) {
    if (!lightbox) {
      return;
    }
    const zoomValue = lightbox.zoom || 1;
    if (lightbox.zoomLabel) {
      const percent = Math.round(zoomValue * 100);
      lightbox.zoomLabel.textContent = `${percent}%`;
    }
    if (lightbox.kind === 'image' && lightbox.assetElement) {
      lightbox.assetElement.style.transform = `scale(${zoomValue})`;
    } else if (lightbox.kind === 'pdf' && lightbox.assetElement && lightbox.pdfBase) {
      const percent = Math.round(zoomValue * 100);
      const isPageWidth = Math.abs(zoomValue - 1) < 0.001;
      const zoomParam = isPageWidth ? 'page-width' : percent;
      const src = `${lightbox.pdfBase}&zoom=${zoomParam}`;
      if (lightbox.assetElement.dataset.currentSrc !== src) {
        lightbox.assetElement.dataset.currentSrc = src;
        lightbox.assetElement.src = src;
      }
    }
  }

  function setLightboxZoom(lightbox, nextZoom) {
    if (!lightbox) {
      return;
    }
    const clamped = clampZoom(lightbox, nextZoom);
    if (clamped === lightbox.zoom) {
      applyLightboxZoom(lightbox);
      return;
    }
    lightbox.zoom = clamped;
    applyLightboxZoom(lightbox);
  }

  function adjustLightboxZoom(lightbox, delta) {
    if (!lightbox) {
      return;
    }
    const current = typeof lightbox.zoom === 'number' ? lightbox.zoom : 1;
    setLightboxZoom(lightbox, current + delta);
  }



  function hideNativeSubtable() {
    const element = kintone.app.record.getFieldElement(state.settings.subtableCode);
    if (element) {
      element.style.display = 'none';
      element.setAttribute('aria-hidden', 'true');
    }
  }

  function getFileEndpointUrl(fileKey) {
    const base = kintone.api.url('/k/v1/file', true);
    return `${base}?fileKey=${encodeURIComponent(fileKey)}`;
  }

  async function ensureFileUrl(fileKey) {
    if (!fileKey) {
      throw new Error(t('fileKeyMissing'));
    }
    if (fileUrlCache.has(fileKey)) {
      return fileUrlCache.get(fileKey);
    }
    if (!fileUrlPromises.has(fileKey)) {
      const request = fetch(getFileEndpointUrl(fileKey), {
        method: 'GET',
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include'
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(t('fetchFileFailed', { status: response.status }));
          }
          return response.blob();
        })
        .then((blob) => {
          const objectUrl = URL.createObjectURL(blob);
          fileUrlCache.set(fileKey, objectUrl);
          fileUrlPromises.delete(fileKey);
          return objectUrl;
        })
        .catch((error) => {
          fileUrlPromises.delete(fileKey);
          throw error;
        });
      fileUrlPromises.set(fileKey, request);
    }
    return fileUrlPromises.get(fileKey);
  }

  function assignImageSource(img, fileKey) {
    if (!img) {
      return;
    }
    img.dataset.fileKey = fileKey || '';
    img.classList.add('kwp-card__thumb-img--loading');
    img.classList.remove('kwp-card__thumb-img--error');
    img.removeAttribute('src');
    if (!fileKey) {
      img.classList.remove('kwp-card__thumb-img--loading');
      return;
    }
    ensureFileUrl(fileKey)
      .then((objectUrl) => {
        if (img.dataset.fileKey === fileKey) {
          img.src = objectUrl;
          img.classList.remove('kwp-card__thumb-img--loading');
          img.classList.remove('kwp-card__thumb-img--error');
        }
      })
      .catch((error) => {
        console.error(error);
        img.classList.remove('kwp-card__thumb-img--loading');
        img.classList.add('kwp-card__thumb-img--error');
        pushToast(t('imageLoadFailed'), 'error');
      });
  }
  function pushToast(message, tone) {
    const stack = state.elements.toastStack;
    if (!stack) {
      return;
    }
    const toast = document.createElement('div');
    toast.className = `kwp-toast kwp-toast--${tone || 'info'}`;
    toast.textContent = message;
    stack.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add('kwp-toast--visible');
    });
    setTimeout(() => {
      toast.classList.remove('kwp-toast--visible');
      toast.addEventListener('transitionend', () => {
        toast.remove();
      }, { once: true });
    }, 3600);
  }

  function setBusy(isBusy, message) {
    state.busy = isBusy;
    const { panel, status } = state.elements;
    if (panel) {
      panel.classList.toggle('kwp-panel--busy', isBusy);
    }
    if (status) {
      status.textContent = message || (isBusy ? t('busyProcessing') : t('pasteHint'));
    }
  }

  function mapRows(record) {
    const subtable = record?.[state.settings.subtableCode];
    if (!subtable || subtable.type !== 'SUBTABLE') {
      return [];
    }
    const rows = subtable.value
      .map((row) => {
        const fileField = row.value[state.settings.fileFieldCode];
        const memoField = row.value[state.settings.memoFieldCode];
        const authorField = state.settings.authorFieldCode ? row.value[state.settings.authorFieldCode] : null;
        const timestampField = state.settings.timestampFieldCode ? row.value[state.settings.timestampFieldCode] : null;
        const file = Array.isArray(fileField?.value) ? fileField.value[0] : null;
        if (!file) {
          return null;
        }
        const memoText = memoField?.value || '';
        let authorName = '';
        if (authorField && Array.isArray(authorField.value) && authorField.value.length > 0) {
          authorName = authorField.value[0].name || authorField.value[0].code || '';
        }
        const timestamp = timestampField?.value || '';
        return {
          id: row.id,
          file,
          memoText,
          authorName,
          timestamp
        };
      })
      .filter(Boolean);
    return rows.sort((a, b) => {
      if (a.timestamp && b.timestamp) {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      }
      return b.id - a.id;
    });
  }

  function applyRecordSnapshot(record) {
    if (!record) {
      state.record = null;
      state.rows = [];
      state.canEdit = false;
      updatePanelMode();
      renderGallery();
      return;
    }
    state.record = record;
    const revisionSource = record.$revision && 'value' in record.$revision ? record.$revision.value : record.$revision;
    const revisionNumber = Number(revisionSource);
    if (!Number.isNaN(revisionNumber)) {
      state.revision = revisionNumber;
    }
    state.canEdit = detectEditable(record);
    hydrateFieldTypesFromRecord(record);
    state.rows = mapRows(record);
    updatePanelMode();
    renderGallery();
  }

  async function ensureLatestRecord() {
    if (!state.recordId) {
      throw new Error(t('recordIdMissing'));
    }
    const response = await kintone.api(kintone.api.url('/k/v1/record', true), 'GET', {
      app: state.appId,
      id: state.recordId
    });
    applyRecordSnapshot(response.record);
  }

  async function loadFieldMetadata() {
    if (state.metadataLoaded) {
      return;
    }
    state.fieldTypes = {};
    state.subtableLabel = state.settings.subtableCode || '';
    try {
      const response = await kintone.api(kintone.api.url('/k/v1/app/form/fields', true), 'GET', {
        app: state.appId
      });
      const properties = response.properties || {};
      const subtable = properties[state.settings.subtableCode];
      if (subtable && subtable.type === 'SUBTABLE') {
        const rawFields = subtable.fields || {};
        const normalizedFields = Array.isArray(rawFields)
          ? rawFields
          : Object.keys(rawFields).map((code) => ({ code, ...(rawFields[code] || {}) }));
        state.fieldTypes = normalizedFields.reduce((acc, field) => {
          if (field && field.code) {
            acc[field.code] = field.type;
          }
          return acc;
        }, {});
        if (typeof subtable.label === 'string' && subtable.label.trim()) {
          state.subtableLabel = subtable.label.trim();
        }
      }
    } catch (error) {
      console.warn(t('fieldMetadataLoadFailed'), error);
      state.fieldTypes = {};
      state.subtableLabel = state.settings.subtableCode || '';
    } finally {
      state.metadataLoaded = true;
      updateGalleryTitle();
    }
  }

  function updatePanelMode() {
    applyGridColumns();
  }

  function clearGallery() {
    const list = state.elements.list;
    if (list) {
      list.innerHTML = '';
    }
  }

  function renderGallery() {
    const { list, empty } = state.elements;
    if (!list || !empty) {
      return;
    }
    clearGallery();
    const fragment = document.createDocumentFragment();
    if (state.canEdit && state.elements.panel) {
      fragment.appendChild(state.elements.panel);
    }
    if (!state.rows.length) {
      empty.hidden = false;
      if (fragment.childNodes.length) {
        list.appendChild(fragment);
      }
      return;
    }
    empty.hidden = true;
    state.rows.forEach((row) => {
      const item = document.createElement('li');
      item.className = 'kwp-card';
      item.dataset.rowId = row.id;

      if (state.canEdit) {
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'kwp-card__delete';
        deleteButton.setAttribute('aria-label', t('deleteFileAria'));
        deleteButton.innerHTML = '×';
        deleteButton.addEventListener('click', (event) => {
          event.stopPropagation();
          handleDeleteRow(row);
        });
        item.appendChild(deleteButton);
      }

      const thumbButton = document.createElement('button');
      thumbButton.type = 'button';
      thumbButton.className = 'kwp-card__thumb';
      const fileName = row.file?.name || t('unknownFile');
      thumbButton.setAttribute('aria-label', t('openFileAria', { name: fileName }));
      thumbButton.title = fileName;

      const { kind, extension } = describeFile(row.file);
      if (kind === 'image') {
        thumbButton.classList.add('kwp-card__thumb--image');
        const img = document.createElement('img');
        img.alt = row.memoText || fileName;
        img.loading = 'lazy';
        thumbButton.appendChild(img);
        assignImageSource(img, row.file.fileKey);
      } else {
        thumbButton.classList.add('kwp-card__thumb--file');
        const badge = document.createElement('span');
        badge.className = 'kwp-card__thumb-file-icon';
        badge.textContent = kind === 'pdf' ? 'PDF' : (extension || 'FILE').slice(0, 4).toUpperCase();
        thumbButton.appendChild(badge);
      }
      thumbButton.addEventListener('click', () => openLightbox(row));

      const body = document.createElement('div');
      body.className = 'kwp-card__body';

      const filename = document.createElement('p');
      filename.className = 'kwp-card__filename';
      filename.textContent = fileName;
      filename.title = fileName;

      const memo = document.createElement('button');
      memo.type = 'button';
      memo.className = 'kwp-card__memo';
      memo.textContent = row.memoText || t('emptyMemo');
      memo.disabled = !state.canEdit;
      memo.title = state.canEdit ? t('clickToEdit') : t('viewOnly');
      if (state.canEdit) {
        memo.addEventListener('click', () => openMemoEditor(row));
      }

      const meta = document.createElement('footer');
      meta.className = 'kwp-card__meta';
      meta.innerHTML = [
        `<time datetime="${row.timestamp || ''}">${formatTimestamp(row.timestamp)}</time>`,
        row.authorName ? `<span class="kwp-card__author">${row.authorName}</span>` : ''
      ].join('');

      body.appendChild(filename);
      body.appendChild(memo);
      body.appendChild(meta);
      item.appendChild(thumbButton);
      item.appendChild(body);
      fragment.appendChild(item);
    });
    list.appendChild(fragment);
    list.scrollTop = 0;
    if (state.settings.layout === 'scroll') {
      list.scrollLeft = 0;
    }
  }

  function openMemoEditor(row) {
    const card = state.elements.list?.querySelector(`.kwp-card[data-row-id="${row.id}"]`);
    if (!card) {
      return;
    }
    const memoButton = card.querySelector('.kwp-card__memo');
    if (!memoButton || memoButton.dataset.editing === 'true') {
      return;
    }
    memoButton.dataset.editing = 'true';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'kwp-card__memo-input';
    input.value = row.memoText;
    input.maxLength = 254;
    memoButton.textContent = '';
    memoButton.appendChild(input);
    input.focus();
    input.select();

    const finish = async (commit) => {
      if (memoButton.dataset.editing !== 'true') {
        return;
      }
      const newValue = commit ? input.value.trim() : row.memoText;
      memoButton.dataset.editing = 'false';
      memoButton.innerHTML = '';
      memoButton.textContent = newValue || t('emptyMemo');
      if (commit && newValue !== row.memoText) {
        memoButton.disabled = true;
        try {
          await updateMemo(row.id, newValue);
          window.location.reload();
        } catch (error) {
          console.error(error);
          pushToast(t('memoUpdateFailed'), 'error');
        } finally {
          memoButton.disabled = false;
        }
      }
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  async function updateMemo(rowId, memoText) {
    await ensureLatestRecord();
    const subtable = state.record?.[state.settings.subtableCode];
    if (!subtable || !Array.isArray(subtable.value)) {
      throw new Error(t('subtableUnavailable'));
    }
    const payloadRows = subtable.value.map((row) => ({
      id: row.id,
      value: JSON.parse(JSON.stringify(row.value))
    }));
    const target = payloadRows.find((row) => row.id === rowId);
    if (!target) {
      throw new Error(t('targetRowMissing'));
    }
    if (!target.value[state.settings.memoFieldCode]) {
      target.value[state.settings.memoFieldCode] = { value: '' };
    }
    target.value[state.settings.memoFieldCode].value = memoText;
    const body = {
      app: state.appId,
      id: state.recordId,
      revision: state.revision,
      record: {
        [state.settings.subtableCode]: {
          value: payloadRows
        }
      }
    };
    const response = await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', body);
    state.revision = Number(response.revision);
  }

  function handleDeleteRow(row) {
    if (!state.canEdit || state.busy) {
      return;
    }
    const confirmed = window.confirm(t('confirmDelete'));
    if (!confirmed) {
      return;
    }
    deleteRow(row);
  }

  async function deleteRow(row) {
    setBusy(true, t('deletingFile'));
    try {
      await ensureLatestRecord();
      const subtable = state.record?.[state.settings.subtableCode];
      if (!subtable || !Array.isArray(subtable.value)) {
        throw new Error(t('subtableUnavailable'));
      }
      const filtered = subtable.value.filter((entry) => entry.id !== row.id);
      if (filtered.length === subtable.value.length) {
        throw new Error(t('targetRowMissingDelete'));
      }
      const payloadRows = filtered.map((entry) => ({
        id: entry.id,
        value: JSON.parse(JSON.stringify(entry.value))
      }));
      const body = {
        app: state.appId,
        id: state.recordId,
        revision: state.revision,
        record: {
          [state.settings.subtableCode]: {
            value: payloadRows
          }
        }
      };
      const response = await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', body);
      state.revision = Number(response.revision);
      window.location.reload();
    } catch (error) {
      console.error(error);
      pushToast(t('deleteFileFailed'), 'error');
    } finally {
      setBusy(false);
    }
  }
  function ensureLightbox() {
    if (state.lightbox && state.lightbox.overlay && state.lightbox.content) {
      return state.lightbox;
    }
    const overlay = document.createElement('div');
    overlay.className = 'kwp-lightbox';
    const backdrop = document.createElement('div');
    backdrop.className = 'kwp-lightbox__backdrop';
    overlay.appendChild(backdrop);
    const dismissZone = document.createElement('button');
    dismissZone.type = 'button';
    dismissZone.className = 'kwp-lightbox__dismiss';
    dismissZone.setAttribute('aria-label', t('closePreview'));
    overlay.appendChild(dismissZone);
    const inner = document.createElement('div');
    inner.className = 'kwp-lightbox__inner';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'kwp-lightbox__close';
    closeButton.setAttribute('aria-label', t('close'));
    closeButton.innerHTML = '×';
    const content = document.createElement('div');
    content.className = 'kwp-lightbox__content';
    inner.appendChild(closeButton);
    inner.appendChild(content);
    overlay.appendChild(inner);
    document.body.appendChild(overlay);

    const wheelHandler = (event) => {
      if (!event.ctrlKey || !state.lightbox || state.lightbox !== lightbox || !overlay.classList.contains('kwp-lightbox--visible')) {
        return;
      }
      if (lightbox.kind !== 'image' && lightbox.kind !== 'pdf') {
        return;
      }
      event.preventDefault();
      const delta = event.deltaY < 0 ? 0.15 : -0.15;
      adjustLightboxZoom(lightbox, delta);
    };

    const lightbox = {
      overlay,
      content,
      currentFileKey: null,
      kind: null,
      assetElement: null,
      assetUrl: null,
      pdfBase: null,
      zoom: 1,
      zoomMin: 0.5,
      zoomMax: 4,
      zoomLabel: null,
      wheelHandler
    };

    const close = () => {
      overlay.classList.remove('kwp-lightbox--visible');
      content.innerHTML = '';
      lightbox.currentFileKey = null;
      lightbox.kind = null;
      lightbox.assetElement = null;
      lightbox.assetUrl = null;
      lightbox.pdfBase = null;
      lightbox.zoomLabel = null;
      lightbox.zoom = 1;
    };
    lightbox.close = close;

    overlay.addEventListener('click', (event) => {
      if (
        event.target === overlay ||
        event.target.classList.contains('kwp-lightbox__backdrop') ||
        event.target.classList.contains('kwp-lightbox__dismiss')
      ) {
        close();
      }
    });
    dismissZone.addEventListener('click', close);
    closeButton.addEventListener('click', close);
    const keyHandler = (event) => {
      if (event.key === 'Escape' && overlay.classList.contains('kwp-lightbox--visible')) {
        close();
      }
    };
    document.addEventListener('keydown', keyHandler);
    lightbox.keyHandler = keyHandler;
    overlay.addEventListener('wheel', wheelHandler, { passive: false });

    state.lightbox = lightbox;
    return lightbox;
  }

  function openLightbox(row) {
    if (!row.file) {
      return;
    }
    const lightbox = ensureLightbox();
    const { overlay, content } = lightbox;
    const fileName = row.file.name || t('unknownFile');
    const { kind } = describeFile(row.file);

    content.innerHTML = '';
    lightbox.currentFileKey = row.file.fileKey;

    const header = document.createElement('div');
    header.className = 'kwp-lightbox__header';

    const title = document.createElement('h3');
    title.className = 'kwp-lightbox__title';
    title.textContent = fileName;
    header.appendChild(title);

    const metaParts = [];
    const sizeBytes = Number(row.file.size);
    if (!Number.isNaN(sizeBytes) && sizeBytes > 0) {
      const sizeLabel = formatFileSize(sizeBytes);
      if (sizeLabel) {
        metaParts.push(sizeLabel);
      }
    }
    if (row.timestamp) {
      metaParts.push(formatTimestamp(row.timestamp));
    }
    if (row.authorName) {
      metaParts.push(row.authorName);
    }
    if (metaParts.length) {
      const meta = document.createElement('p');
      meta.className = 'kwp-lightbox__meta';
      meta.textContent = metaParts.join(' · ');
      header.appendChild(meta);
    }

    const body = document.createElement('div');
    body.className = 'kwp-lightbox__body';

    const status = document.createElement('p');
    status.className = 'kwp-lightbox__status';
    status.textContent = t('loading');
    body.appendChild(status);

    const actions = document.createElement('div');
    actions.className = 'kwp-lightbox__actions';

    content.appendChild(header);
    content.appendChild(body);
    content.appendChild(actions);

    lightbox.kind = kind;
    lightbox.zoom = 1;
    lightbox.zoomMin = kind === 'pdf' ? 0.6 : 0.5;
    lightbox.zoomMax = kind === 'pdf' ? 2.5 : 4;
    lightbox.zoomLabel = null;
    lightbox.assetElement = null;
    lightbox.assetUrl = null;
    lightbox.pdfBase = null;

    if (kind === 'image') {
      const zoomControls = document.createElement('div');
      zoomControls.className = 'kwp-lightbox__zoom';

      const zoomOutBtn = document.createElement('button');
      zoomOutBtn.type = 'button';
      zoomOutBtn.className = 'kwp-button kwp-button--ghost kwp-lightbox__zoom-btn';
      zoomOutBtn.textContent = '−';
      zoomOutBtn.addEventListener('click', () => adjustLightboxZoom(lightbox, -0.25));

      const zoomResetBtn = document.createElement('button');
      zoomResetBtn.type = 'button';
      zoomResetBtn.className = 'kwp-button kwp-button--ghost kwp-lightbox__zoom-btn';
      zoomResetBtn.textContent = '100%';
      zoomResetBtn.addEventListener('click', () => setLightboxZoom(lightbox, 1));

      const zoomInBtn = document.createElement('button');
      zoomInBtn.type = 'button';
      zoomInBtn.className = 'kwp-button kwp-button--ghost kwp-lightbox__zoom-btn';
      zoomInBtn.textContent = '+';
      zoomInBtn.addEventListener('click', () => adjustLightboxZoom(lightbox, 0.25));

      zoomControls.appendChild(zoomOutBtn);
      zoomControls.appendChild(zoomResetBtn);
      zoomControls.appendChild(zoomInBtn);
      actions.classList.add('kwp-lightbox__actions--split');
      actions.appendChild(zoomControls);
      lightbox.zoomLabel = zoomResetBtn;
    } else {
      actions.classList.remove('kwp-lightbox__actions--split');
    }
    applyLightboxZoom(lightbox);

    const handleFailure = (message) => {
      body.className = 'kwp-lightbox__body kwp-lightbox__body--unsupported';
      body.innerHTML = '';
      const error = document.createElement('p');
      error.className = 'kwp-lightbox__status';
      error.textContent = message || t('fileLoadFailed');
      body.appendChild(error);
    };

    overlay.classList.add('kwp-lightbox--visible');

    ensureFileUrl(row.file.fileKey)
      .then((objectUrl) => {
        if (!state.lightbox || state.lightbox !== lightbox || lightbox.currentFileKey !== row.file.fileKey) {
          return;
        }

        const link = document.createElement('a');
        link.className = 'kwp-button kwp-button--primary kwp-lightbox__link';
        link.href = objectUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = t('openExternal');
        actions.appendChild(link);

        lightbox.assetUrl = objectUrl;
        body.className = 'kwp-lightbox__body';
        if (kind === 'image') {
          body.classList.add('kwp-lightbox__body--image');
          body.innerHTML = '';
          const img = document.createElement('img');
          img.className = 'kwp-lightbox__image';
          img.alt = row.memoText || fileName;
          img.src = objectUrl;
          img.style.transform = 'scale(1)';
          body.appendChild(img);
          lightbox.assetElement = img;
          setLightboxZoom(lightbox, 1);
        } else if (kind === 'pdf') {
          body.classList.add('kwp-lightbox__body--pdf');
          body.innerHTML = '';
          const frame = document.createElement('iframe');
          frame.className = 'kwp-lightbox__pdf-frame';
          frame.setAttribute('title', t('previewTitle', { name: fileName }));
          frame.dataset.currentSrc = '';
          body.appendChild(frame);
          lightbox.assetElement = frame;
          lightbox.pdfBase = null;
          frame.src = objectUrl;
          setLightboxZoom(lightbox, 1);
        } else {
          body.classList.add('kwp-lightbox__body--unsupported');
          body.innerHTML = '';
          const message = document.createElement('p');
          message.className = 'kwp-lightbox__status';
          message.textContent = t('unsupportedPreview');
          body.appendChild(message);
        }
      })
      .catch((error) => {
        console.error(error);
        if (state.lightbox !== lightbox || lightbox.currentFileKey !== row.file.fileKey) {
          return;
        }
        handleFailure(t('fileLoadFailed'));
      });
  }

  function createPanelElements() {
    const uploadCard = document.createElement('li');
    uploadCard.className = 'kwp-card kwp-card--upload kwp-dropzone';
    uploadCard.dataset.kwpDropzone = 'true';
    uploadCard.tabIndex = 0;

    const bodyWrapper = document.createElement('div');
    bodyWrapper.className = 'kwp-card__body kwp-card__body--upload';

    const header = document.createElement('div');
    header.className = 'kwp-card__upload-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'kwp-card__upload-copy';
    titleWrap.innerHTML = [
      `<p class="kwp-card__upload-title">${t('uploadTitle')}</p>`,
      `<p data-kwp-status class="kwp-panel__status">${t('uploadStatus')}</p>`
    ].join('');

    const controls = document.createElement('div');
    controls.className = 'kwp-card__upload-actions';

    const uploadLabel = document.createElement('label');
    uploadLabel.className = 'kwp-upload';
    uploadLabel.innerHTML = `<input type="file" data-kwp-file multiple><span>${t('chooseFile')}</span>`;

    const focusButton = document.createElement('button');
    focusButton.type = 'button';
    focusButton.className = 'kwp-button kwp-button--ghost';
    focusButton.dataset.kwpFocus = 'true';
    focusButton.textContent = t('pasteShort');

    controls.appendChild(uploadLabel);
    controls.appendChild(focusButton);
    header.appendChild(titleWrap);
    header.appendChild(controls);

    const hint = document.createElement('p');
    hint.className = 'kwp-card__upload-hint';
    hint.textContent = t('uploadHint');

    bodyWrapper.appendChild(header);
    bodyWrapper.appendChild(hint);
    uploadCard.appendChild(bodyWrapper);

    const toastStack = document.createElement('div');
    toastStack.className = 'kwp-toast-stack';
    toastStack.dataset.kwpToast = 'true';

    const galleryShell = document.createElement('section');
    galleryShell.className = 'kwp-panel kwp-gallery-shell';

    const titleMode = normalizeGalleryTitleMode(state.settings.galleryTitleMode);
    if (titleMode === 'subtable') {
      const galleryHeader = document.createElement('header');
      galleryHeader.className = 'kwp-gallery-shell__header';
      const galleryTitle = document.createElement('h2');
      galleryTitle.className = 'kwp-gallery-shell__title';
      galleryTitle.textContent = state.subtableLabel || state.settings.subtableCode || t('gallery');
      galleryHeader.appendChild(galleryTitle);
      galleryShell.appendChild(galleryHeader);
    }

    const list = document.createElement('ul');
    list.className = 'kwp-gallery';
    list.dataset.kwpList = 'true';

    const empty = document.createElement('p');
    empty.className = 'kwp-empty';
    empty.dataset.kwpEmpty = 'true';
    empty.textContent = t('emptyGallery');
    empty.hidden = true;

    galleryShell.appendChild(list);
    galleryShell.appendChild(empty);
    galleryShell.appendChild(toastStack);

    state.elements = {
      panel: uploadCard,
      galleryShell,
      status: uploadCard.querySelector('[data-kwp-status]'),
      dropzone: uploadCard,
      fileInput: uploadCard.querySelector('[data-kwp-file]'),
      focusButton,
      list,
      empty,
      toastStack
    };

    if (state.elements.status) {
      state.elements.status.dataset.kwpDefaultMessage = state.elements.status.textContent;
    }

    updateGalleryTitle();

    return { galleryShell };
  }

  function updateGalleryTitle() {
    const shell = state.elements.galleryShell;
    if (!shell) {
      return;
    }
    const titleMode = normalizeGalleryTitleMode(state.settings.galleryTitleMode);
    let header = shell.querySelector('.kwp-gallery-shell__header');
    if (titleMode !== 'subtable') {
      if (header) {
        header.remove();
      }
      return;
    }
    const label = state.subtableLabel || state.settings.subtableCode || t('gallery');
    if (!header) {
      header = document.createElement('header');
      header.className = 'kwp-gallery-shell__header';
      const title = document.createElement('h2');
      title.className = 'kwp-gallery-shell__title';
      title.textContent = label;
      header.appendChild(title);
      shell.insertBefore(header, shell.firstChild);
      return;
    }
    const titleEl = header.querySelector('.kwp-gallery-shell__title');
    if (titleEl) {
      titleEl.textContent = label;
    }
  }


  function attachPanelHandlers() {
    const { panel, fileInput, focusButton } = state.elements;
    if (!panel || !fileInput || !focusButton) {
      return;
    }
    if (typeof state.dragResetCleanup === 'function') {
      state.dragResetCleanup();
      state.dragResetCleanup = null;
    }

    let dragDepth = 0;
    const activateDropzone = () => {
      panel.classList.add('kwp-dropzone--active');
      setStatusMessage(t('dropToAdd'));
    };
    const deactivateDropzone = () => {
      dragDepth = 0;
      panel.classList.remove('kwp-dropzone--active');
      setStatusMessage();
    };

    const onPaste = (event) => {
      if (!state.canEdit || state.busy) {
        return;
      }
      const items = Array.from(event.clipboardData?.items || []);
      const files = items
        .filter((item) => item.type && item.type.startsWith('image/'))
        .map((item, index) => {
          const file = item.getAsFile();
          if (file) {
            return new File([file], file.name || `clipboard-${Date.now()}-${index}.png`, {
              type: file.type || 'image/png'
            });
          }
          return null;
        })
        .filter(Boolean);
      if (!files.length) {
        pushToast(t('noPasteableImage'), 'info');
        return;
      }
      event.preventDefault();
      processFiles(files);
    };

    panel.addEventListener('paste', onPaste);

    panel.addEventListener('dragenter', (event) => {
      if (!state.canEdit || state.busy) {
        return;
      }
      event.preventDefault();
      dragDepth += 1;
      activateDropzone();
    });

    panel.addEventListener('dragover', (event) => {
      if (!state.canEdit || state.busy) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      activateDropzone();
    });

    panel.addEventListener('dragleave', () => {
      if (!state.canEdit || state.busy) {
        return;
      }
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        deactivateDropzone();
      }
    });

    panel.addEventListener('drop', (event) => {
      if (!state.canEdit || state.busy) {
        return;
      }
      event.preventDefault();
      deactivateDropzone();
      const files = Array.from(event.dataTransfer.files || []).filter((file) => file instanceof File);
      if (!files.length) {
        pushToast(t('noReadableFile'), 'info');
        return;
      }
      processFiles(files);
    });

    fileInput.addEventListener('change', (event) => {
      if (!state.canEdit || state.busy) {
        return;
      }
      const files = Array.from(event.target.files || []).filter((file) => file instanceof File);
      if (!files.length) {
        pushToast(t('noReadableFileSelected'), 'info');
        return;
      }
      processFiles(files);
    });

    focusButton.addEventListener('click', () => {
      panel.focus();
    });

    const doc = panel.ownerDocument;
    const onGlobalDragEnd = () => deactivateDropzone();
    const onWindowBlur = () => deactivateDropzone();
    doc.addEventListener('drop', onGlobalDragEnd, true);
    doc.addEventListener('dragend', onGlobalDragEnd, true);
    window.addEventListener('blur', onWindowBlur);
    state.dragResetCleanup = () => {
      doc.removeEventListener('drop', onGlobalDragEnd, true);
      doc.removeEventListener('dragend', onGlobalDragEnd, true);
      window.removeEventListener('blur', onWindowBlur);
    };
  }

  function insertPanel() {
    const previousPanel = state.elements.panel;
    if (previousPanel && previousPanel.parentNode) {
      previousPanel.parentNode.removeChild(previousPanel);
    }
    const previousGallery = state.elements.galleryShell;
    if (previousGallery && previousGallery.parentNode) {
      previousGallery.parentNode.removeChild(previousGallery);
    }

    const { galleryShell } = createPanelElements();

    const spaceElement = state.settings.spaceFieldCode ? kintone.app.record.getSpaceElement(state.settings.spaceFieldCode) : null;
    if (!spaceElement) {
      console.warn(t('spaceNotFound'));
      return false;
    }
    relaxSpaceConstraints(spaceElement);
    spaceElement.appendChild(galleryShell);

    normalizePanelContainer(galleryShell);
    attachPanelHandlers();
    updatePanelMode();
    return true;
  }

  function sanitizeFileName(name) {
    const base = name.replace(/\.[^.]+$/, '');
    return `${base}.jpg`;
  }

  function applyGridColumns() {
    const list = state.elements.list;
    if (!list) {
      return;
    }
    list.classList.remove('kwp-gallery--auto', 'kwp-gallery--two', 'kwp-gallery--three', 'kwp-gallery--scroll');
    if (state.settings.layout !== 'grid') {
      list.classList.add('kwp-gallery--scroll');
      return;
    }
    const mode = normalizeGridColumnsValue(state.settings.gridColumns);
    const cls = mode === 'two' ? 'kwp-gallery--two' : mode === 'three' ? 'kwp-gallery--three' : 'kwp-gallery--auto';
    list.classList.add(cls);
  }

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

  function relaxSpaceConstraints(spaceElement) {
    if (!spaceElement) {
      return;
    }
    if (spaceElement.dataset.kwpRelaxed === '1') {
      ensureSpaceLayoutStyles(spaceElement);
      return;
    }
    spaceElement.dataset.kwpRelaxed = '1';
    Object.assign(spaceElement.style, {
      width: '100%',
      maxWidth: 'none',
      height: 'auto',
      maxHeight: 'none',
      overflow: 'visible'
    });
    ensureSpaceLayoutStyles(spaceElement);
  }

  function ensureSpaceLayoutStyles(spaceElement) {
    const code = state.settings.spaceFieldCode;
    if (!spaceElement || !code) {
      return;
    }
    const styleId = `kwp-space-style-${code}`;
    if (document.getElementById(styleId)) {
      return;
    }
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      #space_${code} {
        width: 100% !important;
        max-width: none !important;
        overflow: visible !important;
      }
      #space_${code} * {
        max-height: none !important;
      }
      #space_${code} .kwp-panel {
        width: 100%;
        max-width: none;
      }
    `;
    document.head.appendChild(style);
  }

  function normalizePanelContainer(panel) {
    if (!panel) {
      return;
    }
    panel.style.width = '100%';
    panel.style.boxSizing = 'border-box';
    panel.style.maxWidth = '100%';
    const parent = panel.parentElement;
    if (!parent) {
      return;
    }
    const style = window.getComputedStyle(parent);
    if (style.display === 'grid') {
      panel.style.gridColumn = '1 / -1';
    } else if (style.display === 'flex') {
      panel.style.flex = '1 1 100%';
    }
  }

  async function createDrawableSource(file) {
    if (typeof window.createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw(ctx, width, height) {
          ctx.drawImage(bitmap, 0, 0, width, height);
        },
        release() {
          bitmap.close();
        }
      };
    }
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
      return {
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        draw(ctx, width, height) {
          ctx.drawImage(image, 0, 0, width, height);
        },
        release() {
          URL.revokeObjectURL(url);
        }
      };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  async function compressImage(file) {
    if (!state.settings.compressionEnabled) {
      return file;
    }
    if (!file.type.startsWith('image/')) {
      return file;
    }
    const maxEdge = state.settings.maxImageEdge || 1600;
    const quality = state.settings.imageQuality || 0.85;
    const drawable = await createDrawableSource(file);
    const { width, height } = drawable;
    const edge = Math.max(width, height);
    const ratio = edge > maxEdge ? maxEdge / edge : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext('2d', { alpha: false });
    drawable.draw(context, canvas.width, canvas.height);
    drawable.release();
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (!result) {
          reject(new Error(t('imageCompressFailed')));
          return;
        }
        resolve(result);
      }, 'image/jpeg', quality);
    });
    const fileName = sanitizeFileName(file.name || `work-progress-${Date.now()}.jpg`);
    return new File([blob], fileName, { type: 'image/jpeg', lastModified: Date.now() });
  }

  async function uploadFile(file) {
    const formData = new FormData();
    formData.append('__REQUEST_TOKEN__', getRequestToken());
    formData.append('file', file, file.name);
    const response = await fetch(kintone.api.url('/k/v1/file', true), {
      method: 'POST',
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: formData,
      credentials: 'include'
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.message || t('uploadFailed'));
    }
    return {
      fileKey: result.fileKey,
      name: file.name,
      size: file.size,
      contentType: file.type
    };
  }

  async function appendRows(uploads) {
    const subtable = state.record?.[state.settings.subtableCode];
    if (!subtable || !Array.isArray(subtable.value)) {
      throw new Error(t('subtableUnavailable'));
    }
    const existing = subtable.value.map((row) => ({
      id: row.id,
      value: JSON.parse(JSON.stringify(row.value))
    }));
    const loginUser = kintone.getLoginUser();
    let canWriteTimestamp = false;
    if (state.settings.timestampFieldCode) {
      if (!state.metadataLoaded) {
        await loadFieldMetadata();
      }
      const timestampType = getTimestampFieldType();
      if (timestampType === 'DATETIME') {
        canWriteTimestamp = true;
        if (state.settings.timestampFieldType !== 'DATETIME') {
          state.settings.timestampFieldType = 'DATETIME';
        }
      } else if (timestampType) {
        console.warn('kintone-work-progress: timestamp field must be DATETIME, but detected', timestampType);
        pushToast(t('timestampMustBeDatetime'), 'warning');
      }
    }
    uploads.forEach(({ uploaded }) => {
      const now = new Date();
      const createdAt = formatLocalDateTimeString(now);
      const rowValue = {};
      rowValue[state.settings.fileFieldCode] = {
        value: [
          {
            fileKey: uploaded.fileKey,
            name: uploaded.name,
            size: uploaded.size,
            contentType: uploaded.contentType
          }
        ]
      };
      rowValue[state.settings.memoFieldCode] = {
        value: state.settings.memoTemplate || ''
      };
      if (state.settings.authorFieldCode) {
        rowValue[state.settings.authorFieldCode] = {
          value: loginUser ? [{ code: loginUser.code, name: loginUser.name }] : []
        };
      }
      if (state.settings.timestampFieldCode && canWriteTimestamp) {
        rowValue[state.settings.timestampFieldCode] = {
          value: createdAt
        };
      }
      existing.push({ value: rowValue });
    });
    const body = {
      app: state.appId,
      id: state.recordId,
      revision: state.revision,
      record: {
        [state.settings.subtableCode]: {
          value: existing
        }
      }
    };
    const response = await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', body);
    state.revision = Number(response.revision);
  }

  async function postComment(count) {
    if (!state.settings.commentEnabled) {
      return;
    }
    try {
      await kintone.api(kintone.api.url('/k/v1/record/comment', true), 'POST', {
        app: state.appId,
        record: state.recordId,
        comment: {
          text: `${state.settings.commentBody || t('defaultCommentBody')} (${count})`
        }
      });
    } catch (error) {
      console.warn(t('commentPostFailed'), error);
    }
  }

  async function processFiles(files) {
    if (!files || !files.length) {
      return;
    }
    setBusy(true, t('processingFiles'));
    try {
      await ensureLatestRecord();
      const processed = [];
      for (const file of files) {
        try {
          const converted = await compressImage(file);
          const uploaded = await uploadFile(converted);
          processed.push({ file: converted, uploaded });
        } catch (error) {
          console.error(error);
          pushToast(t('uploadFailedWithName', { name: file.name }), 'error');
        }
      }
      if (!processed.length) {
        pushToast(t('noUploadableFiles'), 'error');
        return;
      }
      await appendRows(processed);
      await postComment(processed.length);
      window.location.reload();
    } catch (error) {
      console.error(error);
      pushToast(t('addFileFailed'), 'error');
    } finally {
      setBusy(false);
      if (state.elements.fileInput) {
        state.elements.fileInput.value = '';
      }
    }
  }

  async function refreshRecord(options) {
    await ensureLatestRecord();
    if (!options || !options.silent) {
      setBusy(false);
    }
  }
  function injectStyles() {
    if (document.getElementById('kwp-styles')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'kwp-styles';
    style.textContent = `
      .kwp-panel {
        position: relative;
        background: #ffffff;
        border-radius: 12px;
        border: 1px solid #e2e8f0;
        padding: 16px;
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
        margin-bottom: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .kwp-panel__status {
        margin: 4px 0 0;
        font-size: 12px;
        color: #64748b;
      }
      .kwp-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 32px;
        padding: 0 12px;
        border-radius: 8px;
        font-size: 13px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #1f2937;
        cursor: pointer;
        transition: background 0.2s ease, border 0.2s ease;
      }
      .kwp-button:hover {
        background: #f1f5f9;
      }
      .kwp-button--ghost {
        border: 1px dashed #cbd5e1;
      }
      .kwp-upload {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 32px;
        padding: 0 12px;
        border-radius: 8px;
        font-size: 13px;
        background: #2563eb;
        color: #ffffff;
        cursor: pointer;
      }
      .kwp-upload input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }
      .kwp-dropzone {
        border: 2px dashed #cbd5e1;
        border-radius: 12px;
        padding: 20px;
        min-height: 140px;
        text-align: center;
        color: #475569;
        transition: border-color 0.2s ease, background 0.2s ease;
        outline: none;
      }
      .kwp-dropzone:focus {
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
      }
      .kwp-dropzone--active {
        border-color: #2563eb;
        background: rgba(37, 99, 235, 0.05);
        color: #1e3a8a;
      }
      .kwp-gallery-shell {
        display: flex;
        flex-direction: column;
        gap: 16px;
        width: 100%;
        box-sizing: border-box;
      }
      .kwp-gallery-shell__header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
      }
      .kwp-gallery-shell__title {
        margin: 0;
        font-size: 18px;
      }
      .kwp-gallery {
        flex: 1 1 auto;
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 12px;
        width: 100%;
      }
      .kwp-gallery--auto {
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      }
      .kwp-gallery--two {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .kwp-gallery--three {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .kwp-gallery--scroll {
        display: flex;
        flex-wrap: nowrap;
        gap: 12px;
        overflow-x: auto;
        overflow-y: hidden;
        padding-bottom: 6px;
      }
      .kwp-card {
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        background: #f8fafc;
        border-radius: 10px;
        border: 1px solid #e2e8f0;
        padding: 12px;
        min-height: 120px;
        box-sizing: border-box;
      }
      .kwp-gallery--scroll .kwp-card {
        flex: 0 0 220px;
      }
      .kwp-card--upload {
        align-items: stretch;
        border-style: dashed;
        background: linear-gradient(135deg, #f8fbff, #f8fafc);
        min-height: 0;
      }
      .kwp-gallery--scroll .kwp-card--upload {
        flex-basis: 280px;
      }
      .kwp-card--upload.kwp-dropzone {
        min-height: 0;
        padding: 10px 12px;
        text-align: left;
        transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
      }
      .kwp-card__thumb {
        border: none;
        background: transparent;
        border-radius: 8px;
        padding: 0;
        cursor: pointer;
        overflow: hidden;
        width: 96px;
        height: 96px;
        flex: 0 0 auto;
      }
      .kwp-card__thumb--image img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.2s ease;
      }
      .kwp-card__thumb--file {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .kwp-card__thumb-file-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        padding: 12px;
        font-size: 16px;
        font-weight: 600;
        letter-spacing: 0.06em;
        color: #0f172a;
        background: linear-gradient(135deg, #e0f2fe, #f0f9ff);
        border-radius: inherit;
        text-transform: uppercase;
      }
      @media (max-width: 900px) {
        .kwp-gallery--three {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 640px) {
        .kwp-gallery--two,
        .kwp-gallery--three {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 480px) {
        .kwp-card__thumb {
          width: 80px;
          height: 80px;
        }
      }
      .kwp-card__thumb-img--loading {
        filter: grayscale(1);
        opacity: 0.45;
      }
      .kwp-card__thumb-img--error {
        filter: grayscale(1);
        opacity: 0.25;
      }
      .kwp-card__thumb--image:hover img {
        transform: scale(1.04);
      }
      .kwp-card__body {
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex: 1 1 auto;
        min-width: 0;
      }
      .kwp-card__body--upload {
        justify-content: center;
        gap: 6px;
        width: 100%;
      }
      .kwp-card__upload-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .kwp-card__upload-copy {
        flex: 1 1 120px;
        min-width: 0;
      }
      .kwp-card__upload-title {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        color: #0f172a;
        line-height: 1.2;
      }
      .kwp-card--upload .kwp-panel__status {
        margin: 2px 0 0;
        font-size: 11px;
        line-height: 1.2;
        transition: color 0.18s ease;
      }
      .kwp-card__upload-actions {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
      }
      .kwp-card__upload-actions .kwp-button,
      .kwp-card__upload-actions .kwp-upload {
        height: 30px;
        padding: 0 10px;
        font-size: 12px;
      }
      .kwp-card__upload-hint {
        margin: 0;
        font-size: 11px;
        line-height: 1.35;
        color: #64748b;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .kwp-card--upload.kwp-dropzone--active {
        border-color: #2563eb;
        background: linear-gradient(135deg, #f8fbff, #f8fafc);
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
      }
      .kwp-card__filename {
        margin: 0;
        font-size: 12px;
        color: #475569;
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .kwp-card__memo {
        border: none;
        background: transparent;
        text-align: left;
        color: #1f2937;
        font-size: 13px;
        cursor: pointer;
        padding: 0;
        min-height: 32px;
        white-space: normal;
        word-break: break-word;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .kwp-card__memo:disabled {
        cursor: default;
        color: #6b7280;
      }
      .kwp-card__memo-input {
        width: 100%;
        border: 1px solid #2563eb;
        border-radius: 6px;
        padding: 4px 6px;
        font-size: 13px;
      }
      .kwp-card__meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        font-size: 12px;
        color: #64748b;
      }
      .kwp-empty {
        margin: 12px 0 0;
        font-size: 13px;
        color: #64748b;
      }
      .kwp-toast-stack {
        position: fixed;
        bottom: 24px;
        right: 24px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 999;
      }
      .kwp-toast {
        opacity: 0;
        transform: translateY(12px);
        transition: opacity 0.25s ease, transform 0.25s ease;
        padding: 10px 16px;
        border-radius: 8px;
        color: #fff;
        font-size: 13px;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.25);
      }
      .kwp-toast--visible {
        opacity: 1;
        transform: translateY(0);
      }
      .kwp-toast--info {
        background: #2563eb;
      }
      .kwp-toast--success {
        background: #16a34a;
      }
      .kwp-toast--error {
        background: #dc2626;
      }
      .kwp-panel--busy::after {
        content: '';
        position: absolute;
        inset: 0;
        background: rgba(255, 255, 255, 0.6);
        border-radius: 12px;
        pointer-events: none;
      }
      .kwp-lightbox {
        position: fixed;
        inset: 0;
        display: flex;
        justify-content: flex-end;
        align-items: stretch;
        padding: 0;
        background: rgba(2, 6, 23, 0.55);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
        z-index: 1000;
        backdrop-filter: blur(6px);
        --kwp-dismiss-width: clamp(32px, 6vw, 96px);
      }
      @supports not ((backdrop-filter: blur(6px))) {
        .kwp-lightbox {
          backdrop-filter: none;
        }
      }
      .kwp-lightbox--visible {
        opacity: 1;
        pointer-events: auto;
      }
      .kwp-lightbox__backdrop {
        position: absolute;
        inset: 0;
      }
      .kwp-lightbox__dismiss {
        flex: 0 0 var(--kwp-dismiss-width);
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 0;
        margin: 0;
        z-index: 1;
      }
      .kwp-lightbox__inner {
        position: relative;
        background: rgba(248, 250, 252, 0.92);
        border-radius: 24px 0 0 24px;
        border: 1px solid rgba(148, 163, 184, 0.35);
        box-shadow: -24px 0 60px rgba(15, 23, 42, 0.2);
        width: min(1600px, calc(100vw - var(--kwp-dismiss-width)));
        max-width: 100%;
        height: 100vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: translateX(32px);
        opacity: 0;
        transition: transform 0.25s ease, opacity 0.25s ease;
        backdrop-filter: blur(18px);
      }
      .kwp-lightbox--visible .kwp-lightbox__inner {
        transform: translateX(0);
        opacity: 1;
      }
      .kwp-lightbox__close {
        position: absolute;
        top: 16px;
        right: 16px;
        background: rgba(15, 23, 42, 0.6);
        color: #fff;
        border: none;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        font-size: 20px;
        cursor: pointer;
        z-index: 2;
      }
      .kwp-lightbox__content {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 28px 28px 24px;
        flex: 1 1 auto;
        min-height: 0;
      }
      .kwp-lightbox__header {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .kwp-lightbox__title {
        margin: 0;
        font-size: 18px;
        color: #0f172a;
      }
      .kwp-lightbox__meta {
        margin: 0;
        font-size: 12px;
        color: #475569;
        letter-spacing: 0.01em;
      }
      .kwp-lightbox__body {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(148, 163, 184, 0.12);
        border: 1px solid rgba(148, 163, 184, 0.25);
        border-radius: 18px;
        padding: 12px;
        overflow: hidden;
      }
      .kwp-lightbox__body--image {
        background: transparent;
        border: none;
        padding: 0;
        overflow: auto;
      }
      .kwp-lightbox__body--pdf {
        background: transparent;
        border: none;
        padding: 0;
        display: block;
      }
      .kwp-lightbox__body--unsupported {
        background: #f8fafc;
      }
      .kwp-lightbox__image {
        max-width: 100%;
        max-height: 100%;
        border-radius: 18px;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.25);
        transform-origin: center center;
        transition: transform 0.15s ease;
      }
      .kwp-lightbox__pdf-frame {
        width: 100%;
        height: 100%;
        border: none;
        background: #ffffff;
      }
      .kwp-lightbox__status {
        margin: 0;
        font-size: 14px;
        color: #475569;
        text-align: center;
      }
      .kwp-lightbox__actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }
      .kwp-lightbox__actions--split {
        justify-content: space-between;
      }
      .kwp-lightbox__zoom {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .kwp-card__delete {
        position: absolute;
        top: 6px;
        right: 6px;
        border: none;
        background: transparent;
        color: rgba(15, 23, 42, 0.35);
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        padding: 4px;
        transition: color 0.15s ease, transform 0.15s ease;
      }
      .kwp-card__delete:hover {
        color: #dc2626;
        transform: scale(1.05);
      }
      .kwp-card__delete:focus {
        outline: 2px solid #2563eb;
        outline-offset: 2px;
      }
      .kwp-lightbox__zoom-btn {
        min-width: 56px;
      }
      .kwp-lightbox__zoom-btn:nth-child(2) {
        font-weight: 600;
      }
      .kwp-lightbox__link {
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .kwp-button--primary {
        background: #2563eb;
        border-color: #2563eb;
        color: #ffffff;
      }
      .kwp-button--primary:hover {
        background: #1d4ed8;
        border-color: #1d4ed8;
      }
      @media (max-width: 768px) {
        .kwp-panel {
          margin: 0 0 20px;
        }
        .kwp-toast-stack {
          right: 12px;
          left: 12px;
        }
        .kwp-toast {
          align-self: center;
        }
        .kwp-lightbox__inner {
          width: 100%;
          border-radius: 0;
        }
        .kwp-lightbox__content {
          padding: 24px;
        }
        .kwp-lightbox__close {
          top: 12px;
          right: 12px;
        }
        .kwp-lightbox__actions {
          justify-content: stretch;
        }
        .kwp-lightbox__link {
          width: 100%;
          justify-content: center;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function initialize() {
    state.settings = parseSettings(kintone.plugin.app.getConfig(PLUGIN_ID));
    if (!state.settings.subtableCode || !state.settings.fileFieldCode || !state.settings.memoFieldCode || !state.settings.spaceFieldCode) {
      console.warn(t('settingsMissing'));
      return false;
    }
    state.metadataLoaded = false;
    state.fieldTypes = {};
    state.subtableLabel = state.settings.subtableCode || '';
    injectStyles();
    return true;
  }

  EVENT_TYPES.forEach((eventType) => {
    kintone.events.on(eventType, async (event) => {
      if (!initialize()) {
        return event;
      }
      state.recordId = event.recordId || kintone.app.record.getId();
      if (!insertPanel()) {
        return event;
      }
      hideNativeSubtable();
      await loadFieldMetadata();
      applyRecordSnapshot(event.record);
      try {
        await refreshRecord({ silent: true });
      } catch (error) {
        console.error(error);
        pushToast(t('recordLoadFailed'), 'error');
      }
      return event;
    });
  });

})(kintone.$PLUGIN_ID);











