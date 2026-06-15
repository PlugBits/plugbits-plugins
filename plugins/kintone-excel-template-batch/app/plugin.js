/* global Blob, URL, TextEncoder, TextDecoder, DecompressionStream, MouseEvent, fetch, Response, QRCode, ExcelJS */
(() => {
  'use strict';

  const PLUGIN_ID = kintone.$PLUGIN_ID;
  if (!PLUGIN_ID) {
    return;
  }

  const TEXT = {
    ja: {
      buttonLabelDefault: 'ラベルを生成',
      notConfigured: 'Excel帳票プラグインが設定されていません。',
      noRecords: '出力対象のレコードがありません。',
      modalTitle: 'Excelへ出力するレコードを選択',
      modalDescription: '現在の一覧に表示されているレコードからxlsxへ出力します。',
      modalClose: '閉じる',
      modalSelectAll: '全選択',
      modalClear: '解除',
      modalGenerate: 'xlsx生成',
      modalNoSelection: 'レコードが選択されていません。',
      templateMissing: 'Excelテンプレートが見つかりません。',
      templateFetchFailed: 'Excelテンプレートの取得に失敗しました。',
      unsupportedZip: 'このブラウザではテンプレートxlsxを展開できません。ChromeまたはEdgeの最新版でお試しください。',
      generateFailed: 'xlsx生成に失敗しました。テンプレート形式を確認してください。',
      generating: 'xlsxを生成しています...',
      templateAppRequired: '帳票テンプレートアプリIDとテンプレートコードを設定してください。',
      templateAppNotFound: '帳票テンプレートアプリにテンプレートが見つかりません。',
      templateAppFileMissing: '帳票テンプレートアプリのテンプレートファイルが見つかりません。',
      splitConfigMissing: '複数ラベル作成には全体数量のフィールドと1ラベルあたりの数量フィールドが必要です。',
      splitInvalidQty: 'ラベル枚数設定の数量が正しくありません。',
      maxSheetsExceeded: '選択したレコード数が最大シート数を超えています。',
      printStatusUpdateFailed: 'xlsxは生成されましたが、印刷ステータスの更新に失敗しました。',
      printStatusUpdated: '印刷ステータスを更新しました。',
      generated: 'xlsxを生成しました。'
    },
    en: {
      buttonLabelDefault: 'Generate Labels',
      notConfigured: 'Excel template plugin is not configured.',
      noRecords: 'No records are available for export.',
      modalTitle: 'Select Records for Excel',
      modalDescription: 'Exports records currently shown in this list to an xlsx workbook.',
      modalClose: 'Close',
      modalSelectAll: 'Select all',
      modalClear: 'Clear',
      modalGenerate: 'Generate xlsx',
      modalNoSelection: 'No records selected for output.',
      templateMissing: 'Excel template was not found.',
      templateFetchFailed: 'Failed to fetch the Excel template.',
      templateAppRequired: 'Template App ID and Template Code are required.',
      templateAppNotFound: 'Template was not found in the template app.',
      templateAppFileMissing: 'Template file is missing in the template app.',
      splitConfigMissing: 'Quantity Split requires Quantity Field and SNP / Pack Quantity Field.',
      splitInvalidQty: 'Invalid Quantity Split value.',
      unsupportedZip: 'This browser cannot expand the template xlsx. Please use the latest Chrome or Edge.',
      generateFailed: 'Excel label generation failed.',
      maxSheetsExceeded: 'Selected records exceed the maximum sheets per workbook.',
      printStatusUpdateFailed: 'Excel was generated, but print status update failed.',
      printStatusUpdated: 'Print status updated.',
      generating: 'Generating Excel labels...',
      generated: 'Excel labels generated.'
    }
  };

  const getLang = () => {
    try {
      const lang = window.kintone?.getLoginUser?.().language;
      if (lang && TEXT[lang]) {
        return lang;
      }
    } catch {
      /* noop */
    }
    return 'ja';
  };

  const parseViewIds = (value) => {
    if (!value) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      /* fallback */
    }
    return String(value).split(',').map((v) => v.trim()).filter(Boolean);
  };

  const parseMapping = (value) => {
    if (!value) {
      return {};
    }
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      /* fallback */
    }
    return {};
  };

  const parseJsonArray = (value) => {
    if (!value) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const normalizeTemplateSource = (value) => {
    const map = {
      attachment: 'recordFile',
      url: 'fixedUrl',
      recordFile: 'recordFile',
      fixedUrl: 'fixedUrl',
      templateApp: 'templateApp'
    };
    return map[value] || 'recordFile';
  };

  const normalizeOutputMode = (value) => {
    return value === 'report' ? 'report' : 'label';
  };

  const lang = getLang();
  const STRINGS = TEXT[lang];
  const stored = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  const CONFIG = {
    outputMode: normalizeOutputMode(stored.outputMode),
    templateSource: normalizeTemplateSource(stored.templateSource),
    templateFileField: (stored.templateFileField || '').trim(),
    templateUrl: (stored.templateUrl || '').trim(),
    templateAppId: (stored.templateAppId || '').trim(),
    templateCodeField: (stored.templateCodeField || 'templateCode').trim(),
    templateCode: (stored.templateCode || '').trim(),
    templateStatusField: (stored.templateStatusField || 'status').trim(),
    templateActiveValue: (stored.templateActiveValue || 'ACTIVE').trim(),
    reportDetailTableField: (stored.reportDetailTableField || '').trim(),
    reportDetailStartRow: Number(stored.reportDetailStartRow || 15),
    reportRowsPerPage: Number(stored.reportRowsPerPage || 20),
    reportHideEmptyRows: stored.reportHideEmptyRows !== 'false',
    reportDetailRows: parseJsonArray(stored.reportDetailRows || ''),
    mapping: parseMapping(stored.mappingJson || ''),
    mappingRows: parseJsonArray(stored.mappingRows || ''),
    enableQuantitySplit: stored.enableQuantitySplit === 'true',
    quantityField: (stored.quantityField || '').trim(),
    packQtyField: (stored.packQtyField || '').trim(),
    outputQtyTag: (stored.outputQtyTag || 'labelQty').trim() || 'labelQty',
    enableQrImage: stored.enableQrImage !== 'false',
    qrImageMargin: 1,
    qrPadding: Number(stored.qrPadding || 4),
    enablePrintStatusUpdate: stored.enablePrintStatusUpdate === 'true',
    printStatusFieldCode: (stored.printStatusFieldCode || '').trim(),
    printedStatusValue: (stored.printedStatusValue || 'PRINTED').trim() || 'PRINTED',
    reprintedStatusValue: (stored.reprintedStatusValue || 'REPRINTED').trim() || 'REPRINTED',
    printedAtFieldCode: (stored.printedAtFieldCode || '').trim(),
    printedByFieldCode: (stored.printedByFieldCode || '').trim(),
    columnWidthScale: (stored.columnWidthScale || '1').trim(),
    rowHeightScale: (stored.rowHeightScale || '1').trim(),
    outputFileName: (stored.outputFileName || '').trim(),
    maxSheetsPerWorkbook: Number(stored.maxSheetsPerWorkbook || 100),
    buttonLabel: (stored.buttonLabel || '').trim() || STRINGS.buttonLabelDefault,
    viewIds: parseViewIds(stored.viewIds || '')
  };

  const VIEW_ID_SET = new Set(CONFIG.viewIds);
  const hasViewLimit = VIEW_ID_SET.size > 0;

  const showToast = (message, type = 'info') => {
    const old = document.querySelector('.kb-root.kb-toast[data-kb-plugin="excel-template-batch"]');
    if (old) {
      old.remove();
    }

    const toast = document.createElement('div');
    toast.className = `kb-root kb-toast kb-toast-${type}`;
    toast.setAttribute('data-kb-plugin', 'excel-template-batch');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = message;
    document.body.appendChild(toast);

    window.setTimeout(() => {
      toast.classList.add('is-hide');
      window.setTimeout(() => toast.remove(), 180);
    }, 2400);
  };

  const getViewKey = (event) => {
    if (event.viewId != null) {
      return String(event.viewId);
    }
    if (event.viewName) {
      return `name:${event.viewName}`;
    }
    return '';
  };

  const findOrCreateHeaderButton = (host) => {
    if (!host) {
      return null;
    }

    let root = host.querySelector('.kb-root[data-kb-plugin="excel-template-batch"]');
    if (!root) {
      root = document.createElement('div');
      root.className = 'kb-root kb-head';
      root.setAttribute('data-kb-plugin', 'excel-template-batch');

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'kb-btn kb-launch-btn';
      button.setAttribute('aria-label', CONFIG.buttonLabel);
      button.setAttribute('title', CONFIG.buttonLabel);

      const icon = document.createElement('span');
      icon.className = 'kb-launch-btn-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = `
        <svg viewBox="0 0 24 24" class="kb-ico" focusable="false" aria-hidden="true">
          <path d="M4 3.5A1.5 1.5 0 0 1 5.5 2h9.88a1.5 1.5 0 0 1 1.06.44l3.12 3.12A1.5 1.5 0 0 1 20 6.62V20.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20.5v-17zM14 3.75V7h3.25L14 3.75zM7 10v8h10v-8H7zm1.5 1.5h2.25v1.75H8.5V11.5zm3.75 0h3.25v1.75h-3.25V11.5zM8.5 14.75h2.25v1.75H8.5v-1.75zm3.75 0h3.25v1.75h-3.25v-1.75z"></path>
        </svg>
      `;

      const text = document.createElement('span');
      text.className = 'kb-launch-btn-text';
      text.textContent = CONFIG.buttonLabel;

      button.append(icon, text);
      root.appendChild(button);
      host.appendChild(root);
      return button;
    }

    return root.querySelector('button');
  };

  const removeHeaderButton = (host) => {
    const root = host?.querySelector('.kb-root[data-kb-plugin="excel-template-batch"]');
    if (root) {
      root.remove();
    }
  };

  const isPluginConfigured = () => {
    return (CONFIG.templateSource === 'templateApp' && CONFIG.templateAppId && CONFIG.templateCode) ||
      (CONFIG.templateSource === 'fixedUrl' && CONFIG.templateUrl) ||
      (CONFIG.templateSource === 'recordFile' && CONFIG.templateFileField);
  };

  const extractText = (field) => {
    if (!field) {
      return '';
    }
    const { value } = field;
    if (value == null) {
      return '';
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => {
        if (item == null) {
          return '';
        }
        if (typeof item === 'string' || typeof item === 'number') {
          return String(item);
        }
        if (typeof item === 'object') {
          return item.name || item.code || item.fileKey || item.contentType || '';
        }
        return '';
      }).filter(Boolean).join(', ');
    }
    if (typeof value === 'object') {
      return value.name || value.code || JSON.stringify(value);
    }
    return String(value);
  };

  const getRecordId = (record) => extractText(record?.$id);

  const toNumber = (value) => {
    if (value == null) {
      return 0;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    const text = String(value).replace(/,/g, '').trim();
    if (!text) {
      return 0;
    }

    const direct = Number(text);
    if (Number.isFinite(direct)) {
      return direct;
    }

    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) {
      return 0;
    }

    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatNumber = (value) => Number.isInteger(value) ? String(value) : String(value);

  const normalizePositiveInt = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };

  const getSubtableRows = (record, fieldCode) => {
    const rows = record?.[fieldCode]?.value;
    return Array.isArray(rows) ? rows : [];
  };

  const getBuiltInValue = (name, context, data) => {
    const now = new Date();
    const builtIns = {
      recordId: data.recordId || '',
      seqNo: data.seqNo || '',
      seqTotal: data.seqTotal || '',
      labelQty: data.labelQty || '',
      splitIndex: data.splitIndex || '',
      splitKey: data.splitKey || '',
      ticketId: data.ticketId || '',
      qrText: data.qrText || '',
      ticketQr: data.ticketId || data.splitKey || '',
      partQr: data.partNumber || '',
      today: now.toISOString().slice(0, 10),
      now: now.toISOString()
    };
    return builtIns[name] ?? context.extra?.[name] ?? '';
  };

  const buildOutputContexts = (record, config) => {
    if (config.outputMode === 'report') {
      return buildReportOutputContexts(record, config);
    }

    const recordId = getRecordId(record);
    if (!config.enableQuantitySplit) {
      const quantityValue = config.quantityField ? extractText(record[config.quantityField]) : '';
      const labelQty = quantityValue || '';
      return [{
        record,
        extra: {
          seqNo: '1',
          seqTotal: '1',
          labelQty,
          [config.outputQtyTag]: labelQty,
          splitIndex: '0',
          splitKey: `${recordId}-001`
        }
      }];
    }

    if (!config.quantityField || !config.packQtyField) {
      throw new Error('split config missing');
    }

    const totalQtyValue = extractText(record[config.quantityField]);
    const packQtyValue = extractText(record[config.packQtyField]);
    const totalQty = toNumber(totalQtyValue);
    const packQty = toNumber(packQtyValue);
    if (!(totalQty > 0) || !(packQty > 0)) {
      const label = getRecordTitle(record, 0);
      throw new Error(`split invalid qty: ${label}; quantity=${totalQtyValue || '(empty)'}; packQty=${packQtyValue || '(empty)'}`);
    }

    const seqTotal = Math.ceil(totalQty / packQty);
    return Array.from({ length: seqTotal }, (_unused, index) => {
      const seqNo = index + 1;
      const remain = totalQty - index * packQty;
      const labelQty = Math.min(packQty, remain);
      const labelQtyText = formatNumber(labelQty);
      return {
        record,
        extra: {
          seqNo: String(seqNo),
          seqTotal: String(seqTotal),
          labelQty: labelQtyText,
          [config.outputQtyTag]: labelQtyText,
          splitIndex: String(index),
          splitKey: `${recordId}-${String(seqNo).padStart(3, '0')}`
        }
      };
    });
  };

  const buildReportOutputContexts = (record, config) => {
    const recordId = getRecordId(record);
    const detailRows = getSubtableRows(record, config.reportDetailTableField);
    const rowsPerPage = normalizePositiveInt(config.reportRowsPerPage, 20);
    const pageTotal = Math.max(1, Math.ceil(detailRows.length / rowsPerPage));

    return Array.from({ length: pageTotal }, (_unused, index) => {
      const start = index * rowsPerPage;
      const end = start + rowsPerPage;
      const pageRows = detailRows.slice(start, end);
      const pageNo = index + 1;
      return {
        record,
        extra: {
          pageNo: String(pageNo),
          pageTotal: String(pageTotal),
          detailStartNo: pageRows.length ? String(start + 1) : '',
          detailEndNo: pageRows.length ? String(start + pageRows.length) : '',
          seqNo: String(pageNo),
          seqTotal: String(pageTotal),
          splitIndex: String(index),
          splitKey: `${recordId}-${String(pageNo).padStart(3, '0')}`
        },
        report: {
          rows: pageRows,
          startIndex: start
        }
      };
    });
  };

  const buildRecordData = (context) => {
    const { record, extra } = context;
    const data = {
      recordId: extractText(record.$id),
      ...extra
    };

    Object.keys(record).forEach((code) => {
      data[code] = extractText(record[code]);
    });

    Object.assign(data, extra);

    if (!data.ticketId) {
      data.ticketId = data.recordId;
    }
    if (!data.qrText) {
      data.qrText = data.ticketId || data.splitKey || data.recordId;
    }
    if (!data.ticketQr) {
      data.ticketQr = data.ticketId || data.splitKey || '';
    }
    if (!data.partQr) {
      data.partQr = data.partNumber || '';
    }

    if (CONFIG.mappingRows.length) {
      CONFIG.mappingRows.forEach((row) => {
        if (!row?.tag) {
          return;
        }
        if (row.sourceType === 'builtIn') {
          data[row.tag] = getBuiltInValue(row.builtIn, context, data);
          return;
        }
        if (row.sourceType === 'static') {
          data[row.tag] = row.staticValue || '';
          return;
        }
        data[row.tag] = extractText(record[String(row.fieldCode || '')]);
      });
    } else {
      Object.entries(CONFIG.mapping).forEach(([tag, fieldCode]) => {
        data[tag] = extractText(record[String(fieldCode)]);
      });
    }
    return data;
  };

  const escapeXml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const decodeXml = (value) => String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

  const TAG_PLACEHOLDER_RE = /\{\{\s*([^{}\r\n]+?)\s*\}\}/g;
  const QR_PLACEHOLDER_RE = /^\s*\{\{QR:([^{}\r\n]+?)\}\}\s*$/;
  const BARCODE_PLACEHOLDER_RE = /^\s*\{\{BC:([^{}\r\n]+?)\}\}\s*$/;

  const normalizeTagName = (value) => String(value || '').trim();

  const replaceTags = (text, data, escape = true) => {
    return String(text).replace(TAG_PLACEHOLDER_RE, (match, rawKey) => {
      const key = normalizeTagName(rawKey);
      if (/^(QR|BC):/i.test(key)) {
        return match;
      }
      const value = data[key] ?? '';
      return escape ? escapeXml(value) : String(value);
    });
  };
  const BARCODE_OPTIONS = {
    moduleWidth: 2,
    height: 60,
    quietZone: 10,
    maxWarnLength: 48
  };
  const CODE128_PATTERNS = [
    '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
    '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
    '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
    '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
    '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
    '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
    '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
    '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
    '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
    '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
    '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
    '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
    '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
    '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
    '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
    '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
    '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
    '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
    '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
    '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
    '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
    '11010011100', '1100011101011'
  ];

  const createQrBase64 = async (text) => {
    const dataUrl = await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: Number.isFinite(CONFIG.qrImageMargin) ? CONFIG.qrImageMargin : 1,
      scale: 8
    });
    return String(dataUrl).split(',')[1] || '';
  };

  const createBarcodeBase64 = (text) => {
    const value = String(text || '');
    if (!value) {
      return '';
    }
    if (value.length > BARCODE_OPTIONS.maxWarnLength) {
      console.warn('[Excel Template] barcode value is long', value.length, value);
    }

    const codes = [104];
    for (let i = 0; i < value.length; i += 1) {
      const charCode = value.charCodeAt(i);
      if (charCode < 32 || charCode > 126) {
        console.warn('[Excel Template] barcode value contains unsupported CODE128B character', value[i], value);
        return '';
      }
      codes.push(charCode - 32);
    }

    let checksum = codes[0];
    for (let i = 1; i < codes.length; i += 1) {
      checksum += codes[i] * i;
    }
    codes.push(checksum % 103, 106);

    const bits = codes.map((code) => CODE128_PATTERNS[code]).join('');
    const quiet = BARCODE_OPTIONS.quietZone;
    const moduleWidth = BARCODE_OPTIONS.moduleWidth;
    const height = BARCODE_OPTIONS.height;
    const canvas = document.createElement('canvas');
    canvas.width = (bits.length * moduleWidth) + quiet * 2;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    for (let i = 0; i < bits.length; i += 1) {
      if (bits[i] === '1') {
        ctx.fillRect(quiet + i * moduleWidth, 0, moduleWidth, height);
      }
    }
    return String(canvas.toDataURL('image/png')).split(',')[1] || '';
  };

  const escapeQuery = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  const fetchKintoneFileAsArrayBuffer = async (fileKey) => {
    if (!fileKey) {
      throw new Error('template missing');
    }
    const url = kintone.api.urlForGet('/k/v1/file', { fileKey }, true);
    const resp = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    if (!resp.ok) {
      throw new Error('template fetch failed');
    }
    return resp.arrayBuffer();
  };

  const fetchTemplateFromRecordFile = async (config, records) => {
    const fieldCode = config.templateFileField;
    const recordWithTemplate = records.find((record) => {
      const files = record[fieldCode]?.value;
      return Array.isArray(files) && files.length > 0;
    });
    const file = recordWithTemplate?.[fieldCode]?.value?.[0];
    if (!file?.fileKey) {
      throw new Error('template missing');
    }

    return fetchKintoneFileAsArrayBuffer(file.fileKey);
  };

  const fetchTemplateFromUrl = async (templateUrl) => {
    const resp = await fetch(templateUrl, {
      method: 'GET',
      credentials: 'same-origin'
    });
    if (!resp.ok) {
      throw new Error('template fetch failed');
    }
    return resp.arrayBuffer();
  };

  const fetchTemplateFromTemplateApp = async (config) => {
    const appId = Number(config.templateAppId);
    const codeField = config.templateCodeField || 'templateCode';
    const fileField = config.templateFileField || 'templateFile';
    const statusField = config.templateStatusField || 'status';
    const activeValue = config.templateActiveValue || 'ACTIVE';
    const templateCode = config.templateCode || '';

    if (!appId || !templateCode) {
      throw new Error('template app required');
    }

    const query =
      `${codeField} = "${escapeQuery(templateCode)}" and ` +
      `${statusField} in ("${escapeQuery(activeValue)}") ` +
      'order by $id desc limit 1';

    const resp = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
      app: appId,
      query,
      fields: [fileField]
    });

    const record = resp.records && resp.records[0];
    if (!record) {
      throw new Error('template app not found');
    }

    const files = record[fileField]?.value;
    if (!Array.isArray(files) || !files.length || !files[0]?.fileKey) {
      throw new Error('template app file missing');
    }

    return fetchKintoneFileAsArrayBuffer(files[0].fileKey);
  };

  const fetchTemplateArrayBuffer = async (config, records) => {
    if (config.templateSource === 'templateApp') {
      return fetchTemplateFromTemplateApp(config);
    }
    if (config.templateSource === 'fixedUrl') {
      if (!config.templateUrl) {
        throw new Error('template missing');
      }
      return fetchTemplateFromUrl(config.templateUrl);
    }
    if (!config.templateFileField) {
      throw new Error('template missing');
    }
    return fetchTemplateFromRecordFile(config, records);
  };

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  const concatBytes = (parts) => {
    const size = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(size);
    let offset = 0;
    parts.forEach((part) => {
      out.set(part, offset);
      offset += part.length;
    });
    return out;
  };

  const inflateRaw = async (bytes) => {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('unsupported zip');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  };

  const readZip = async (arrayBuffer) => {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0; i -= 1) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) {
      throw new Error('invalid zip');
    }

    const entryCount = view.getUint16(eocd + 10, true);
    const centralOffset = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder('utf-8');
    const files = {};
    let offset = centralOffset;

    for (let i = 0; i < entryCount; i += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) {
        throw new Error('invalid central directory');
      }
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const fileNameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const nameBytes = bytes.slice(offset + 46, offset + 46 + fileNameLength);
      const name = decoder.decode(nameBytes);

      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
      let data;
      if (method === 0) {
        data = compressed;
      } else if (method === 8) {
        data = await inflateRaw(compressed);
      } else {
        throw new Error(`unsupported zip method: ${method}`);
      }

      files[name] = data;
      offset += 46 + fileNameLength + extraLength + commentLength;
    }

    return files;
  };

  const writeUint16 = (buffer, offset, value) => {
    buffer[offset] = value & 0xff;
    buffer[offset + 1] = (value >>> 8) & 0xff;
  };

  const writeUint32 = (buffer, offset, value) => {
    buffer[offset] = value & 0xff;
    buffer[offset + 1] = (value >>> 8) & 0xff;
    buffer[offset + 2] = (value >>> 16) & 0xff;
    buffer[offset + 3] = (value >>> 24) & 0xff;
  };

  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder('utf-8');

  const stringToBytes = (text) => textEncoder.encode(text);
  const bytesToString = (bytes) => textDecoder.decode(bytes);

  const writeZip = (files) => {
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    const entries = Object.entries(files).filter(([, data]) => data != null);

    entries.forEach(([name, data]) => {
      const nameBytes = stringToBytes(name);
      const bytes = data instanceof Uint8Array ? data : stringToBytes(String(data));
      const crc = crc32(bytes);

      const local = new Uint8Array(30 + nameBytes.length);
      writeUint32(local, 0, 0x04034b50);
      writeUint16(local, 4, 20);
      writeUint16(local, 6, 0x0800);
      writeUint16(local, 8, 0);
      writeUint16(local, 10, 0);
      writeUint16(local, 12, 0);
      writeUint32(local, 14, crc);
      writeUint32(local, 18, bytes.length);
      writeUint32(local, 22, bytes.length);
      writeUint16(local, 26, nameBytes.length);
      writeUint16(local, 28, 0);
      local.set(nameBytes, 30);
      localParts.push(local, bytes);

      const central = new Uint8Array(46 + nameBytes.length);
      writeUint32(central, 0, 0x02014b50);
      writeUint16(central, 4, 20);
      writeUint16(central, 6, 20);
      writeUint16(central, 8, 0x0800);
      writeUint16(central, 10, 0);
      writeUint16(central, 12, 0);
      writeUint16(central, 14, 0);
      writeUint32(central, 16, crc);
      writeUint32(central, 20, bytes.length);
      writeUint32(central, 24, bytes.length);
      writeUint16(central, 28, nameBytes.length);
      writeUint16(central, 30, 0);
      writeUint16(central, 32, 0);
      writeUint16(central, 34, 0);
      writeUint16(central, 36, 0);
      writeUint32(central, 38, 0);
      writeUint32(central, 42, localOffset);
      central.set(nameBytes, 46);
      centralParts.push(central);

      localOffset += local.length + bytes.length;
    });

    const centralBytes = concatBytes(centralParts);
    const end = new Uint8Array(22);
    writeUint32(end, 0, 0x06054b50);
    writeUint16(end, 8, entries.length);
    writeUint16(end, 10, entries.length);
    writeUint32(end, 12, centralBytes.length);
    writeUint32(end, 16, localOffset);
    writeUint16(end, 20, 0);

    return concatBytes([...localParts, centralBytes, end]);
  };

  const parseSharedStrings = (xml) => {
    if (!xml) {
      return [];
    }
    const strings = [];
    const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let match;
    while ((match = siRegex.exec(xml))) {
      strings.push(getPlainTextFromStringItem(match[1]));
    }
    return strings;
  };

  const getPlainTextFromStringItem = (xml) => {
    const withoutPhonetics = String(xml)
      .replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
      .replace(/<phoneticPr\b[^>]*\/>/g, '');
    const parts = [];
    withoutPhonetics.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (_t, value) => {
      parts.push(decodeXml(value));
      return '';
    });
    return parts.join('');
  };

  const convertTaggedSharedStringCells = (sheetXml, sharedStrings, data) => {
    return sheetXml.replace(/<c\b([^>]*)\bt="s"([^>]*)>([\s\S]*?)<\/c>/g, (cell, beforeType, afterType, body) => {
      const valueMatch = body.match(/<v>(\d+)<\/v>/);
      if (!valueMatch) {
        return cell;
      }
      const index = Number(valueMatch[1]);
      const shared = sharedStrings[index] || '';
      const attrs = `${beforeType}${afterType}`;
      if (!shared.includes('{{')) {
        return cell;
      }
      const replaced = replaceTags(shared, data, false);
      return `<c${attrs.replace(/\s+t="[^"]*"/g, '')} t="inlineStr"><is><t>${escapeXml(replaced)}</t></is></c>`;
    });
  };

  const convertTaggedInlineStringCells = (sheetXml, data) => {
    return sheetXml.replace(/<c\b([^>]*)\bt="inlineStr"([^>]*)>([\s\S]*?)<\/c>/g, (cell, beforeType, afterType, body) => {
      const text = getPlainTextFromStringItem(body);
      if (!text.includes('{{')) {
        return cell;
      }
      const attrs = `${beforeType}${afterType}`;
      const replaced = replaceTags(text, data, false);
      return `<c${attrs.replace(/\s+t="[^"]*"/g, '')} t="inlineStr"><is><t>${escapeXml(replaced)}</t></is></c>`;
    });
  };

  const createSheetXml = (templateSheetXml, sharedStrings, data) => {
    const convertedShared = convertTaggedSharedStringCells(templateSheetXml, sharedStrings, data);
    const convertedInline = convertTaggedInlineStringCells(convertedShared, data);
    return replaceTags(convertedInline, data, true);
  };

  const getFirstSheetPath = (workbookXml, workbookRelsXml) => {
    const sheetMatch = workbookXml.match(/<sheet\b[^>]*\br:id="([^"]+)"[^>]*\/>/);
    const relId = sheetMatch?.[1];
    if (relId) {
      const relRegex = new RegExp(`<Relationship\\b[^>]*Id="${relId}"[^>]*Target="([^"]+)"[^>]*/>`);
      const relMatch = workbookRelsXml.match(relRegex);
      if (relMatch?.[1]) {
        const target = relMatch[1].replace(/^\/+/, '');
        return target.startsWith('xl/') ? target : `xl/${target}`;
      }
    }
    return 'xl/worksheets/sheet1.xml';
  };

  const replaceWorkbookSheets = (workbookXml, sheetCount, sheetNames) => {
    const sheets = Array.from({ length: sheetCount }, (_unused, index) => {
      const no = index + 1;
      const name = escapeXml(sheetNames[index] || `Label_${no}`);
      return `<sheet name="${name}" sheetId="${no}" r:id="rIdKbSheet${no}"/>`;
    }).join('');
    return workbookXml.replace(/<sheets>[\s\S]*?<\/sheets>/, `<sheets>${sheets}</sheets>`);
  };

  const replaceWorkbookRels = (relsXml, sheetCount) => {
    const withoutSheets = relsXml.replace(/<Relationship\b[^>]*Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/worksheet"[^>]*\/>/g, '');
    const sheetRels = Array.from({ length: sheetCount }, (_unused, index) => {
      const no = index + 1;
      return `<Relationship Id="rIdKbSheet${no}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${no}.xml"/>`;
    }).join('');
    return withoutSheets.replace('</Relationships>', `${sheetRels}</Relationships>`);
  };

  const replaceContentTypes = (contentTypesXml, sheetCount) => {
    const withoutSheets = contentTypesXml.replace(/<Override\b[^>]*PartName="\/xl\/worksheets\/sheet\d+\.xml"[^>]*\/>/g, '');
    const overrides = Array.from({ length: sheetCount }, (_unused, index) => {
      const no = index + 1;
      return `<Override PartName="/xl/worksheets/sheet${no}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    }).join('');
    return withoutSheets.replace('</Types>', `${overrides}</Types>`);
  };

  const sanitizeSheetName = (name, usedNames) => {
    const base = String(name || '')
      .replace(/[\\/?*[\]:]/g, '_')
      .trim() || 'Label';
    let suffix = '';
    let counter = 1;
    let candidate = base.slice(0, 31) || 'Label';

    while (usedNames.has(candidate.toLowerCase())) {
      counter += 1;
      suffix = `_${counter}`;
      candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    }

    usedNames.add(candidate.toLowerCase());
    return candidate;
  };

  const getSheetNameBase = (context, index) => {
    const pageSuffix = context.extra?.pageTotal && Number(context.extra.pageTotal) > 1
      ? `_p${context.extra.pageNo}`
      : '';
    const ticketNumber = extractText(context.record?.ticketNumber).trim();
    if (ticketNumber) {
      return `${ticketNumber}${pageSuffix}`;
    }

    const recordId = getRecordId(context.record).trim();
    if (recordId) {
      return `${recordId}${pageSuffix}`;
    }

    return `Label_${index + 1}`;
  };

  const buildSheetNames = (contexts) => {
    const usedNames = new Set();
    return contexts.map((context, index) => {
      const baseName = getSheetNameBase(context, index);
      const sheetName = sanitizeSheetName(baseName, usedNames);
      console.log('[Excel Template] created sheet', sheetName, getRecordId(context.record));
      return sheetName;
    });
  };

  const generateWorkbook = async (templateBuffer, contexts) => {
    const zip = await readZip(templateBuffer);
    const workbookXml = bytesToString(zip['xl/workbook.xml']);
    const relsXml = bytesToString(zip['xl/_rels/workbook.xml.rels']);
    const contentTypesXml = bytesToString(zip['[Content_Types].xml']);
    const sharedStrings = parseSharedStrings(zip['xl/sharedStrings.xml'] ? bytesToString(zip['xl/sharedStrings.xml']) : '');
    const templateSheetPath = getFirstSheetPath(workbookXml, relsXml);
    const templateSheetXml = bytesToString(zip[templateSheetPath]);

    if (!workbookXml || !relsXml || !contentTypesXml || !templateSheetXml) {
      throw new Error('invalid xlsx template');
    }

    const sheetNames = buildSheetNames(contexts);
    const out = { ...zip };
    out['xl/workbook.xml'] = stringToBytes(replaceWorkbookSheets(workbookXml, contexts.length, sheetNames));
    out['xl/_rels/workbook.xml.rels'] = stringToBytes(replaceWorkbookRels(relsXml, contexts.length));

    for (let index = 0; index < contexts.length; index += 1) {
      const context = contexts[index];
      const data = buildRecordData(context);
      out[`xl/worksheets/sheet${index + 1}.xml`] = stringToBytes(createSheetXml(templateSheetXml, sharedStrings, data));
    }

    out['[Content_Types].xml'] = stringToBytes(replaceContentTypes(contentTypesXml, contexts.length));

    return writeZip(out);
  };

  const getCellText = (cell) => {
    const value = cell.value;
    if (value == null) {
      return '';
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (typeof value === 'object') {
      if (value.text != null) {
        return String(value.text);
      }
      if (Array.isArray(value.richText)) {
        return value.richText.map((part) => part.text || '').join('');
      }
      if (value.result != null) {
        return String(value.result);
      }
    }
    return '';
  };

  const deepClone = (value) => {
    if (value == null) {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
  };

  const toArrayBuffer = (bytes) => {
    if (bytes instanceof ArrayBuffer) {
      return bytes;
    }
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  };

  const getColumnWidthScale = (config) => {
    const n = Number(config.columnWidthScale);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };

  const getRowHeightScale = (config) => {
    const n = Number(config.rowHeightScale);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };

  const copyColumnWidths = (sourceSheet, targetSheet, config) => {
    const scale = getColumnWidthScale(config);
    sourceSheet.columns.forEach((sourceCol, index) => {
      if (!sourceCol) {
        return;
      }
      const colNumber = index + 1;
      const targetCol = targetSheet.getColumn(colNumber);

      if (sourceCol.width != null) {
        targetCol.width = sourceCol.width * scale;
      }
      if (sourceCol.hidden != null) {
        targetCol.hidden = sourceCol.hidden;
      }
      if (sourceCol.outlineLevel != null) {
        targetCol.outlineLevel = sourceCol.outlineLevel;
      }
      if (sourceCol.style) {
        targetCol.style = deepClone(sourceCol.style);
      }
    });
  };

  const copyRowHeights = (sourceSheet, targetSheet, config) => {
    const scale = getRowHeightScale(config);
    sourceSheet.eachRow({ includeEmpty: true }, (sourceRow, rowNumber) => {
      const targetRow = targetSheet.getRow(rowNumber);

      if (sourceRow.height != null) {
        targetRow.height = sourceRow.height * scale;
      }
      if (sourceRow.hidden != null) {
        targetRow.hidden = sourceRow.hidden;
      }
      if (sourceRow.outlineLevel != null) {
        targetRow.outlineLevel = sourceRow.outlineLevel;
      }
    });
  };

  const copyPrintSettings = (sourceSheet, targetSheet) => {
    targetSheet.pageSetup = deepClone(sourceSheet.pageSetup || {});
    targetSheet.pageMargins = deepClone(sourceSheet.pageMargins || {});
    targetSheet.headerFooter = deepClone(sourceSheet.headerFooter || {});
    targetSheet.properties = deepClone(sourceSheet.properties || {});
    targetSheet.views = deepClone(sourceSheet.views || []);

    targetSheet.pageSetup.fitToPage = true;
    targetSheet.pageSetup.fitToWidth = 1;
    targetSheet.pageSetup.fitToHeight = 1;
    delete targetSheet.pageSetup.scale;
  };

  const copySheetLayout = (templateSheet, outputSheet, config) => {
    copyColumnWidths(templateSheet, outputSheet, config);
    copyRowHeights(templateSheet, outputSheet, config);
    copyPrintSettings(templateSheet, outputSheet);
  };

  const resolveTagValue = (tag, context) => {
    const data = buildRecordData(context);
    return String(data[tag] ?? '');
  };

  const replaceTextPlaceholdersInWorksheet = (worksheet, context) => {
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value !== 'string') {
          return;
        }
        if (QR_PLACEHOLDER_RE.test(cell.value) || BARCODE_PLACEHOLDER_RE.test(cell.value)) {
          return;
        }
        if (!cell.value.includes('{{')) {
          return;
        }
        cell.value = cell.value.replace(TAG_PLACEHOLDER_RE, (match, tagName) => {
          const key = normalizeTagName(tagName);
          if (/^(QR|BC):/i.test(key)) {
            return match;
          }
          return resolveTagValue(key, context) || '';
        });
      });
    });
  };

  const getCellAnchorKey = (cell, tag) => {
    const masterAddress = cell.master?.address || cell.address;
    return `${tag}:${masterAddress}`;
  };

  const normalizeMergeRange = (merge) => {
    const range = merge?.model || merge;
    if (!range) {
      return null;
    }
    const top = Number(range.top);
    const left = Number(range.left);
    const bottom = Number(range.bottom);
    const right = Number(range.right);
    if ([top, left, bottom, right].every((value) => Number.isFinite(value))) {
      return { top, left, bottom, right };
    }
    if (range.tl && range.br) {
      const start = String(range.tl).match(/^([A-Z]+)([0-9]+)$/);
      const end = String(range.br).match(/^([A-Z]+)([0-9]+)$/);
      if (start && end) {
        const columnToNumber = (letters) => {
          let col = 0;
          for (let i = 0; i < letters.length; i += 1) {
            col = col * 26 + (letters.charCodeAt(i) - 64);
          }
          return col;
        };
        return {
          top: Number(start[2]),
          left: columnToNumber(start[1]),
          bottom: Number(end[2]),
          right: columnToNumber(end[1])
        };
      }
    }
    return null;
  };

  const findMergedRangeForCell = (worksheet, rowNumber, colNumber) => {
    const merges = worksheet._merges || {};
    const mergeList = Array.isArray(merges) ? merges : Object.values(merges);
    for (const merge of mergeList) {
      const range = normalizeMergeRange(merge);
      if (!range) {
        continue;
      }
      if (
        rowNumber >= range.top &&
        rowNumber <= range.bottom &&
        colNumber >= range.left &&
        colNumber <= range.right
      ) {
        return range;
      }
    }
    return null;
  };

  const excelColumnWidthToPixels = (width) => Math.floor((Number(width || 8.43) * 7) + 5);

  const excelRowHeightToPixels = (height) => Math.floor((Number(height || 15) * 96) / 72);

  const getRangePixelSize = (worksheet, left, top, right, bottom) => {
    let width = 0;
    for (let col = left; col <= right; col += 1) {
      width += excelColumnWidthToPixels(worksheet.getColumn(col).width);
    }

    let height = 0;
    for (let row = top; row <= bottom; row += 1) {
      height += excelRowHeightToPixels(worksheet.getRow(row).height);
    }

    return { width, height };
  };

  const getQrPlacement = (worksheet, cell, config) => {
    const range = findMergedRangeForCell(worksheet, cell.row, cell.col);
    if (!range) {
      const qrSize = 96;
      return {
        merged: false,
        range: null,
        qrSize,
        placement: {
          tl: { col: cell.col - 1, row: cell.row - 1 },
          ext: { width: qrSize, height: qrSize }
        }
      };
    }

    const padding = Number.isFinite(config.qrPadding) ? Math.max(0, config.qrPadding) : 4;
    const rangeSize = getRangePixelSize(worksheet, range.left, range.top, range.right, range.bottom);
    const qrSize = Math.max(40, Math.min(rangeSize.width, rangeSize.height) - padding * 2);
    const offsetX = Math.max(0, (rangeSize.width - qrSize) / 2);
    const offsetY = Math.max(0, (rangeSize.height - qrSize) / 2);

    return {
      merged: true,
      range,
      qrSize,
      placement: {
        tl: {
          col: range.left - 1,
          row: range.top - 1,
          nativeColOff: Math.floor(offsetX * 9525),
          nativeRowOff: Math.floor(offsetY * 9525)
        },
        ext: { width: qrSize, height: qrSize }
      }
    };
  };

  const getBarcodePlacement = (worksheet, cell, config) => {
    const range = findMergedRangeForCell(worksheet, cell.row, cell.col);
    if (!range) {
      return {
        merged: false,
        range: null,
        placement: {
          tl: { col: cell.col - 1, row: cell.row - 1 },
          ext: { width: 240, height: BARCODE_OPTIONS.height }
        }
      };
    }

    const padding = Number.isFinite(config.qrPadding) ? Math.max(0, config.qrPadding) : 4;
    const rangeSize = getRangePixelSize(worksheet, range.left, range.top, range.right, range.bottom);
    const width = Math.max(80, rangeSize.width - padding * 2);
    const height = Math.max(24, rangeSize.height - padding * 2);
    return {
      merged: true,
      range,
      placement: {
        tl: {
          col: range.left - 1,
          row: range.top - 1,
          nativeColOff: Math.floor(padding * 9525),
          nativeRowOff: Math.floor(padding * 9525)
        },
        ext: { width, height }
      }
    };
  };

  const replaceQrPlaceholdersInWorksheet = async (workbook, worksheet, context, config) => {
    const contextData = buildRecordData(context);
    console.log('[excel-template] QR worksheet context', {
      sheet: worksheet.name,
      recordId: contextData.recordId,
      seqNo: contextData.seqNo,
      seqTotal: contextData.seqTotal,
      splitKey: contextData.splitKey
    });

    const qrCells = [];
    const seen = new Set();
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        const qrMatch = getCellText(cell).match(QR_PLACEHOLDER_RE);
        if (!qrMatch) {
          return;
        }
        const tag = normalizeTagName(qrMatch[1]);
        const key = getCellAnchorKey(cell, tag);
        cell.value = '';
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        qrCells.push({ cell, tag });
      });
    });

    for (const item of qrCells) {
      const qrText = resolveTagValue(item.tag, context);
      console.log('[Excel Template] found QR placeholder', item.tag, qrText);
      if (!qrText) {
        console.warn('[excel-template-batch] QR text is empty:', item.tag, worksheet.name, item.cell.address);
        continue;
      }

      try {
        const base64 = await createQrBase64(qrText);
        if (!base64) {
          console.warn('[excel-template-batch] QR image base64 is empty:', item.tag, worksheet.name, item.cell.address);
          continue;
        }
        const placement = getQrPlacement(worksheet, item.cell, config);
        console.log('[excel-template] QR placement', {
          sheet: worksheet.name,
          tag: item.tag,
          row: item.cell.row,
          col: item.cell.col,
          merged: placement.merged,
          range: placement.range,
          qrSize: placement.qrSize
        });

        const imageId = workbook.addImage({
          base64,
          extension: 'png'
        });
        worksheet.addImage(imageId, placement.placement);
      } catch (err) {
        console.warn('[excel-template-batch] Failed to generate QR image:', err);
      }
    }
  };

  const replaceBarcodePlaceholdersInWorksheet = (workbook, worksheet, context, config) => {
    const barcodeCells = [];
    const seen = new Set();
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        const barcodeMatch = getCellText(cell).match(BARCODE_PLACEHOLDER_RE);
        if (!barcodeMatch) {
          return;
        }
        const tag = normalizeTagName(barcodeMatch[1]);
        const key = getCellAnchorKey(cell, tag);
        cell.value = '';
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        barcodeCells.push({ cell, tag });
      });
    });

    barcodeCells.forEach((item) => {
      const barcodeText = resolveTagValue(item.tag, context);
      console.log('[Excel Template] found barcode placeholder', item.tag, barcodeText);
      if (!barcodeText) {
        console.warn('[Excel Template] barcode value is empty', item.tag, worksheet.name, item.cell.address);
        return;
      }

      try {
        const base64 = createBarcodeBase64(barcodeText);
        if (!base64) {
          console.warn('[Excel Template] barcode image base64 is empty', item.tag, worksheet.name, item.cell.address);
          return;
        }
        const placement = getBarcodePlacement(worksheet, item.cell, config);
        const imageId = workbook.addImage({
          base64,
          extension: 'png'
        });
        worksheet.addImage(imageId, placement.placement);
        console.log('[Excel Template] barcode image inserted', item.tag);
      } catch (err) {
        console.warn('[Excel Template] Failed to generate barcode image:', err);
      }
    });
  };

  const fillReportDetailsInWorksheet = (worksheet, context, config) => {
    if (config.outputMode !== 'report' || !context.report) {
      return;
    }

    const startRow = normalizePositiveInt(config.reportDetailStartRow, 15);
    const rowsPerPage = normalizePositiveInt(config.reportRowsPerPage, 20);
    const mappings = Array.isArray(config.reportDetailRows) ? config.reportDetailRows : [];
    if (!mappings.length) {
      return;
    }

    for (let offset = 0; offset < rowsPerPage; offset += 1) {
      const detail = context.report.rows[offset];
      const row = worksheet.getRow(startRow + offset);
      row.hidden = config.reportHideEmptyRows && !detail;
      mappings.forEach((mapping) => {
        const column = String(mapping.column || '').trim().toUpperCase();
        const fieldCode = String(mapping.fieldCode || '').trim();
        if (!/^[A-Z]{1,3}$/.test(column) || !fieldCode) {
          return;
        }
        const cell = worksheet.getCell(`${column}${startRow + offset}`);
        cell.value = detail ? extractText(detail.value?.[fieldCode]) : '';
      });
    }
  };

  const addTemplateImagesWithExcelJs = async (xlsxBytes, contexts, templateBuffer) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(toArrayBuffer(xlsxBytes));

    const templateWorkbook = new ExcelJS.Workbook();
    await templateWorkbook.xlsx.load(toArrayBuffer(templateBuffer));
    const templateSheet = templateWorkbook.worksheets[0];

    const sheetContexts = new Map();
    workbook.worksheets.forEach((worksheet, index) => {
      if (contexts[index]) {
        sheetContexts.set(worksheet.id, contexts[index]);
      }
    });

    for (const worksheet of workbook.worksheets) {
      const context = sheetContexts.get(worksheet.id);
      if (context) {
        if (templateSheet) {
          copySheetLayout(templateSheet, worksheet, CONFIG);
        }
        fillReportDetailsInWorksheet(worksheet, context, CONFIG);
        replaceTextPlaceholdersInWorksheet(worksheet, context);
        if (CONFIG.enableQrImage) {
          await replaceQrPlaceholdersInWorksheet(workbook, worksheet, context, CONFIG);
        }
        replaceBarcodePlaceholdersInWorksheet(workbook, worksheet, context, CONFIG);
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Uint8Array(buffer);
  };

  const sanitizeFileName = (value) => {
    const base = (value || '').trim().replace(/[\\/:*?"<>|]+/g, '_');
    if (base) {
      return base;
    }
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `TicketLabels_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  };

  const downloadBytes = (bytes) => {
    const name = sanitizeFileName(CONFIG.outputFileName);
    const fileName = name.toLowerCase().endsWith('.xlsx') ? name : `${name}.xlsx`;
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.dispatchEvent(new MouseEvent('click'));
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const getRecordTitle = (record, index) => {
    const candidates = ['wiNumber', 'partNumber', 'ticketId', '$id'];
    for (const code of candidates) {
      const value = extractText(record[code]).trim();
      if (value) {
        return value;
      }
    }
    return `Record ${index + 1}`;
  };

  const shouldUpdatePrintStatus = () => {
    return CONFIG.enablePrintStatusUpdate && Boolean(CONFIG.printStatusFieldCode);
  };

  const getMaxSheetsPerWorkbook = () => {
    return Number.isFinite(CONFIG.maxSheetsPerWorkbook) && CONFIG.maxSheetsPerWorkbook > 0
      ? CONFIG.maxSheetsPerWorkbook
      : 100;
  };

  const chunkArray = (items, size) => {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  };

  const fetchFormFieldTypes = async () => {
    try {
      const app = kintone.app.getId();
      const resp = await kintone.api(kintone.api.url('/k/v1/app/form/fields', true), 'GET', { app });
      const properties = resp?.properties || {};
      return Object.keys(properties).reduce((types, code) => {
        types[code] = properties[code]?.type || '';
        return types;
      }, {});
    } catch (error) {
      console.warn('[Excel Template] failed to fetch form field types for print status update', error);
      return {};
    }
  };

  const getNextPrintStatusValue = (currentValue) => {
    if (currentValue === CONFIG.printedStatusValue || currentValue === CONFIG.reprintedStatusValue) {
      return CONFIG.reprintedStatusValue;
    }
    return CONFIG.printedStatusValue;
  };

  const buildPrintStatusUpdateRecords = (records, fieldTypes) => {
    const loginUser = kintone.getLoginUser();
    return records.map((record) => {
      const currentValue = record[CONFIG.printStatusFieldCode]?.value;
      const updateRecord = {
        [CONFIG.printStatusFieldCode]: {
          value: getNextPrintStatusValue(currentValue)
        }
      };

      if (CONFIG.printedAtFieldCode) {
        updateRecord[CONFIG.printedAtFieldCode] = {
          value: new Date().toISOString()
        };
      }

      if (CONFIG.printedByFieldCode) {
        updateRecord[CONFIG.printedByFieldCode] = fieldTypes[CONFIG.printedByFieldCode] === 'USER_SELECT'
          ? { value: [{ code: loginUser.code }] }
          : { value: loginUser.name || loginUser.code };
      }

      return {
        id: getRecordId(record),
        record: updateRecord
      };
    }).filter((item) => item.id);
  };

  const updatePrintStatusRecords = async (records) => {
    if (!shouldUpdatePrintStatus()) {
      return;
    }

    const fieldTypes = await fetchFormFieldTypes();
    const updateRecords = buildPrintStatusUpdateRecords(records, fieldTypes);
    if (!updateRecords.length) {
      return;
    }
    console.log('[Excel Template] print status target records', updateRecords);
    console.log('[Excel Template] print status update records', updateRecords);

    const app = kintone.app.getId();
    const chunks = chunkArray(updateRecords, 100);
    for (const chunk of chunks) {
      await kintone.api(kintone.api.url('/k/v1/records', true), 'PUT', {
        app,
        records: chunk
      });
    }
  };

  const addFieldCode = (set, value) => {
    const code = String(value || '').trim();
    if (code) {
      set.add(code);
    }
  };

  const getRequiredRecordFields = () => {
    const fields = new Set(['$id', 'ticketNumber', 'wiNumber', 'partNumber', 'ticketId']);

    if (CONFIG.templateSource === 'recordFile') {
      addFieldCode(fields, CONFIG.templateFileField);
    }
    if (CONFIG.outputMode === 'label') {
      addFieldCode(fields, CONFIG.quantityField);
      addFieldCode(fields, CONFIG.packQtyField);
    }
    if (CONFIG.outputMode === 'report') {
      addFieldCode(fields, CONFIG.reportDetailTableField);
    }
    if (CONFIG.enablePrintStatusUpdate) {
      addFieldCode(fields, CONFIG.printStatusFieldCode);
      addFieldCode(fields, CONFIG.printedAtFieldCode);
      addFieldCode(fields, CONFIG.printedByFieldCode);
    }

    CONFIG.mappingRows.forEach((row) => {
      if (row?.sourceType === 'field') {
        addFieldCode(fields, row.fieldCode);
      }
    });
    Object.values(CONFIG.mapping).forEach((fieldCode) => addFieldCode(fields, fieldCode));

    return Array.from(fields);
  };

  const fetchFullRecordsByIds = async (records) => {
    const ids = records.map((record) => getRecordId(record)).filter(Boolean);
    if (!ids.length) {
      return records;
    }

    const app = kintone.app.getId();
    const chunks = chunkArray(ids, 100);
    const fullRecords = [];
    for (const chunk of chunks) {
      const numericIds = chunk.map((id) => Number(id)).filter(Number.isFinite);
      if (!numericIds.length) {
        continue;
      }
      const query = `$id in (${numericIds.join(',')})`;
      const resp = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
        app,
        query,
        fields: getRequiredRecordFields()
      });
      fullRecords.push(...(resp.records || []));
    }

    const byId = new Map(fullRecords.map((record) => [getRecordId(record), record]));
    return records.map((record) => byId.get(getRecordId(record)) || record);
  };

  const getGenerateErrorMessage = (err) => {
    return err.message === 'template missing'
      ? STRINGS.templateMissing
      : err.message === 'unsupported zip'
        ? STRINGS.unsupportedZip
        : err.message === 'template fetch failed'
          ? STRINGS.templateFetchFailed
          : err.message === 'split config missing'
            ? (STRINGS.splitConfigMissing || err.message)
            : err.message.startsWith('split invalid qty:')
              ? `${STRINGS.splitInvalidQty || 'Invalid Quantity Split value.'} ${err.message.replace('split invalid qty:', '').trim()}`
              : err.message === 'template app required'
                ? (STRINGS.templateAppRequired || err.message)
                : err.message === 'template app not found'
                  ? (STRINGS.templateAppNotFound || err.message)
                  : err.message === 'template app file missing'
                    ? (STRINGS.templateAppFileMissing || err.message)
                    : STRINGS.generateFailed;
  };

  const generateFromRecords = async (records, { refetch = true } = {}) => {
    const sourceRecords = refetch ? await fetchFullRecordsByIds(records) : records;
    console.log('[Excel Template] output records', sourceRecords);
    const contexts = sourceRecords.flatMap((record) => buildOutputContexts(record, CONFIG));
    console.log('[Excel Template] output sheet count', contexts.length);
    if (contexts.length > getMaxSheetsPerWorkbook()) {
      throw new Error('max sheets exceeded');
    }

    const templateBuffer = await fetchTemplateArrayBuffer(CONFIG, sourceRecords);
    const generatedBytes = await generateWorkbook(templateBuffer, contexts);
    const workbookBytes = await addTemplateImagesWithExcelJs(generatedBytes, contexts, templateBuffer);
    console.log('[Excel Template] workbook ready');
    downloadBytes(workbookBytes);
    showToast(`${STRINGS.generated}\nSheets: ${contexts.length}`);

    try {
      await updatePrintStatusRecords(sourceRecords);
      if (shouldUpdatePrintStatus()) {
        showToast(`${STRINGS.printStatusUpdated}\n件数: ${sourceRecords.length}`);
      }
    } catch (error) {
      console.warn('[Excel Template] print status update failed', error);
      showToast(STRINGS.printStatusUpdateFailed || 'xlsxは生成されましたが、印刷ステータスの更新に失敗しました。', 'warn');
    }

    return { records: sourceRecords, contexts };
  };

  const buildModal = (records) => {
    if (document.querySelector('.kb-root.kb-backdrop[data-kb-plugin="excel-template-batch"]')) {
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'kb-root kb-backdrop';
    backdrop.setAttribute('data-kb-plugin', 'excel-template-batch');

    const modal = document.createElement('div');
    modal.className = 'kb-root kb-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', STRINGS.modalTitle);

    const card = document.createElement('div');
    card.className = 'kb-modal-card';

    const header = document.createElement('div');
    header.className = 'kb-modal-header';
    const title = document.createElement('div');
    title.className = 'kb-modal-title';
    title.textContent = STRINGS.modalTitle;
    const desc = document.createElement('div');
    desc.className = 'kb-modal-description';
    desc.textContent = STRINGS.modalDescription;
    header.append(title, desc);

    const list = document.createElement('ul');
    list.className = 'kb-record-list';

    const resultCount = document.createElement('div');
    resultCount.className = 'kb-result-count';

    const footer = document.createElement('div');
    footer.className = 'kb-modal-footer';
    const leftActions = document.createElement('div');
    leftActions.className = 'kb-footer-actions';
    const rightActions = document.createElement('div');
    rightActions.className = 'kb-footer-actions';

    const selectAllBtn = document.createElement('button');
    selectAllBtn.type = 'button';
    selectAllBtn.className = 'kb-btn';
    selectAllBtn.textContent = STRINGS.modalSelectAll;

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'kb-btn';
    clearBtn.textContent = STRINGS.modalClear;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'kb-btn';
    closeBtn.textContent = STRINGS.modalClose;

    const generateBtn = document.createElement('button');
    generateBtn.type = 'button';
    generateBtn.className = 'kb-btn kb-primary';
    generateBtn.textContent = STRINGS.modalGenerate;

    leftActions.append(selectAllBtn, clearBtn);
    rightActions.append(closeBtn, generateBtn);
    footer.append(leftActions, rightActions);
    card.append(header, resultCount, list, footer);
    modal.appendChild(card);

    const removeModal = () => {
      modal.remove();
      backdrop.remove();
      window.removeEventListener('keydown', handleKeydown);
    };

    const updateState = () => {
      const checked = list.querySelectorAll('input[type="checkbox"]:checked').length;
      resultCount.textContent = lang === 'ja'
        ? `${checked} / ${records.length} 件を選択中`
        : `${checked} / ${records.length} selected`;
      generateBtn.disabled = checked === 0;
    };

    const rows = records.map((record, index) => {
      const li = document.createElement('li');
      li.className = 'kb-record-item is-selected';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'kb-record-check';
      checkbox.value = String(index);
      checkbox.checked = true;

      const text = document.createElement('div');
      text.className = 'kb-record-text';
      const recordTitle = document.createElement('div');
      recordTitle.className = 'kb-record-title';
      recordTitle.textContent = getRecordTitle(record, index);
      const sub = document.createElement('div');
      sub.className = 'kb-record-sub';
      sub.textContent = `ID: ${extractText(record.$id) || '-'}`;
      text.append(recordTitle, sub);

      const sync = () => {
        li.classList.toggle('is-selected', checkbox.checked);
        updateState();
      };
      li.addEventListener('click', (event) => {
        if (event.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
        }
        sync();
      });
      checkbox.addEventListener('change', sync);
      li.append(checkbox, text);
      list.appendChild(li);
      return { li, checkbox };
    });

    const setAll = (checked) => {
      rows.forEach((row) => {
        row.checkbox.checked = checked;
        row.li.classList.toggle('is-selected', checked);
      });
      updateState();
    };

    const generate = async () => {
      const selected = Array.from(list.querySelectorAll('input[type="checkbox"]:checked'))
        .map((input) => records[Number(input.value)])
        .filter(Boolean);
      if (!selected.length) {
        showToast(STRINGS.modalNoSelection, 'warn');
        return;
      }

      generateBtn.disabled = true;
      showToast(STRINGS.generating);
      try {
        console.log('[Excel Template] selected records', selected);
        await generateFromRecords(selected, { refetch: true });
        removeModal();
      } catch (err) {
        console.error(err);
        showToast(err.message === 'max sheets exceeded' ? STRINGS.maxSheetsExceeded : getGenerateErrorMessage(err), 'warn');
        generateBtn.disabled = false;
        updateState();
      }
    };

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        removeModal();
      }
    };

    selectAllBtn.addEventListener('click', () => setAll(true));
    clearBtn.addEventListener('click', () => setAll(false));
    closeBtn.addEventListener('click', removeModal);
    generateBtn.addEventListener('click', generate);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        removeModal();
      }
    });
    window.addEventListener('keydown', handleKeydown);

    document.body.append(backdrop, modal);
    updateState();
  };

  kintone.events.on('app.record.index.show', (event) => {
    const host = kintone.app?.getHeaderMenuSpaceElement?.();
    const records = Array.isArray(event.records) ? event.records : [];

    if (!isPluginConfigured()) {
      removeHeaderButton(host);
      console.warn('[excel-template-batch] Plugin is not configured.');
      return event;
    }

    if (!records.length) {
      removeHeaderButton(host);
      return event;
    }

    if (hasViewLimit && !VIEW_ID_SET.has(getViewKey(event))) {
      removeHeaderButton(host);
      return event;
    }

    const button = findOrCreateHeaderButton(host);
    if (button) {
      button.onclick = () => buildModal(records);
    }
    return event;
  });

  kintone.events.on('app.record.detail.show', (event) => {
    const host = kintone.app.record?.getHeaderMenuSpaceElement?.();

    if (!isPluginConfigured()) {
      removeHeaderButton(host);
      console.warn('[excel-template-batch] Plugin is not configured.');
      return event;
    }

    const button = findOrCreateHeaderButton(host);
    if (button) {
      button.onclick = async () => {
        button.disabled = true;
        showToast(STRINGS.generating);
        try {
          await generateFromRecords([event.record], { refetch: false });
        } catch (err) {
          console.error(err);
          showToast(err.message === 'max sheets exceeded' ? STRINGS.maxSheetsExceeded : getGenerateErrorMessage(err), 'warn');
        } finally {
          button.disabled = false;
        }
      };
    }
    return event;
  });
})();
