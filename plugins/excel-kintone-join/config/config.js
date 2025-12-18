(function (PLUGIN_ID) {
  'use strict';

  const namespace = window.PlugbitsExcelJoin || {};
  const storage = namespace.storage;
  const kintoneClient = namespace.kintoneClient;

  const TEXTS = {
    ja: {
      title: 'Excel JOIN マスター設定',
      description: 'Excel に結合する kintone マスターを定義します。複数作成して JOIN 画面から選択できます。',
      empty: 'マスター定義がまだありません。「マスターを追加」で作成してください。',
      addMaster: 'マスターを追加',
      save: '保存',
      cancel: 'キャンセル',
      modalTitleNew: 'マスターを追加',
      modalTitleEdit: 'マスターを編集',
      masterName: '表示名',
      keyField: 'キー フィールド',
      loadFields: 'フィールドを取得',
      mappings: 'マッピング',
      mappingHint: 'Excel 列名と kintone フィールドを対応付けます。',
      mappingPlaceholder: 'Excel列名（出力ヘッダー）',
      addMapping: '行を追加',
      delete: '削除',
      saveMaster: 'マスターを保存',
      fieldLoading: 'フィールドを取得中…',
      fieldLoaded: 'フィールドを取得しました。',
      fieldError: 'フィールドの取得に失敗しました。ページを再読込してください。',
      validationName: '表示名を入力してください。',
      validationKey: 'キー フィールドを選択してください。',
      validationMappings: 'マッピングを1件以上設定してください。',
      statusSaved: '設定を保存しました。',
      confirmDelete: 'このマスターを削除しますか？',
      appIdMissing: 'アプリ情報を取得できませんでした。ページを再読込してください。'
    },
    en: {
      title: 'Excel Join Master Settings',
      description: 'Define kintone masters that will be joined into Excel files. These appear inside the join workspace.',
      empty: 'No master definitions yet. Click "Add Master" to start.',
      addMaster: 'Add Master',
      save: 'Save',
      cancel: 'Cancel',
      modalTitleNew: 'Add Master',
      modalTitleEdit: 'Edit Master',
      masterName: 'Display Name',
      keyField: 'Key Field',
      loadFields: 'Fetch fields',
      mappings: 'Mappings',
      mappingHint: 'Link Excel headers to kintone fields.',
      mappingPlaceholder: 'Excel header name',
      addMapping: 'Add row',
      delete: 'Delete',
      saveMaster: 'Save master',
      fieldLoading: 'Loading fields…',
      fieldLoaded: 'Fields loaded.',
      fieldError: 'Failed to fetch fields. Please reload the page.',
      validationName: 'Please enter a display name.',
      validationKey: 'Please choose the key field.',
      validationMappings: 'Please add at least one mapping.',
      statusSaved: 'Settings saved.',
      confirmDelete: 'Delete this master?',
      appIdMissing: 'Could not detect the app. Please reload this page.'
    }
  };

  const detectLang = () => {
    try {
      const lang = kintone.getLoginUser().language;
      return lang === 'ja' ? 'ja' : 'en';
    } catch (_error) {
      return 'en';
    }
  };

  const LANG = detectLang();
  const t = (key) => (TEXTS[LANG] && TEXTS[LANG][key]) || TEXTS.en[key] || key;

  const detectAppId = () => {
    const params = new URLSearchParams(location.search);
    if (params.get('app')) {
      return params.get('app');
    }
    const match = location.pathname.match(/\/k\/admin\/app\/(\d+)/);
    if (match && match[1]) {
      return match[1];
    }
    try {
      const direct = kintone.app.getId();
      if (direct) {
        return String(direct);
      }
    } catch (_error) {
      /* ignore */
    }
    return '';
  };

  const APP_ID = detectAppId();

  const state = {
    masters: [],
    fieldsCache: new Map()
  };

  const safeJsonParse = (value, fallback) => {
    if (!value) {
      return fallback;
    }
    try {
      return JSON.parse(value);
    } catch (_error) {
      return fallback;
    }
  };

  const elements = {};

  const cacheElements = () => {
    elements.list = document.getElementById('masterList');
    elements.empty = document.getElementById('emptyState');
    elements.message = document.getElementById('message');
    elements.addMaster = document.getElementById('addMaster');
    elements.save = document.getElementById('save');
    elements.cancel = document.getElementById('cancel');
    elements.modalHost = document.getElementById('modalHost');
  };

  const translateStatic = () => {
    document.querySelectorAll('[data-i18n]').forEach((node) => {
      const key = node.getAttribute('data-i18n');
      node.textContent = t(key);
    });
  };

  const uuid = () => {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `master_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const normalizeMasters = (list) => {
    if (!Array.isArray(list)) {
      return [];
    }
    return list.map((item) => ({
      id: item.id || uuid(),
      name: item.name || '',
      appId: item.appId || APP_ID || '',
      keyFieldCode: item.keyFieldCode || '',
      keyFieldLabel: item.keyFieldLabel || '',
      mappings: Array.isArray(item.mappings) ? item.mappings.map((m) => ({
        kintoneFieldCode: m.kintoneFieldCode,
        kintoneFieldLabel: m.kintoneFieldLabel || m.kintoneFieldCode,
        excelHeaderName: m.excelHeaderName || ''
      })).filter((m) => m.kintoneFieldCode && m.excelHeaderName) : []
    })).filter((master) => master.name);
  };

  const showMessage = (text, variant = 'info') => {
    if (!elements.message) {
      return;
    }
    if (!text) {
      elements.message.style.display = 'none';
      elements.message.textContent = '';
      elements.message.className = 'status-banner';
      return;
    }
    elements.message.textContent = text;
    elements.message.style.display = 'block';
    elements.message.className = 'status-banner';
    if (variant === 'error') {
      elements.message.classList.add('is-error');
    } else if (variant === 'success') {
      elements.message.classList.add('is-success');
    }
  };

  const renderMasters = () => {
    elements.list.innerHTML = '';
    if (!state.masters.length) {
      elements.empty.style.display = 'block';
      return;
    }
    elements.empty.style.display = 'none';
    state.masters.forEach((master, index) => {
      const card = document.createElement('div');
      card.className = 'master-item';

      const header = document.createElement('div');
      header.className = 'master-item__header';

      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = master.name;
      const meta = document.createElement('div');
      meta.className = 'master-item__meta';
      const keyMeta = document.createElement('span');
      keyMeta.textContent = `${t('keyField')}: ${master.keyFieldLabel || master.keyFieldCode}`;
      meta.append(keyMeta);
      info.append(title, meta);

      const actions = document.createElement('div');
      actions.className = 'kb-head';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'kb-btn kb-inline-btn';
      editBtn.textContent = t('modalTitleEdit');
      editBtn.addEventListener('click', () => openMasterModal(master, index));
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'kb-btn kb-inline-btn kb-danger';
      deleteBtn.textContent = t('delete');
      deleteBtn.addEventListener('click', () => deleteMaster(index));
      actions.append(editBtn, deleteBtn);

      header.append(info, actions);
      card.appendChild(header);

      if (master.mappings.length) {
        const mapWrap = document.createElement('div');
        mapWrap.className = 'master-item__mappings';
        master.mappings.forEach((mapping) => {
          const pill = document.createElement('span');
          pill.className = 'mapping-pill';
          pill.textContent = `${mapping.excelHeaderName} ← ${mapping.kintoneFieldLabel || mapping.kintoneFieldCode}`;
          mapWrap.appendChild(pill);
        });
        card.appendChild(mapWrap);
      }

      elements.list.appendChild(card);
    });
  };

  const deleteMaster = (index) => {
    if (!window.confirm(t('confirmDelete'))) {
      return;
    }
    state.masters.splice(index, 1);
    renderMasters();
  };

  const flattenFields = (properties = {}) => {
    const allowedTypes = new Set([
      'SINGLE_LINE_TEXT',
      'NUMBER',
      'RADIO_BUTTON',
      'DROP_DOWN',
      'DATE',
      'DATETIME',
      'TIME',
      'CALC',
      'LINK',
      'LOOKUP',
      'MULTI_LINE_TEXT'
    ]);
    const results = [];
    Object.values(properties).forEach((property) => {
      if (!property || property.type === 'SUBTABLE') {
        return;
      }
      if (allowedTypes.has(property.type)) {
        results.push({ code: property.code, label: property.label });
      }
    });
    return results;
  };

  const fetchFields = async (statusNode) => {
    const cacheKey = APP_ID || 'default';
    if (state.fieldsCache.has(cacheKey)) {
      return state.fieldsCache.get(cacheKey);
    }
    if (statusNode) {
      statusNode.textContent = t('fieldLoading');
    }
    try {
      if (!APP_ID) {
        if (statusNode) {
          statusNode.textContent = t('appIdMissing');
        }
        throw new Error('APP_ID is missing');
      }
      const properties = await kintoneClient.fetchFormFields(APP_ID);
      const flat = flattenFields(properties);
      state.fieldsCache.set(cacheKey, flat);
      if (statusNode) {
        statusNode.textContent = t('fieldLoaded');
      }
      return flat;
    } catch (error) {
      if (statusNode) {
        statusNode.textContent = t('fieldError');
      }
      throw error;
    }
  };

  const createOption = (value, label) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  };

  const getSelectedText = (selectElement) => {
    if (!selectElement) {
      return '';
    }
    const { selectedIndex, options } = selectElement;
    if (typeof selectedIndex !== 'number' || selectedIndex < 0 || !options || !options[selectedIndex]) {
      return '';
    }
    return options[selectedIndex].textContent || '';
  };

  const openMasterModal = (master = null, index = null) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'kb-root kb-backdrop';
    const modal = document.createElement('div');
    modal.className = 'kb-root kb-modal';
    const card = document.createElement('div');
    card.className = 'kb-card';

    const title = document.createElement('h2');
    title.className = 'kb-title';
    title.textContent = master ? t('modalTitleEdit') : t('modalTitleNew');

    const form = document.createElement('div');
    form.className = 'modal-form';

    const nameField = document.createElement('input');
    nameField.className = 'kb-input-field';
    nameField.value = master && master.name ? master.name : '';

    const keySelect = document.createElement('select');
    keySelect.className = 'kb-select';
    keySelect.disabled = true;

    const fieldStatus = document.createElement('span');
    fieldStatus.className = 'kb-muted';

    const mappingContainer = document.createElement('div');
    mappingContainer.className = 'mapping-rows';

    const addMappingBtn = document.createElement('button');
    addMappingBtn.type = 'button';
    addMappingBtn.className = 'kb-btn kb-inline-btn';
    addMappingBtn.textContent = t('addMapping');

    const ensureFields = async () => {
      const fields = await fetchFields(fieldStatus);
      keySelect.innerHTML = '';
      fields.forEach((field) => keySelect.appendChild(createOption(field.code, field.label)));
      keySelect.disabled = false;
      if (master && master.keyFieldCode) {
        keySelect.value = master.keyFieldCode;
      }
      return fields;
    };

    const buildMappingRow = (fieldsList, mappingData = null) => {
      const row = document.createElement('div');
      row.className = 'mapping-row';
      const fieldSelect = document.createElement('select');
      fieldSelect.className = 'kb-select';
      const excelInput = document.createElement('input');
      excelInput.className = 'kb-input-field';
      excelInput.placeholder = t('mappingPlaceholder');
      excelInput.value = mappingData && mappingData.excelHeaderName ? mappingData.excelHeaderName : '';
      fieldsList.forEach((field) => fieldSelect.appendChild(createOption(field.code, field.label)));
      if (mappingData && mappingData.kintoneFieldCode) {
        fieldSelect.value = mappingData.kintoneFieldCode;
      }
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'kb-btn kb-inline-btn kb-danger';
      removeBtn.textContent = t('delete');
      removeBtn.addEventListener('click', () => {
        row.remove();
      });
      row.append(fieldSelect, excelInput, removeBtn);
      return row;
    };

    let cachedFields = [];

    addMappingBtn.addEventListener('click', () => {
      if (!cachedFields.length) {
        return;
      }
      mappingContainer.appendChild(buildMappingRow(cachedFields));
    });

    const loadFieldsButton = document.createElement('button');
    loadFieldsButton.type = 'button';
    loadFieldsButton.className = 'kb-btn kb-inline-btn';
    loadFieldsButton.textContent = t('loadFields');
    loadFieldsButton.addEventListener('click', async () => {
      try {
        cachedFields = await ensureFields();
        mappingContainer.innerHTML = '';
        const existingMappings = master && Array.isArray(master.mappings) ? master.mappings : [];
        existingMappings.forEach((entry) => mappingContainer.appendChild(buildMappingRow(cachedFields, entry)));
      } catch (_error) {
        /* handled via fieldStatus */
      }
    });

    const modalActions = document.createElement('div');
    modalActions.className = 'kb-toolbar';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'kb-btn kb-primary';
    saveBtn.textContent = t('saveMaster');
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'kb-btn';
    cancelBtn.textContent = t('cancel');

    cancelBtn.addEventListener('click', () => {
      backdrop.remove();
      modal.remove();
    });

    const gatherMappings = () => {
      const result = [];
      mappingContainer.querySelectorAll('.mapping-row').forEach((row) => {
        const [fieldSelect, excelInput] = row.querySelectorAll('select, input');
        const code = fieldSelect.value;
        const excel = excelInput.value.trim();
        const label = getSelectedText(fieldSelect) || code;
        if (code && excel) {
          result.push({ kintoneFieldCode: code, kintoneFieldLabel: label, excelHeaderName: excel });
        }
      });
      return result;
    };

    saveBtn.addEventListener('click', () => {
      const next = {
        id: master && master.id ? master.id : uuid(),
        name: nameField.value.trim(),
        appId: APP_ID,
        keyFieldCode: keySelect.value,
        keyFieldLabel: getSelectedText(keySelect) || keySelect.value,
        mappings: gatherMappings()
      };
      if (!next.name) {
        showMessage(t('validationName'), 'error');
        return;
      }
      if (!next.appId) {
        showMessage(t('appIdMissing'), 'error');
        return;
      }
      if (!next.keyFieldCode) {
        showMessage(t('validationKey'), 'error');
        return;
      }
      if (!next.mappings.length) {
        showMessage(t('validationMappings'), 'error');
        return;
      }
      if (typeof index === 'number') {
        state.masters.splice(index, 1, next);
      } else {
        state.masters.push(next);
      }
      renderMasters();
      showMessage('');
      backdrop.remove();
      modal.remove();
    });

    form.append(
      createLabeledField(t('masterName'), nameField),
      createLabeledField(t('keyField'), keySelect, loadFieldsButton, fieldStatus),
      createLabeledField(t('mappings'), mappingContainer, addMappingBtn, (() => {
        const hint = document.createElement('span');
        hint.className = 'kb-muted';
        hint.textContent = t('mappingHint');
        return hint;
      })())
    );

    modalActions.append(saveBtn, cancelBtn);

    card.append(title, form, modalActions);
    modal.appendChild(card);
    document.body.append(backdrop, modal);

    loadFieldsButton.click();
  };

  const createLabeledField = (labelText, mainControl, actionBtn, extraNode) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-field';
    const label = document.createElement('label');
    label.className = 'kb-label';
    label.textContent = labelText;
    const fieldWrap = document.createElement('div');
    fieldWrap.style.display = 'flex';
    fieldWrap.style.flexDirection = 'column';
    fieldWrap.style.gap = '6px';
    fieldWrap.appendChild(mainControl);
    if (actionBtn) {
      fieldWrap.appendChild(actionBtn);
    }
    if (extraNode) {
      fieldWrap.appendChild(extraNode);
    }
    wrap.append(label, fieldWrap);
    return wrap;
  };

  const saveConfiguration = () => {
    if (!storage || typeof storage.saveMasters !== 'function') {
      try {
        kintone.plugin.app.setConfig({ masters: JSON.stringify(state.masters) }, () => {
          showMessage(t('statusSaved'), 'success');
        });
      } catch (error) {
        showMessage(error.message, 'error');
      }
      return;
    }
    storage.saveMasters(PLUGIN_ID, state.masters)
      .then(() => {
        showMessage(t('statusSaved'), 'success');
      })
      .catch((error) => {
        showMessage(error.message, 'error');
      });
  };

  const init = () => {
    cacheElements();
    translateStatic();
    if (!APP_ID) {
      showMessage(t('appIdMissing'), 'error');
    }
    const rawConfig = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
    const fallback = safeJsonParse(rawConfig.masters, []);
    const existing = storage && typeof storage.getMasters === 'function' ? storage.getMasters(PLUGIN_ID) : fallback;
    state.masters = normalizeMasters(existing);
    renderMasters();
    elements.addMaster.addEventListener('click', () => openMasterModal());
    elements.save.addEventListener('click', saveConfiguration);
    elements.cancel.addEventListener('click', () => history.back());
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(kintone.$PLUGIN_ID);
