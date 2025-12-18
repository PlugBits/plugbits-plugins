(function (namespace) {
  'use strict';

  const TEXTS = {
    ja: {
      title: 'Excel JOIN チャネル',
      lead: 'Excel/CSV をアップロードし、定義済みの kintone マスターと JOIN して、マージ済み Excel をダウンロードします。',
      stepFile: 'ファイルを選択',
      filePicker: 'ここをクリックしてファイル選択',
      fileHint: '対応形式: .xlsx / .xls / .csv',
      stepSheet: 'シートを選択',
      sheetLabel: '読み込むシート',
      sheetHint: 'Excel を読み込むと候補が表示されます。',
      stepKey: 'キー列を指定',
      keyLabel: 'JOINキーの列名',
      keyHint: 'Excel 側の列名を指定します。',
      stepMaster: 'マスターを選択',
      masterLabel: '使用するマスター定義',
      masterHint: 'プラグイン設定で登録したマスターを選択',
      masterPlaceholder: 'マスターを選択してください',
      close: '閉じる',
      run: 'JOINしてダウンロード',
      errorNoFile: 'Excel/CSV ファイルを選択してください。',
      errorNoSheet: 'シートを選択してください。',
      errorNoKey: 'JOIN に使用する列を選択してください。',
      errorNoMaster: 'マスター定義を選択してください。',
      errorNoConfig: 'マスター定義がありません。プラグイン設定を確認してください。',
      loadingMaster: 'kintone からマスターを取得しています…',
      joinSuccess: '{count} 行にマスター情報を結合しました。',
      fileLoaded: 'ファイルを読み込みました。',
      sheetLoaded: 'シートを読み込みました。',
      statusReady: 'JOIN の準備ができました。',
      statusParsing: 'ファイルを解析しています…',
      popupBlocked: 'ポップアップを許可してください。',
      mappingHeaderExcel: 'Excel列',
      mappingHeaderKintone: 'kintoneフィールド'
    },
    en: {
      title: 'Excel Join Workspace',
      lead: 'Upload Excel/CSV, join it with predefined kintone masters, then download the merged workbook.',
      stepFile: 'Pick a file',
      filePicker: 'Click to choose a file',
      fileHint: 'Supported: .xlsx / .xls / .csv',
      stepSheet: 'Choose sheet',
      sheetLabel: 'Sheet name',
      sheetHint: 'Sheets appear after parsing the file.',
      stepKey: 'Select key column',
      keyLabel: 'Excel key column',
      keyHint: 'Choose the column that will be matched with the master.',
      stepMaster: 'Select master',
      masterLabel: 'Master definition',
      masterHint: 'Pick a master defined in the plugin config.',
      masterPlaceholder: 'Select a master',
      close: 'Close',
      run: 'Join & Download',
      errorNoFile: 'Please choose an Excel/CSV file.',
      errorNoSheet: 'Please select a sheet.',
      errorNoKey: 'Please select the key column.',
      errorNoMaster: 'Please choose a master definition.',
      errorNoConfig: 'No master definitions found. Please configure the plugin.',
      loadingMaster: 'Fetching master records from kintone…',
      joinSuccess: 'Joined {count} rows with master data.',
      fileLoaded: 'File parsed successfully.',
      sheetLoaded: 'Sheet parsed successfully.',
      statusReady: 'Ready to run the join.',
      statusParsing: 'Parsing file…',
      popupBlocked: 'Popup was blocked. Please allow popups.',
      mappingHeaderExcel: 'Excel Header',
      mappingHeaderKintone: 'kintone Field'
    }
  };

  const detectLang = () => {
    try {
      const storageHelper = namespace.storage && typeof namespace.storage.getKintone === 'function'
        ? namespace.storage.getKintone()
        : null;
      if (storageHelper && storageHelper.getLoginUser) {
        const currentUser = storageHelper.getLoginUser();
        if (currentUser && currentUser.language === 'ja') {
          return 'ja';
        }
      }
      if (window.opener && window.opener.kintone && window.opener.kintone.getLoginUser) {
        const openerUser = window.opener.kintone.getLoginUser();
        if (openerUser && openerUser.language === 'ja') {
          return 'ja';
        }
      }
    } catch (_error) {
      /* ignore */
    }
    return 'en';
  };

  const LANG = detectLang();
  const t = (key, vars = {}) => {
    const dict = TEXTS[LANG] || TEXTS.en;
    const template = dict[key] || TEXTS.en[key] || key;
    return template.replace(/\{(\w+)\}/g, (_, token) => (vars[token] != null ? String(vars[token]) : ''));
  };

  const rememberedSession = namespace.storage && typeof namespace.storage.readSession === 'function'
    ? namespace.storage.readSession()
    : {};

  const detectPluginId = () => {
    const params = new URLSearchParams(location.search);
    const queryId = params.get('pluginId');
    if (queryId) {
      return queryId;
    }
    try {
      const stored = window.sessionStorage.getItem('plugbitsExcelJoinPluginId');
      if (stored) {
        return stored;
      }
    } catch (_error) {
      /* ignore */
    }
    return '';
  };

  const state = {
    pluginId: '',
    masters: [],
    workbook: null,
    rows: [],
    sheetName: '',
    keyColumn: '',
    file: null,
    masterId: '',
    cache: new Map(),
    isLoading: false,
    remembered: rememberedSession
  };

  const elements = {};

  const qs = (selector) => document.querySelector(selector);

  const assignElements = () => {
    elements.fileInput = qs('#fileInput');
    elements.dropzone = qs('#dropzone');
    elements.fileChip = qs('#fileChip');
    elements.sheetSelect = qs('#sheetSelect');
    elements.keySelect = qs('#keySelect');
    elements.masterSelect = qs('#masterSelect');
    elements.status = qs('#status');
    elements.progress = qs('#progress');
    elements.runButton = qs('#runJoin');
    elements.closeButton = qs('#closeWindow');
    elements.mappingTable = qs('#mappingTable');
  };

  const translateStatic = () => {
    document.querySelectorAll('[data-i18n]').forEach((node) => {
      const key = node.getAttribute('data-i18n');
      node.textContent = t(key);
    });
  };

  const setStatus = (message, variant = 'info') => {
    if (!elements.status) {
      return;
    }
    if (!message) {
      elements.status.style.display = 'none';
      elements.status.textContent = '';
      elements.status.className = 'status-banner';
      return;
    }
    elements.status.style.display = 'block';
    elements.status.textContent = message;
    elements.status.className = 'status-banner';
    if (variant === 'error') {
      elements.status.classList.add('is-error');
    } else if (variant === 'success') {
      elements.status.classList.add('is-success');
    }
  };

  const setProgress = (message) => {
    if (!elements.progress) {
      return;
    }
    if (!message) {
      elements.progress.style.display = 'none';
      elements.progress.textContent = '';
      return;
    }
    elements.progress.style.display = 'flex';
    elements.progress.textContent = message;
  };

  const updateRunAvailability = () => {
    if (!elements.runButton) {
      return;
    }
    const ready = !!(state.file && state.sheetName && state.keyColumn && state.masterId);
    elements.runButton.disabled = !ready || state.isLoading;
  };

  const persistSession = () => {
    if (namespace.storage && typeof namespace.storage.rememberSession === 'function') {
      namespace.storage.rememberSession({
        sheetName: state.sheetName,
        keyColumn: state.keyColumn,
        masterId: state.masterId
      });
    }
  };

  const populateMasterOptions = () => {
    const select = elements.masterSelect;
    if (!select) {
      return;
    }
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = t('masterPlaceholder');
    select.appendChild(placeholder);

    state.masters.forEach((master) => {
      const option = document.createElement('option');
      option.value = master.id;
      option.textContent = `${master.name} (App ${master.appId})`;
      select.appendChild(option);
    });

    if (!state.masters.length) {
      select.disabled = true;
      setStatus(t('errorNoConfig'), 'error');
    } else {
      select.disabled = false;
    }

    if (state.remembered.masterId) {
      select.value = state.remembered.masterId;
      if (select.value === state.remembered.masterId) {
        state.masterId = state.remembered.masterId;
        renderMappingTable();
      }
    }
  };

  const populateSheetOptions = (sheetNames) => {
    const select = elements.sheetSelect;
    select.innerHTML = '';
    if (!sheetNames.length) {
      select.disabled = true;
      return;
    }
    sheetNames.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
    select.disabled = false;
    if (state.remembered.sheetName && sheetNames.includes(state.remembered.sheetName)) {
      select.value = state.remembered.sheetName;
      state.sheetName = state.remembered.sheetName;
      loadSheetRows();
    } else if (sheetNames.length) {
      select.selectedIndex = 0;
      loadSheetRows();
    }
  };

  const populateKeyOptions = (headers) => {
    const select = elements.keySelect;
    select.innerHTML = '';
    state.keyColumn = '';
    if (!headers.length) {
      select.disabled = true;
      return;
    }
    headers.forEach((header) => {
      const option = document.createElement('option');
      option.value = header;
      option.textContent = header;
      select.appendChild(option);
    });
    select.disabled = false;
    if (state.remembered.keyColumn && headers.includes(state.remembered.keyColumn)) {
      select.value = state.remembered.keyColumn;
      state.keyColumn = state.remembered.keyColumn;
    }
  };

  const resetWorkbookState = () => {
    state.workbook = null;
    state.rows = [];
    state.sheetName = '';
    state.keyColumn = '';
    elements.sheetSelect.innerHTML = '';
    elements.sheetSelect.disabled = true;
    elements.keySelect.innerHTML = '';
    elements.keySelect.disabled = true;
    elements.fileChip.style.display = 'none';
    updateRunAvailability();
  };

  const handleFile = async (file) => {
    if (!file) {
      setStatus(t('errorNoFile'), 'error');
      return;
    }
    resetWorkbookState();
    state.file = file;
    state.isLoading = true;
    updateRunAvailability();
    setStatus(t('statusParsing'), 'info');
    setProgress(t('statusParsing'));
    try {
      state.workbook = await namespace.excelUtil.readWorkbookFromFile(file);
      state.rows = [];
      const sheetNames = state.workbook ? state.workbook.SheetNames : [];
      populateSheetOptions(sheetNames || []);
      const fileInfo = `${file.name} (${Math.round(file.size / 1024)} KB)`;
      elements.fileChip.textContent = fileInfo;
      elements.fileChip.style.display = 'inline-flex';
      setStatus(t('fileLoaded'), 'success');
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Failed to parse file.', 'error');
      resetWorkbookState();
    } finally {
      state.isLoading = false;
      setProgress('');
      updateRunAvailability();
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    elements.dropzone.classList.remove('is-dragover');
    const transfer = event.dataTransfer;
    const file = transfer && transfer.files && transfer.files[0];
    handleFile(file);
  };

  const handleDrag = (event) => {
    event.preventDefault();
    if (event.type === 'dragover') {
      elements.dropzone.classList.add('is-dragover');
    } else {
      elements.dropzone.classList.remove('is-dragover');
    }
  };

  const loadSheetRows = () => {
    if (!state.workbook || !elements.sheetSelect.value) {
      state.rows = [];
      return;
    }
    state.sheetName = elements.sheetSelect.value;
    state.rows = namespace.excelUtil.sheetToRows(state.workbook, state.sheetName) || [];
    const headers = state.rows.length ? Object.keys(state.rows[0]) : [];
    populateKeyOptions(headers);
    setStatus(t('sheetLoaded'), 'success');
    persistSession();
    updateRunAvailability();
  };

  const normalizeKey = (value) => {
    if (value == null) {
      return '';
    }
    return String(value).trim();
  };

  const ensureMaster = () => {
    const master = state.masters.find((item) => item.id === state.masterId);
    if (!master) {
      throw new Error(t('errorNoMaster'));
    }
    return master;
  };

  const fetchMasterRecords = async (master) => {
    if (state.cache.has(master.id)) {
      return state.cache.get(master.id);
    }
    setProgress(t('loadingMaster'));
    const fieldCodes = [master.keyFieldCode, ...master.mappings.map((m) => m.kintoneFieldCode)];
    const records = await namespace.kintoneClient.fetchAllRecords({
      appId: master.appId,
      fields: fieldCodes
    });
    state.cache.set(master.id, records);
    setProgress('');
    return records;
  };

  const buildMasterMap = (records, master) => {
    const map = new Map();
    records.forEach((record) => {
      const keyValue = namespace.kintoneClient.extractFieldValue(record[master.keyFieldCode]);
      const key = normalizeKey(keyValue);
      if (key) {
        map.set(key, record);
      }
    });
    return map;
  };

  const runJoin = async () => {
    if (!state.file) {
      setStatus(t('errorNoFile'), 'error');
      return;
    }
    if (!state.sheetName) {
      setStatus(t('errorNoSheet'), 'error');
      return;
    }
    if (!state.keyColumn) {
      setStatus(t('errorNoKey'), 'error');
      return;
    }
    if (!state.masterId) {
      setStatus(t('errorNoMaster'), 'error');
      return;
    }
    const master = ensureMaster();
    try {
      state.isLoading = true;
      updateRunAvailability();
      setStatus(t('loadingMaster'));
      const records = await fetchMasterRecords(master);
      const masterMap = buildMasterMap(records, master);
      let matchCount = 0;
      const mappingList = Array.isArray(master.mappings) ? master.mappings : [];
      const mergedRows = state.rows.map((row) => {
        const nextRow = { ...row };
        const key = normalizeKey(row[state.keyColumn]);
        if (!key) {
          return nextRow;
        }
        const record = masterMap.get(key);
        if (!record) {
          return nextRow;
        }
        matchCount += 1;
        mappingList.forEach((mapping) => {
          const raw = namespace.kintoneClient.extractFieldValue(record[mapping.kintoneFieldCode]);
          nextRow[mapping.excelHeaderName] = raw;
        });
        return nextRow;
      });
      const safeFileName = buildOutputFileName(state.file ? state.file.name : '', master.name);
      namespace.excelUtil.downloadRowsAsXlsx(mergedRows, {
        sheetName: state.sheetName,
        fileName: safeFileName
      });
      setStatus(t('joinSuccess', { count: matchCount }), 'success');
      setProgress('');
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'JOIN failed.', 'error');
    } finally {
      state.isLoading = false;
      updateRunAvailability();
      persistSession();
    }
  };

  const buildOutputFileName = (original, masterName) => {
    if (!original) {
      return `kintone-join-${Date.now()}.xlsx`;
    }
    const base = original.replace(/\.[^.]+$/, '');
    const sanitized = base.replace(/[^\w\-]+/g, '_');
    const suffix = masterName ? masterName.replace(/[^\w\-]+/g, '_') : 'master';
    return `${sanitized || 'excel'}_${suffix}.xlsx`;
  };

  const renderMappingTable = () => {
    const container = elements.mappingTable;
    if (!container) {
      return;
    }
    container.innerHTML = '';
    const master = state.masters.find((item) => item.id === state.masterId);
    if (!master) {
      container.style.display = 'none';
      return;
    }
    const mappingList = Array.isArray(master.mappings) ? master.mappings : [];
    if (!mappingList.length) {
      container.style.display = 'none';
      return;
    }
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const excelTh = document.createElement('th');
    excelTh.textContent = t('mappingHeaderExcel');
    const kintoneTh = document.createElement('th');
    kintoneTh.textContent = t('mappingHeaderKintone');
    headRow.append(excelTh, kintoneTh);
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    mappingList.forEach((mapping) => {
      const tr = document.createElement('tr');
      const excelTd = document.createElement('td');
      excelTd.textContent = mapping.excelHeaderName;
      const kintoneTd = document.createElement('td');
      const label = mapping.kintoneFieldLabel ? `${mapping.kintoneFieldLabel} (${mapping.kintoneFieldCode})` : mapping.kintoneFieldCode;
      kintoneTd.textContent = label;
      tr.append(excelTd, kintoneTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
    container.style.display = 'block';
  };

  const bindEvents = () => {
    elements.fileInput.addEventListener('change', (event) => {
      const inputFiles = event.target && event.target.files;
      const file = inputFiles && inputFiles[0];
      handleFile(file);
    });
    elements.dropzone.addEventListener('click', () => {
      elements.fileInput.click();
    });
    ['dragover', 'dragenter'].forEach((type) => {
      elements.dropzone.addEventListener(type, handleDrag);
    });
    ['dragleave', 'drop'].forEach((type) => {
      elements.dropzone.addEventListener(type, handleDrag);
    });
    elements.dropzone.addEventListener('drop', handleDrop);

    elements.sheetSelect.addEventListener('change', () => {
      loadSheetRows();
    });
    elements.keySelect.addEventListener('change', () => {
      state.keyColumn = elements.keySelect.value;
      persistSession();
      updateRunAvailability();
    });
    elements.masterSelect.addEventListener('change', () => {
      state.masterId = elements.masterSelect.value || '';
      renderMappingTable();
      persistSession();
      updateRunAvailability();
    });
    elements.runButton.addEventListener('click', runJoin);
    elements.closeButton.addEventListener('click', () => {
      window.close();
    });
  };

  const init = () => {
    assignElements();
    translateStatic();
    state.pluginId = detectPluginId();
    if (!state.pluginId) {
      setStatus('pluginId is missing in query string.', 'error');
    }
    const masterList = namespace.storage && typeof namespace.storage.getMasters === 'function'
      ? namespace.storage.getMasters(state.pluginId)
      : [];
    state.masters = masterList || [];
    populateMasterOptions();
    bindEvents();
    updateRunAvailability();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.PlugbitsExcelJoin = window.PlugbitsExcelJoin || {});
