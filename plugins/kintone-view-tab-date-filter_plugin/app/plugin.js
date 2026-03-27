(function(PLUGIN_ID) {
  'use strict';

  const EVENT_NAME = 'app.record.index.show';
  const ROOT_ID = 'kvtdf-root-' + PLUGIN_ID;
  const TOAST_ID = ROOT_ID + '-toast';
  const PRIMARY_QUERY_PARAM = 'query';
  const SECONDARY_QUERY_PARAM = 'q';
  const INTERNAL_FIELD_ID_RE = /(^|[\s(])f\d+\b/i;
  const LEGACY_STATE_PARAMS = [
    'kvtdf_field',
    'kvtdf_start',
    'kvtdf_end',
    'kvtdf_custom_cond',
    'kvtdf_custom_tail',
    'kvtdf_query_view'
  ];
  const AGGREGATE_OPERATIONS = new Set(['sum', 'avg', 'min', 'max', 'cnt', 'none']);

  const PRESETS = [
    { value: 'all', en: 'All', ja: '\u5168\u671f\u9593' },
    { value: 'today', en: 'Today', ja: '\u4eca\u65e5' },
    { value: 'yesterday', en: 'Yesterday', ja: '\u6628\u65e5' },
    { value: 'last-7', en: 'Last 7 days', ja: '\u76f4\u8fd17\u65e5' },
    { value: 'last-30', en: 'Last 30 days', ja: '\u76f4\u8fd130\u65e5' },
    { value: 'this-week', en: 'This week', ja: '\u4eca\u9031' },
    { value: 'last-week', en: 'Last week', ja: '\u5148\u9031' },
    { value: 'this-month', en: 'This month', ja: '\u4eca\u6708' },
    { value: 'last-month', en: 'Last month', ja: '\u5148\u6708' },
    { value: 'this-quarter', en: 'This quarter', ja: '\u4eca\u56db\u534a\u671f' },
    { value: 'last-quarter', en: 'Last quarter', ja: '\u524d\u56db\u534a\u671f' },
    { value: 'this-half', en: 'This half', ja: '\u4eca\u534a\u671f' },
    { value: 'last-half', en: 'Last half', ja: '\u524d\u534a\u671f' },
    { value: 'this-year', en: 'This year', ja: '\u4eca\u5e74' },
    { value: 'last-year', en: 'Last year', ja: '\u6628\u5e74' }
  ];

  const TEXT = {
    ja: {
      other: '\u305d\u306e\u4ed6',
      date: '\u65e5\u4ed8',
      dateFilter: '\u65e5\u4ed8\u30d5\u30a3\u30eb\u30bf\u30fc',
      aggregate: '\u96c6\u8a08',
      lastRange: '\u524d\u56de',
      quickPresets: '\u30af\u30a4\u30c3\u30af\u30d7\u30ea\u30bb\u30c3\u30c8',
      dateRange: '\u671f\u9593',
      rangeSlider: '\u671f\u9593\u7bc4\u56f2',
      startDate: '\u958b\u59cb\u65e5',
      endDate: '\u7d42\u4e86\u65e5',
      to: '\u301c',
      clear: '\u30af\u30ea\u30a2',
      cancel: '\u30ad\u30e3\u30f3\u30bb\u30eb',
      apply: '\u9069\u7528',
      noDateField: '\u5bfe\u8c61\u65e5\u4ed8\u30d5\u30a3\u30fc\u30eb\u30c9\u672a\u8a2d\u5b9a',
      rangeHint: '\u5bfe\u8c61\u7bc4\u56f2',
      close: '\u9589\u3058\u308b',
      rangeLoadFailed: '\u5bfe\u8c61\u7bc4\u56f2\u3092\u53d6\u5f97\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u30d5\u30a9\u30fc\u30eb\u30d0\u30c3\u30af\u7bc4\u56f2\u3092\u8868\u793a\u3057\u307e\u3059\u3002'
      ,
      aggregateLoadFailed: '\u96c6\u8a08\u5024\u3092\u53d6\u5f97\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002',
      aggregate_sum: '\u5408\u8a08',
      aggregate_avg: '\u5e73\u5747',
      aggregate_min: '\u6700\u5c0f',
      aggregate_max: '\u6700\u5927',
      aggregate_cnt: '\u4ef6\u6570'
    },
    en: {
      other: 'Other',
      date: 'Date',
      dateFilter: 'Date filter',
      aggregate: 'Aggregate',
      lastRange: 'Last',
      quickPresets: 'Quick presets',
      dateRange: 'Date range',
      rangeSlider: 'Range slider',
      startDate: 'Start date',
      endDate: 'End date',
      to: 'to',
      clear: 'Clear',
      cancel: 'Cancel',
      apply: 'Apply',
      noDateField: 'No date field configured',
      rangeHint: 'Available range',
      close: 'Close',
      rangeLoadFailed: 'Could not load the full range. Showing a fallback range.',
      aggregateLoadFailed: 'Could not load aggregate values.',
      aggregate_sum: 'Sum',
      aggregate_avg: 'Average',
      aggregate_min: 'Minimum',
      aggregate_max: 'Maximum',
      aggregate_cnt: 'Count'
    }
  };

  const ICONS = {
    LIST: [
      ['rect', { x: '0', y: '16', width: '96', height: '96' }],
      ['rect', { x: '160', y: '16', width: '352', height: '96' }],
      ['rect', { x: '0', y: '208', width: '96', height: '96' }],
      ['rect', { x: '160', y: '208', width: '352', height: '96' }],
      ['rect', { x: '0', y: '400', width: '96', height: '96' }],
      ['rect', { x: '160', y: '400', width: '352', height: '96' }]
    ],
    CALENDAR: [
      ['path', { d: 'M118.611,89.297c9.483,0,17.177-7.686,17.177-17.169v-54.96C135.788,7.686,128.094,0,118.611,0c-9.482,0-17.176,7.686-17.176,17.169v54.96C101.435,81.611,109.129,89.297,118.611,89.297z' }],
      ['path', { d: 'M255.992,89.297c9.482,0,17.176-7.686,17.176-17.169v-54.96C273.168,7.686,265.474,0,255.992,0c-9.482,0-17.176,7.686-17.176,17.169v54.96C238.816,81.611,246.51,89.297,255.992,89.297z' }],
      ['path', { d: 'M393.373,89.297c9.482,0,17.176-7.686,17.176-17.169v-54.96C410.549,7.686,402.855,0,393.373,0c-9.483,0-17.177,7.686-17.177,17.169v54.96C376.196,81.611,383.89,89.297,393.373,89.297z' }],
      ['path', { d: 'M427,44.899h-2.713v27.229c0,17.038-13.862,30.906-30.914,30.906c-17.038,0-30.914-13.869-30.914-30.906V44.899h-75.552v27.229c0,17.038-13.877,30.906-30.915,30.906c-17.038,0-30.914-13.869-30.914-30.906V44.899h-75.552v27.229c0,17.038-13.877,30.906-30.914,30.906S87.697,89.166,87.697,72.128V44.899h-2.698c-37.082,0-67.133,30.058-67.133,67.133v332.835c0,37.074,30.05,67.133,67.133,67.133H427c37.067,0,67.134-30.058,67.134-67.133V112.032C494.134,74.958,464.067,44.899,427,44.899z M450.853,439.771c0,15.974-12.998,28.964-28.956,28.964H90.103c-15.974,0-28.972-12.99-28.972-28.964V190.482h389.723V439.771z' }]
    ],
    CUSTOM: [
      ['path', { d: 'M502.325,307.303l-39.006-30.805c-6.215-4.908-9.665-12.429-9.668-20.348c0-0.084,0-0.168,0-0.252c-0.014-7.936,3.44-15.478,9.667-20.396l39.007-30.806c8.933-7.055,12.093-19.185,7.737-29.701l-17.134-41.366c-4.356-10.516-15.167-16.86-26.472-15.532l-49.366,5.8c-7.881,0.926-15.656-1.966-21.258-7.586c-0.059-0.06-0.118-0.119-0.177-0.178c-5.597-5.602-8.476-13.36-7.552-21.225l5.799-49.363c1.328-11.305-5.015-22.116-15.531-26.472L337.004,1.939c-10.516-4.356-22.646-1.196-29.701,7.736l-30.805,39.005c-4.908,6.215-12.43,9.665-20.349,9.668c-0.084,0-0.168,0-0.252,0c-7.935,0.014-15.477-3.44-20.395-9.667L204.697,9.675c-7.055-8.933-19.185-12.092-29.702-7.736L133.63,19.072c-10.516,4.356-16.86,15.167-15.532,26.473l5.799,49.366c0.926,7.881-1.964,15.656-7.585,21.257c-0.059,0.059-0.118,0.118-0.178,0.178c-5.602,5.598-13.36,8.477-21.226,7.552l-49.363-5.799c-11.305-1.328-22.116,5.015-26.472,15.531L1.939,174.996c-4.356,10.516-1.196,22.646,7.736,29.701l39.006,30.805c6.215,4.908,9.665,12.429,9.668,20.348c0,0.084,0,0.167,0,0.251c0.014,7.935-3.44,15.477-9.667,20.395L9.675,307.303c-8.933,7.055-12.092,19.185-7.736,29.701l17.134,41.365c4.356,10.516,15.168,16.86,26.472,15.532l49.366-5.799c7.882-0.926,15.656,1.965,21.258,7.586c0.059,0.059,0.118,0.119,0.178,0.178c5.597,5.603,8.476,13.36,7.552,21.226l-5.799,49.364c-1.328,11.305,5.015,22.116,15.532,26.472l41.366,17.134c10.516,4.356,22.646,1.196,29.701-7.736l30.804-39.005c4.908-6.215,12.43-9.665,20.348-9.669c0.084,0,0.168,0,0.251,0c7.936-0.014,15.478,3.44,20.396,9.667l30.806,39.007c7.055,8.933,19.185,12.093,29.701,7.736l41.366-17.134c10.516-4.356,16.86-15.168,15.532-26.472l-5.8-49.366c-0.926-7.881,1.965-15.656,7.586-21.257c0.059-0.059,0.119-0.119,0.178-0.178c5.602-5.597,13.36-8.476,21.225-7.552l49.364,5.799c11.305,1.328,22.117-5.015,26.472-15.531l17.134-41.365C514.418,326.488,511.258,314.358,502.325,307.303z M281.292,329.698c-39.68,16.436-85.172-2.407-101.607-42.087c-16.436-39.68,2.407-85.171,42.087-101.608c39.68-16.436,85.172,2.407,101.608,42.088C339.815,267.771,320.972,313.262,281.292,329.698z' }]
    ],
    CHART: [
      ['path', { d: 'M32 448h448v32H0V32h32v416z' }],
      ['rect', { x: '96', y: '256', width: '64', height: '160' }],
      ['rect', { x: '224', y: '160', width: '64', height: '256' }],
      ['rect', { x: '352', y: '96', width: '64', height: '320' }]
    ]
  };

  let renderTicket = 0;
  let viewsPromise = null;
  let fieldInfoPromise = null;
  const edgeDatePromiseMap = new Map();

  function normalizeLanguage(value) {
    const lang = String(value || '').toLowerCase();
    if (lang.indexOf('ja') === 0) {
      return 'ja';
    }
    if (lang.indexOf('en') === 0) {
      return 'en';
    }
    return '';
  }

  function getLanguage() {
    const cybozuRef = typeof cybozu !== 'undefined' ? cybozu : null;
    const loginUser = (typeof kintone !== 'undefined' && kintone.getLoginUser) ? kintone.getLoginUser() : null;
    const candidates = [
      document.documentElement && document.documentElement.getAttribute('lang'),
      cybozuRef && cybozuRef.data && cybozuRef.data.LOCALE,
      cybozuRef && cybozuRef.data && cybozuRef.data.LOGIN_USER && cybozuRef.data.LOGIN_USER.language,
      loginUser && loginUser.language,
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
    return (TEXT[lang] && TEXT[lang][key]) || TEXT.en[key] || key;
  }

  function presetLabel(value) {
    const preset = PRESETS.find(function(item) {
      return item.value === value;
    });
    if (!preset) {
      return value;
    }
    return getLanguage() === 'en' ? preset.en : preset.ja;
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function normalizeYmd(value) {
    if (!value) {
      return '';
    }
    const text = String(value).trim().replace(/[./]/g, '-');
    const matched = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!matched) {
      return '';
    }
    const year = matched[1];
    const month = pad2(Number(matched[2]) || 0);
    const day = pad2(Number(matched[3]) || 0);
    if (month === '00' || day === '00') {
      return '';
    }
    return year + '-' + month + '-' + day;
  }

  function extractYmdFromFieldValue(value) {
    const matched = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
    if (matched) {
      return matched[1];
    }
    return normalizeYmd(value);
  }

  function parseYmd(value) {
    const normalized = normalizeYmd(value);
    if (!normalized) {
      return new Date(NaN);
    }
    const parts = normalized.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function formatYmd(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function addDays(date, amount) {
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + amount);
    return next;
  }

  function daysBetween(start, end) {
    return Math.round((parseYmd(end) - parseYmd(start)) / 86400000);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function uniqueStringList(list) {
    return Array.from(new Set((list || []).map(function(item) {
      return String(item).trim();
    }).filter(Boolean)));
  }

  function parseArrayConfig(raw, fallback) {
    if (!raw) {
      return fallback.slice();
    }
    if (Array.isArray(raw)) {
      return uniqueStringList(raw);
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return uniqueStringList(parsed);
      }
    } catch {
      // noop
    }
    return uniqueStringList(String(raw).split(','));
  }

  function parseAggregateRules(raw) {
    let rules = [];
    if (!raw) {
      return [];
    }
    try {
      rules = JSON.parse(raw);
    } catch {
      rules = [];
    }
    if (!Array.isArray(rules)) {
      return [];
    }
    return rules.map(function(rule) {
      const op = AGGREGATE_OPERATIONS.has(String(rule && rule.op || '').trim()) ? String(rule.op).trim() : 'sum';
      return {
        field: String(rule && rule.field || '').trim(),
        label: String(rule && (rule.label || rule.field) || '').trim(),
        op: op,
        digits: clamp(Number(rule && rule.digits || 0) || 0, 0, 6),
        prefix: String(rule && rule.prefix || '').trim(),
        suffix: String(rule && rule.suffix || '').trim()
      };
    }).filter(function(rule) {
      return !!rule.field;
    });
  }

  function loadConfig() {
    const raw = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
    return {
      enableViewTabs: raw.enableViewTabs === 'false' ? false : true,
      enableDateFilter: raw.enableDateFilter === 'false' ? false : true,
      enableAggregates: raw.enableAggregates === 'true',
      visibleViewIds: parseArrayConfig(raw.visibleViewIds, []),
      orderViewIds: parseArrayConfig(raw.orderViewIds, []),
      maxInline: clamp(Number(raw.maxInline) || 6, 0, 20),
      showIcons: raw.showIcons === 'false' ? false : true,
      dateField: raw.dateField || raw.dateFieldCode || '',
      weekStart: Number(raw.weekStart || 0) === 1 ? 1 : 0,
      defaultPreset: String(raw.defaultPreset || 'last-30'),
      presets: parseArrayConfig(raw.presets, PRESETS.map(function(item) { return item.value; })),
      targetViews: parseArrayConfig(raw.targetViews, []),
      aggregateTargetViews: parseArrayConfig(raw.aggregateTargetViews, []),
      aggregateRules: parseAggregateRules(raw.aggregateRules || raw.rules || '[]')
    };
  }

  function getHeaderSpace() {
    try {
      return kintone.app.getHeaderMenuSpaceElement();
    } catch {
      return null;
    }
  }

  function getCurrentUrl() {
    return new window.URL(location.href);
  }

  function getQueryFromUrl(url) {
    return String(
      url.searchParams.get(PRIMARY_QUERY_PARAM) ||
      url.searchParams.get(SECONDARY_QUERY_PARAM) ||
      ''
    ).trim();
  }

  function getCurrentQuery() {
    return getQueryFromUrl(getCurrentUrl());
  }

  function setQueryOnUrl(url, query) {
    const rawQuery = String(query || '').trim();
    const nextQuery = containsInternalFieldId(rawQuery) ? '' : rawQuery;
    console.debug('[kintone-view-tab-date-filter] outgoing query', nextQuery || '(empty)');
    if (nextQuery) {
      url.searchParams.set(PRIMARY_QUERY_PARAM, nextQuery);
    } else {
      url.searchParams.delete(PRIMARY_QUERY_PARAM);
    }
    url.searchParams.delete(SECONDARY_QUERY_PARAM);
    return nextQuery;
  }

  function clearLegacyStateParams(url) {
    LEGACY_STATE_PARAMS.forEach(function(param) {
      url.searchParams.delete(param);
    });
  }

  function composeViewQuery(view, clause) {
    const parts = [];
    const filterCond = normalizeQueryText(view && view.filterCond);
    const dateClause = normalizeQueryText(clause);
    if (filterCond) {
      parts.push('(' + filterCond + ')');
    }
    if (dateClause) {
      parts.push(dateClause);
    }
    const nextQuery = parts.join(' and ');
    return containsInternalFieldId(nextQuery) ? '' : nextQuery;
  }

  function normalizeUrlForList() {
    const url = getCurrentUrl();
    const before = url.toString();
    const effectiveQuery = getQueryFromUrl(url);
    setQueryOnUrl(url, effectiveQuery);
    clearLegacyStateParams(url);
    if (url.toString() !== before) {
      history.replaceState(history.state, document.title, url.toString());
      return true;
    }
    return false;
  }

  function buildDateClause(field, start, end) {
    if (!field || !start || !end) {
      return '';
    }
    return String(field) + ' >= "' + start + '" and ' + String(field) + ' <= "' + end + '"';
  }

  function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function splitQuery(query) {
    const text = String(query || '').trim();
    if (!text) {
      return { condition: '', tail: '' };
    }
    const tailIndex = text.search(/\s+(?:order\s+by|limit|offset)\s+/i);
    if (tailIndex < 0) {
      return { condition: text, tail: '' };
    }
    return {
      condition: text.slice(0, tailIndex).trim(),
      tail: text.slice(tailIndex).trim()
    };
  }

  function normalizeQueryText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeCustomQuery(customQuery) {
    return {
      condition: normalizeQueryText(customQuery && customQuery.condition),
      tail: normalizeQueryText(customQuery && customQuery.tail)
    };
  }

  function containsInternalFieldId(text) {
    return INTERNAL_FIELD_ID_RE.test(String(text || ''));
  }

  function isWrappedByOuterParens(text) {
    const source = String(text || '').trim();
    if (source.length < 2 || source[0] !== '(' || source[source.length - 1] !== ')') {
      return false;
    }

    let depth = 0;
    let quote = '';
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (char === quote && source[index - 1] !== '\\') {
          quote = '';
        }
        continue;
      }
      if (char === '"' || char === '\'') {
        quote = char;
        continue;
      }
      if (char === '(') {
        depth += 1;
        continue;
      }
      if (char === ')') {
        depth -= 1;
        if (depth === 0 && index < source.length - 1) {
          return false;
        }
      }
    }

    return depth === 0;
  }

  function unwrapOuterParens(text) {
    let next = String(text || '').trim();
    while (isWrappedByOuterParens(next)) {
      next = next.slice(1, -1).trim();
    }
    return next;
  }

  function splitTopLevelAnd(condition) {
    const text = String(condition || '').trim();
    if (!text) {
      return [];
    }

    const parts = [];
    let start = 0;
    let depth = 0;
    let quote = '';

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quote) {
        if (char === quote && text[index - 1] !== '\\') {
          quote = '';
        }
        continue;
      }
      if (char === '"' || char === '\'') {
        quote = char;
        continue;
      }
      if (char === '(') {
        depth += 1;
        continue;
      }
      if (char === ')') {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (depth === 0 && text.slice(index, index + 3).toLowerCase() === 'and') {
        const prev = index === 0 ? ' ' : text[index - 1];
        const next = index + 3 >= text.length ? ' ' : text[index + 3];
        if (/\s/.test(prev) && /\s/.test(next)) {
          const term = text.slice(start, index).trim();
          if (term) {
            parts.push(term);
          }
          start = index + 3;
          index = start - 1;
        }
      }
    }

    const last = text.slice(start).trim();
    if (last) {
      parts.push(last);
    }
    return parts;
  }

  function removeTopLevelClause(parts, clause) {
    const normalizedClause = unwrapOuterParens(clause);
    if (!normalizedClause) {
      return parts.slice();
    }

    return parts.filter(function(part) {
      return unwrapOuterParens(part) !== normalizedClause;
    });
  }

  function parseRangeFromQuery(query, field) {
    if (!query || !field) {
      return null;
    }
    const condition = splitQuery(query).condition;
    const escapedField = escapeRegExp(field);
    let match = condition.match(new RegExp(escapedField + '\\s*>=\\s*"(\\d{4}-\\d{2}-\\d{2})"\\s*and\\s*' + escapedField + '\\s*<=\\s*"(\\d{4}-\\d{2}-\\d{2})"', 'i'));
    if (match) {
      return { start: match[1], end: match[2] };
    }
    match = condition.match(new RegExp(escapedField + '\\s*<=\\s*"(\\d{4}-\\d{2}-\\d{2})"\\s*and\\s*' + escapedField + '\\s*>=\\s*"(\\d{4}-\\d{2}-\\d{2})"', 'i'));
    if (match) {
      return { start: match[2], end: match[1] };
    }
    return null;
  }

  function startOfWeek(date, weekStart) {
    const point = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const weekday = point.getDay();
    const diff = (weekday - weekStart + 7) % 7;
    return addDays(point, -diff);
  }

  function endOfWeek(date, weekStart) {
    return addDays(startOfWeek(date, weekStart), 6);
  }

  function rangeForPreset(key, minYmd, maxYmd, weekStart) {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    switch (key) {
      case 'all':
        return { start: normalizeYmd(minYmd), end: normalizeYmd(maxYmd) };
      case 'today':
        return { start: formatYmd(today), end: formatYmd(today) };
      case 'yesterday': {
        const date = addDays(today, -1);
        return { start: formatYmd(date), end: formatYmd(date) };
      }
      case 'last-7':
        return { start: formatYmd(addDays(today, -6)), end: formatYmd(today) };
      case 'last-30':
        return { start: formatYmd(addDays(today, -29)), end: formatYmd(today) };
      case 'this-week': {
        const start = startOfWeek(today, weekStart);
        return { start: formatYmd(start), end: formatYmd(endOfWeek(today, weekStart)) };
      }
      case 'last-week': {
        const start = addDays(startOfWeek(today, weekStart), -7);
        return { start: formatYmd(start), end: formatYmd(addDays(start, 6)) };
      }
      case 'this-month':
        return { start: formatYmd(new Date(year, month, 1)), end: formatYmd(new Date(year, month + 1, 0)) };
      case 'last-month': {
        const start = new Date(year, month - 1, 1);
        return { start: formatYmd(start), end: formatYmd(new Date(start.getFullYear(), start.getMonth() + 1, 0)) };
      }
      case 'this-quarter': {
        const quarterStart = Math.floor(month / 3) * 3;
        return { start: formatYmd(new Date(year, quarterStart, 1)), end: formatYmd(new Date(year, quarterStart + 3, 0)) };
      }
      case 'last-quarter': {
        const quarterStart = Math.floor((month - 3) / 3) * 3;
        const start = new Date(year, quarterStart, 1);
        return { start: formatYmd(start), end: formatYmd(new Date(start.getFullYear(), start.getMonth() + 3, 0)) };
      }
      case 'this-half': {
        const startMonth = month < 6 ? 0 : 6;
        return { start: formatYmd(new Date(year, startMonth, 1)), end: formatYmd(new Date(year, startMonth + 6, 0)) };
      }
      case 'last-half': {
        const startYear = month < 6 ? year - 1 : year;
        const startMonth = month < 6 ? 6 : 0;
        return { start: formatYmd(new Date(startYear, startMonth, 1)), end: formatYmd(new Date(startYear, startMonth + 6, 0)) };
      }
      case 'this-year':
        return { start: year + '-01-01', end: year + '-12-31' };
      case 'last-year': {
        const targetYear = year - 1;
        return { start: targetYear + '-01-01', end: targetYear + '-12-31' };
      }
      default:
        return { start: '', end: '' };
    }
  }

  function shouldShowDateFilter(config, viewId) {
    if (!config.targetViews.length) {
      return true;
    }
    if (viewId === null || viewId === undefined) {
      return false;
    }
    return config.targetViews.indexOf(String(viewId)) >= 0;
  }

  function shouldShowAggregates(config, viewId) {
    if (!config.aggregateTargetViews.length) {
      return true;
    }
    if (viewId === null || viewId === undefined) {
      return false;
    }
    return config.aggregateTargetViews.indexOf(String(viewId)) >= 0;
  }

  function createSvgIcon(type) {
    const nodes = ICONS[String(type || 'LIST').toUpperCase()] || ICONS.LIST;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'kvtdf-icon');
    svg.setAttribute('viewBox', '0 0 512 512');
    svg.setAttribute('aria-hidden', 'true');
    nodes.forEach(function(item) {
      const element = document.createElementNS('http://www.w3.org/2000/svg', item[0]);
      Object.keys(item[1]).forEach(function(key) {
        element.setAttribute(key, item[1][key]);
      });
      element.setAttribute('fill', 'currentColor');
      svg.appendChild(element);
    });
    return svg;
  }

  async function fetchViews() {
    if (!viewsPromise) {
      viewsPromise = kintone.api(kintone.api.url('/k/v1/app/views', true), 'GET', {
        app: kintone.app.getId()
      }).then(function(response) {
        return Object.values(response.views || {}).map(function(view) {
          return {
            id: String(view.id),
            name: String(view.name || ''),
            type: String(view.type || 'LIST'),
            index: Number(view.index || 0),
            filterCond: String(view.filterCond || '')
          };
        });
      });
    }
    return viewsPromise;
  }

  function sortAndFilterViews(views, config) {
    let filtered = views.slice();
    if (config.visibleViewIds.length) {
      const visible = new Set(config.visibleViewIds.map(String));
      filtered = filtered.filter(function(view) {
        return visible.has(String(view.id));
      });
    }
    if (config.orderViewIds.length) {
      const orderIndex = new Map(config.orderViewIds.map(function(id, index) {
        return [String(id), index];
      }));
      filtered.sort(function(left, right) {
        const leftOrder = orderIndex.has(String(left.id)) ? orderIndex.get(String(left.id)) : 1e9;
        const rightOrder = orderIndex.has(String(right.id)) ? orderIndex.get(String(right.id)) : 1e9;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        return left.index - right.index;
      });
    } else {
      filtered.sort(function(left, right) {
        return left.index - right.index;
      });
    }
    return filtered;
  }

  async function fetchDateFieldInfoMap() {
    if (!fieldInfoPromise) {
      fieldInfoPromise = kintone.api(kintone.api.url('/k/v1/app/form/fields', true), 'GET', {
        app: kintone.app.getId()
      }).then(function(response) {
        const map = new Map();
        (function walk(properties) {
          Object.keys(properties || {}).forEach(function(key) {
            const field = properties[key];
            if (!field) {
              return;
            }
            if (field.type === 'SUBTABLE') {
              walk(field.fields);
              return;
            }
            if (field.type === 'DATE' || field.type === 'DATETIME') {
              map.set(String(field.code), { code: String(field.code), type: String(field.type) });
            }
          });
        })(response.properties);
        return map;
      });
    }
    return fieldInfoPromise;
  }

  function resolveEffectiveFieldInfo(config, fieldInfoMap) {
    if (config.dateField) {
      return fieldInfoMap.get(config.dateField) || { code: String(config.dateField), type: 'DATE' };
    }
    return fieldInfoMap.values().next().value || { code: '', type: '' };
  }

  function buildRangeQuery(view, fieldInfo, order) {
    const parts = [];
    if (view && view.filterCond) {
      parts.push('(' + view.filterCond + ')');
    } else if (view && !Object.prototype.hasOwnProperty.call(view, 'filterCond')) {
      // TODO: If view filter metadata is unavailable in this environment, keep the app-wide fallback range.
    }
    parts.push(fieldInfo.code + ' != ""');
    return parts.join(' and ') + ' order by ' + fieldInfo.code + ' ' + order + ' limit 1';
  }

  async function fetchFieldRangeFromAllRecords(fieldInfo, view) {
    async function one(order) {
      const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
        app: kintone.app.getId(),
        query: buildRangeQuery(view, fieldInfo, order),
        fields: [fieldInfo.code]
      });
      const record = response.records && response.records[0];
      return record && record[fieldInfo.code] ? extractYmdFromFieldValue(record[fieldInfo.code].value) : '';
    }

    const min = await one('asc');
    const max = await one('desc');
    return { min: min, max: max };
  }

  async function getMinMaxDateForView(fieldInfo, view) {
    const cacheKey = [
      String(kintone.app.getId()),
      String(fieldInfo.code),
      view ? String(view.id || '') : '',
      view ? String(view.filterCond || '') : ''
    ].join(':');

    if (!edgeDatePromiseMap.has(cacheKey)) {
      edgeDatePromiseMap.set(cacheKey, fetchFieldRangeFromAllRecords(fieldInfo, view));
    }
    return edgeDatePromiseMap.get(cacheKey);
  }

  async function resolveFullRange(fieldInfo, view) {
    if (!fieldInfo || !fieldInfo.code) {
      return { min: '', max: '' };
    }
    const range = await getMinMaxDateForView(fieldInfo, view);
    return {
      min: normalizeYmd(range.min),
      max: normalizeYmd(range.max)
    };
  }

  function aggregateOpLabel(op) {
    return t('aggregate_' + String(op || '').toLowerCase());
  }

  function formatAggregateNumber(value, digits) {
    const precision = clamp(Number(digits || 0) || 0, 0, 6);
    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision
    });
  }

  function isPercentLikeRule(rule) {
    const text = String((rule.label || '') + ' ' + (rule.field || '')).toLowerCase();
    return /%|percent|pct|rate|\u7387/.test(text);
  }

  function splitFetchQuery(query) {
    const parts = splitQuery(query);
    const tail = String(parts.tail || '')
      .replace(/\s+limit\s+\d+/ig, '')
      .replace(/\s+offset\s+\d+/ig, '')
      .trim();
    return {
      condition: String(parts.condition || '').trim(),
      tail: tail
    };
  }

  function buildPagedFetchQuery(baseQuery, limit, offset) {
    const parts = splitFetchQuery(baseQuery);
    const chunks = [];
    if (parts.condition) {
      chunks.push(parts.condition);
    }
    if (parts.tail) {
      chunks.push(parts.tail);
    } else {
      chunks.push('order by $id asc');
    }
    chunks.push('limit ' + limit);
    chunks.push('offset ' + offset);
    return chunks.join(' ');
  }

  async function fetchAllRecordsByCursor(appId, query, fields) {
    const all = [];
    const baseQuery = splitFetchQuery(query);
    const payload = {
      app: appId,
      fields: fields,
      size: 500
    };
    const cursorUrl = kintone.api.url('/k/v1/records/cursor.json', true);
    const cursorQuery = [baseQuery.condition, baseQuery.tail].filter(Boolean).join(' ').trim();
    if (cursorQuery) {
      payload.query = cursorQuery;
    }

    let cursorId = '';
    let completed = false;
    try {
      const created = await kintone.api(cursorUrl, 'POST', payload);
      cursorId = String(created.id || '');
      for (let index = 0; index < 5000; index += 1) {
        const response = await kintone.api(cursorUrl, 'GET', { id: cursorId });
        if (Array.isArray(response.records)) {
          all.push.apply(all, response.records);
        }
        if (response && response.next === true) {
          continue;
        }
        completed = true;
        break;
      }
      return all;
    } finally {
      if (cursorId) {
        try {
          await kintone.api(cursorUrl, 'DELETE', { id: cursorId });
        } catch {
          if (completed) {
            // noop
          }
        }
      }
    }
  }

  async function fetchAllRecordsByPaging(appId, query, fields) {
    const all = [];
    const url = kintone.api.url('/k/v1/records', true);
    const limit = 500;
    let offset = 0;
    for (let index = 0; index < 5000; index += 1) {
      const response = await kintone.api(url, 'GET', {
        app: appId,
        fields: fields,
        query: buildPagedFetchQuery(query, limit, offset)
      });
      const records = Array.isArray(response.records) ? response.records : [];
      all.push.apply(all, records);
      if (records.length < limit) {
        break;
      }
      offset += limit;
    }
    return all;
  }

  async function fetchAllRecordsSmart(appId, query, fields) {
    try {
      return await fetchAllRecordsByCursor(appId, query, fields);
    } catch (error) {
      return fetchAllRecordsByPaging(appId, query, fields);
    }
  }

  function computeAggregateValue(records, rule) {
    const values = records.map(function(record) {
      return record && record[rule.field] ? record[rule.field].value : null;
    }).map(function(value) {
      if (value === null || value === undefined) {
        return NaN;
      }
      const text = typeof value === 'string' ? value.replace(/,/g, '').trim() : value;
      if (text === '') {
        return NaN;
      }
      return Number(text);
    }).filter(Number.isFinite);

    if (rule.op === 'cnt') {
      return values.length;
    }
    if (!values.length) {
      return null;
    }
    if (rule.op === 'avg') {
      return values.reduce(function(sum, value) { return sum + value; }, 0) / values.length;
    }
    if (rule.op === 'min') {
      return Math.min.apply(Math, values);
    }
    if (rule.op === 'max') {
      return Math.max.apply(Math, values);
    }
    return values.reduce(function(sum, value) { return sum + value; }, 0);
  }

  function buildAggregateItems(records, rules) {
    return rules.filter(function(rule) {
      return rule.op !== 'none';
    }).map(function(rule) {
      const value = computeAggregateValue(records, rule);
      const formatted = value === null ? '-' : formatAggregateNumber(value, rule.digits);
      let text = formatted;
      if (formatted !== '-' && (rule.prefix || rule.suffix)) {
        text = String(rule.prefix || '') + formatted + String(rule.suffix || '');
      } else if (formatted !== '-' && rule.op === 'avg' && isPercentLikeRule(rule)) {
        text = formatted + '%';
      }
      return {
        label: String(rule.label || rule.field) + ' (' + aggregateOpLabel(rule.op) + ')',
        text: text,
        opLabel: aggregateOpLabel(rule.op)
      };
    });
  }

  function getEffectiveListQuery(view) {
    const query = getCurrentQuery();
    if (query) {
      return query;
    }
    if (view && view.filterCond) {
      return '(' + view.filterCond + ')';
    }
    return '';
  }

  async function resolveAggregateItems(config, view, eventRecords) {
    const rules = (config.aggregateRules || []).filter(function(rule) {
      return rule.op !== 'none';
    });
    if (!config.enableAggregates || !rules.length) {
      return [];
    }
    const fields = Array.from(new Set(rules.map(function(rule) {
      return rule.field;
    }).filter(Boolean)));
    if (!fields.length) {
      return [];
    }
    const query = getEffectiveListQuery(view);
    let records = [];
    try {
      records = await fetchAllRecordsSmart(kintone.app.getId(), query, fields);
    } catch {
      records = Array.isArray(eventRecords) ? eventRecords : [];
    }
    return buildAggregateItems(records, rules);
  }

  function createButtonLabel(view, showIcons) {
    const fragment = document.createDocumentFragment();
    if (showIcons) {
      fragment.appendChild(createSvgIcon(view.type));
    }
    const span = document.createElement('span');
    span.className = 'kvtdf-tab-label';
    span.textContent = view.name;
    fragment.appendChild(span);
    return fragment;
  }

  function navigateToView(view) {
    const url = getCurrentUrl();
    url.searchParams.delete(PRIMARY_QUERY_PARAM);
    url.searchParams.delete(SECONDARY_QUERY_PARAM);
    clearLegacyStateParams(url);
    url.searchParams.set('view', String(view.id));
    location.href = url.toString();
  }

  function createTabButton(view, currentView, currentViewId, showIcons) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kvtdf-tab';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(String(view.id) === String(currentViewId)));
    button.title = view.name;
    button.appendChild(createButtonLabel(view, showIcons));
    button.addEventListener('click', function() {
      navigateToView(view);
    });
    return button;
  }

  function buildTabs(views, currentView, currentViewId, config, cleanups) {
    const tabs = document.createElement('div');
    tabs.className = 'kvtdf-tabs';
    tabs.setAttribute('role', 'tablist');

    const inlineViews = views.slice(0, config.maxInline);
    const overflowViews = views.slice(config.maxInline);

    inlineViews.forEach(function(view) {
      tabs.appendChild(createTabButton(view, currentView, currentViewId, config.showIcons));
    });

    if (overflowViews.length) {
      const moreWrap = document.createElement('div');
      moreWrap.className = 'kvtdf-more';

      const isOverflowActive = overflowViews.some(function(view) {
        return String(view.id) === String(currentViewId);
      });

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'kvtdf-more-button' + (isOverflowActive ? ' is-active' : '');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = t('other');

      const menu = document.createElement('div');
      menu.className = 'kvtdf-menu';
      menu.dataset.open = 'false';

      function closeMenu() {
        menu.dataset.open = 'false';
        toggle.setAttribute('aria-expanded', 'false');
      }

      toggle.addEventListener('click', function(event) {
        event.stopPropagation();
        if (menu.dataset.open === 'true') {
          closeMenu();
        } else {
          menu.dataset.open = 'true';
          toggle.setAttribute('aria-expanded', 'true');
        }
      });

      menu.addEventListener('click', function(event) {
        event.stopPropagation();
      });

      overflowViews.forEach(function(view) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'kvtdf-menu-item';
        item.title = view.name;
        if (config.showIcons) {
          item.appendChild(createSvgIcon(view.type));
        }
        const span = document.createElement('span');
        span.className = 'kvtdf-menu-label';
        span.textContent = view.name;
        item.appendChild(span);
        item.addEventListener('click', function() {
          navigateToView(view);
        });
        menu.appendChild(item);
      });

      const closeOnOutsideClick = function(event) {
        if (!moreWrap.contains(event.target)) {
          closeMenu();
        }
      };
      const closeOnEscape = function(event) {
        if (event.key === 'Escape') {
          closeMenu();
        }
      };

      document.addEventListener('click', closeOnOutsideClick);
      document.addEventListener('keydown', closeOnEscape);
      cleanups.push(function() {
        document.removeEventListener('click', closeOnOutsideClick);
        document.removeEventListener('keydown', closeOnEscape);
      });

      moreWrap.appendChild(toggle);
      moreWrap.appendChild(menu);
      tabs.appendChild(moreWrap);
    }

    return tabs;
  }

  function createFilterStatus(start, end, active) {
    if (!start || !end) {
      return '';
    }
    if (active) {
      return start + ' - ' + end;
    }
    return t('lastRange') + ': ' + start + ' - ' + end;
  }

  function buildAggregateBar(items) {
    const wrap = document.createElement('div');
    wrap.className = 'kvtdf-aggregate-wrap';

    const bar = document.createElement('div');
    bar.className = 'kvtdf-aggregate-bar';

    items.forEach(function(item) {
      const chip = document.createElement('div');
      chip.className = 'kvtdf-aggregate-chip';

      const label = document.createElement('div');
      label.className = 'kvtdf-aggregate-label';
      label.textContent = item.label;

      const value = document.createElement('div');
      value.className = 'kvtdf-aggregate-value';
      value.title = item.opLabel;
      value.textContent = item.text;

      chip.appendChild(label);
      chip.appendChild(value);
      bar.appendChild(chip);
    });

    wrap.appendChild(bar);
    return wrap;
  }

  function runCleanup(root) {
    if (root && typeof root.__kvtdfCleanup === 'function') {
      try {
        root.__kvtdfCleanup();
      } catch (error) {
        console.error('[kintone-view-tab-date-filter] cleanup failed', error);
      }
      delete root.__kvtdfCleanup;
    }
  }

  function mountRoot() {
    const host = getHeaderSpace();
    if (!host) {
      return null;
    }
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      root.className = 'kvtdf-root';
      host.appendChild(root);
    } else if (root.parentNode !== host) {
      host.appendChild(root);
    }
    return root;
  }

  function unmountRoot() {
    const root = document.getElementById(ROOT_ID);
    if (root) {
      runCleanup(root);
    }
    if (root && root.parentNode) {
      root.parentNode.removeChild(root);
    }
  }

  function showToast(message) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      toast.className = 'kvtdf-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.dataset.show = 'true';
    if (toast.__kvtdfTimer) {
      window.clearTimeout(toast.__kvtdfTimer);
    }
    toast.__kvtdfTimer = window.setTimeout(function() {
      toast.dataset.show = 'false';
    }, 3200);
  }

  function buildModalTitleId() {
    return 'kvtdf-dialog-title-' + PLUGIN_ID;
  }

  function createRangeController(fromInput, toInput, startRange, endRange, activeBar, minYmd, maxYmd) {
    const safeMin = normalizeYmd(minYmd) || formatYmd(addDays(new Date(), -180));
    const safeMax = normalizeYmd(maxYmd) || formatYmd(new Date());
    const total = Math.max(1, daysBetween(safeMin, safeMax));

    function toIndex(value) {
      return clamp(daysBetween(safeMin, normalizeYmd(value) || safeMin), 0, total);
    }

    function toYmd(index) {
      return formatYmd(addDays(parseYmd(safeMin), index));
    }

    function paint() {
      const left = Math.min(Number(startRange.value) || 0, Number(endRange.value) || 0);
      const right = Math.max(Number(startRange.value) || 0, Number(endRange.value) || 0);
      activeBar.style.left = (left / total) * 100 + '%';
      activeBar.style.width = ((right - left) / total) * 100 + '%';
    }

    function syncFromInputs() {
      const left = toIndex(fromInput.value || safeMin);
      const right = toIndex(toInput.value || safeMax);
      startRange.value = String(Math.min(left, right));
      endRange.value = String(Math.max(left, right));
      paint();
    }

    function syncFromRanges() {
      const left = Math.min(Number(startRange.value) || 0, Number(endRange.value) || 0);
      const right = Math.max(Number(startRange.value) || 0, Number(endRange.value) || 0);
      fromInput.value = normalizeYmd(toYmd(left));
      toInput.value = normalizeYmd(toYmd(right));
      paint();
    }

    startRange.min = '0';
    endRange.min = '0';
    startRange.max = String(total);
    endRange.max = String(total);
    startRange.step = '1';
    endRange.step = '1';

    fromInput.min = safeMin;
    fromInput.max = safeMax;
    toInput.min = safeMin;
    toInput.max = safeMax;

    ['input', 'change'].forEach(function(eventName) {
      fromInput.addEventListener(eventName, syncFromInputs);
      toInput.addEventListener(eventName, syncFromInputs);
      startRange.addEventListener(eventName, syncFromRanges);
      endRange.addEventListener(eventName, syncFromRanges);
    });

    syncFromInputs();
    return {
      safeMin: safeMin,
      safeMax: safeMax,
      syncFromInputs: syncFromInputs
    };
  }

  function buildFilterButton(active) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kvtdf-filter-button' + (active ? ' is-active' : '');
    button.setAttribute('aria-expanded', 'false');
    button.appendChild(createSvgIcon('CALENDAR'));

    const label = document.createElement('span');
    label.textContent = t('date');
    button.appendChild(label);
    return button;
  }

  function buildSectionTitle(text) {
    const title = document.createElement('div');
    title.className = 'kvtdf-section-title';
    title.textContent = text;
    return title;
  }

  function buildModal(options, cleanups) {
    const modal = document.createElement('div');
    modal.className = 'kvtdf-modal';
    modal.hidden = true;

    const backdrop = document.createElement('div');
    backdrop.className = 'kvtdf-backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'kvtdf-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', buildModalTitleId());

    const head = document.createElement('div');
    head.className = 'kvtdf-dialog-head';

    const titleWrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'kvtdf-dialog-title';
    title.id = buildModalTitleId();
    title.textContent = t('dateFilter');
    const desc = document.createElement('div');
    desc.className = 'kvtdf-dialog-desc';
    desc.textContent = options.fieldCode || t('noDateField');
    titleWrap.appendChild(title);
    titleWrap.appendChild(desc);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'kvtdf-dialog-close';
    close.setAttribute('aria-label', t('close'));
    close.textContent = '\u00d7';

    head.appendChild(titleWrap);
    head.appendChild(close);

    const body = document.createElement('div');
    body.className = 'kvtdf-dialog-body';

    const chipRow = document.createElement('div');
    chipRow.className = 'kvtdf-chip-row';
    if (options.presets.length) {
      const presetSection = document.createElement('section');
      presetSection.className = 'kvtdf-section';
      presetSection.appendChild(buildSectionTitle(t('quickPresets')));
      presetSection.appendChild(chipRow);
      body.appendChild(presetSection);
    }

    const dateSection = document.createElement('section');
    dateSection.className = 'kvtdf-section';
    dateSection.appendChild(buildSectionTitle(t('dateRange')));

    const dateRow = document.createElement('div');
    dateRow.className = 'kvtdf-date-row';

    const fromStack = document.createElement('label');
    fromStack.className = 'kvtdf-date-stack';
    const fromLabel = document.createElement('span');
    fromLabel.className = 'kvtdf-input-label';
    fromLabel.textContent = t('startDate');
    const fromInput = document.createElement('input');
    fromInput.type = 'date';
    fromInput.className = 'kvtdf-date-input';
    fromStack.appendChild(fromLabel);
    fromStack.appendChild(fromInput);

    const separator = document.createElement('span');
    separator.className = 'kvtdf-muted';
    separator.textContent = t('to');

    const toStack = document.createElement('label');
    toStack.className = 'kvtdf-date-stack';
    const toLabel = document.createElement('span');
    toLabel.className = 'kvtdf-input-label';
    toLabel.textContent = t('endDate');
    const toInput = document.createElement('input');
    toInput.type = 'date';
    toInput.className = 'kvtdf-date-input';
    toStack.appendChild(toLabel);
    toStack.appendChild(toInput);

    dateRow.appendChild(fromStack);
    dateRow.appendChild(separator);
    dateRow.appendChild(toStack);
    dateSection.appendChild(dateRow);
    body.appendChild(dateSection);

    const sliderSection = document.createElement('section');
    sliderSection.className = 'kvtdf-section kvtdf-range-section';
    sliderSection.appendChild(buildSectionTitle(t('rangeSlider')));

    const rangeLabel = document.createElement('div');
    rangeLabel.className = 'kvtdf-range-label';
    sliderSection.appendChild(rangeLabel);

    const slider = document.createElement('div');
    slider.className = 'kvtdf-slider';
    const rail = document.createElement('div');
    rail.className = 'kvtdf-slider-rail';
    const active = document.createElement('div');
    active.className = 'kvtdf-slider-active';
    const startRange = document.createElement('input');
    startRange.type = 'range';
    startRange.className = 'kvtdf-slider-input';
    const endRange = document.createElement('input');
    endRange.type = 'range';
    endRange.className = 'kvtdf-slider-input';
    slider.appendChild(rail);
    slider.appendChild(active);
    slider.appendChild(startRange);
    slider.appendChild(endRange);
    sliderSection.appendChild(slider);
    body.appendChild(sliderSection);

    const foot = document.createElement('div');
    foot.className = 'kvtdf-dialog-foot';

    const leftActions = document.createElement('div');
    leftActions.className = 'kvtdf-dialog-actions';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'kvtdf-dialog-button linkish';
    reset.textContent = t('clear');
    leftActions.appendChild(reset);

    const rightActions = document.createElement('div');
    rightActions.className = 'kvtdf-dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'kvtdf-dialog-button';
    cancel.textContent = t('cancel');
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'kvtdf-dialog-button primary';
    apply.textContent = t('apply');
    apply.disabled = !options.fieldCode;
    rightActions.appendChild(cancel);
    rightActions.appendChild(apply);

    foot.appendChild(leftActions);
    foot.appendChild(rightActions);

    dialog.appendChild(head);
    dialog.appendChild(body);
    dialog.appendChild(foot);
    modal.appendChild(backdrop);
    modal.appendChild(dialog);

    function closeModal() {
      if (modal.hidden) {
        return;
      }
      modal.hidden = true;
      options.trigger.setAttribute('aria-expanded', 'false');
      options.trigger.focus();
    }

    function openModal() {
      modal.hidden = false;
      options.trigger.setAttribute('aria-expanded', 'true');
      close.focus();
    }

    options.trigger.addEventListener('click', function() {
      if (modal.hidden) {
        openModal();
      } else {
        closeModal();
      }
    });
    backdrop.addEventListener('click', closeModal);
    close.addEventListener('click', closeModal);
    cancel.addEventListener('click', closeModal);

    const onKeydown = function(event) {
      if (event.key === 'Escape' && !modal.hidden) {
        event.preventDefault();
        closeModal();
      }
    };
    document.addEventListener('keydown', onKeydown);
    cleanups.push(function() {
      document.removeEventListener('keydown', onKeydown);
    });

    const controller = createRangeController(fromInput, toInput, startRange, endRange, active, options.minYmd, options.maxYmd);
    rangeLabel.textContent = t('rangeHint') + ': ' + controller.safeMin + ' - ' + controller.safeMax;

    function highlightChip(activeKey) {
      Array.from(chipRow.children).forEach(function(child) {
        child.classList.toggle('is-active', child.dataset.preset === activeKey);
      });
    }

    function clearChipHighlight() {
      highlightChip('');
    }

    ['input', 'change'].forEach(function(eventName) {
      fromInput.addEventListener(eventName, clearChipHighlight);
      toInput.addEventListener(eventName, clearChipHighlight);
      startRange.addEventListener(eventName, clearChipHighlight);
      endRange.addEventListener(eventName, clearChipHighlight);
    });

    options.presets.forEach(function(key) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'kvtdf-chip';
      chip.dataset.preset = key;
      chip.textContent = presetLabel(key);
      chip.addEventListener('click', function() {
        const range = rangeForPreset(key, options.minYmd, options.maxYmd, options.weekStart);
        fromInput.value = normalizeYmd(range.start);
        toInput.value = normalizeYmd(range.end);
        controller.syncFromInputs();
        highlightChip(key);
      });
      chipRow.appendChild(chip);
    });

    fromInput.value = options.start;
    toInput.value = options.end;

    if (!options.start || !options.end) {
      const fallback = rangeForPreset(options.defaultPreset, options.minYmd, options.maxYmd, options.weekStart);
      fromInput.value = normalizeYmd(fallback.start);
      toInput.value = normalizeYmd(fallback.end);
      highlightChip(options.defaultPreset);
    }

    controller.syncFromInputs();

    apply.addEventListener('click', function() {
      if (!options.fieldCode) {
        return;
      }
      const nextStart = normalizeYmd(fromInput.value);
      const nextEnd = normalizeYmd(toInput.value);
      if (!nextStart || !nextEnd) {
        return;
      }

      const orderedStart = parseYmd(nextStart) <= parseYmd(nextEnd) ? nextStart : nextEnd;
      const orderedEnd = parseYmd(nextStart) <= parseYmd(nextEnd) ? nextEnd : nextStart;
      const url = getCurrentUrl();
      const nextClause = buildDateClause(options.fieldCode, orderedStart, orderedEnd);
      setQueryOnUrl(url, composeViewQuery(options.currentView, nextClause));
      clearLegacyStateParams(url);
      location.href = url.toString();
    });

    reset.addEventListener('click', function() {
      const url = getCurrentUrl();
      const baseQuery = composeViewQuery(options.currentView, '');
      if (baseQuery) {
        setQueryOnUrl(url, baseQuery);
      } else {
        url.searchParams.delete(PRIMARY_QUERY_PARAM);
        url.searchParams.delete(SECONDARY_QUERY_PARAM);
      }
      clearLegacyStateParams(url);
      location.href = url.toString();
    });

    return modal;
  }

  async function render(event) {
    const currentTicket = ++renderTicket;
    const config = loadConfig();
    const root = mountRoot();
    if (!root) {
      return event;
    }

    const asyncResults = await Promise.all([
      (config.enableViewTabs || config.enableDateFilter) ? fetchViews() : Promise.resolve([]),
      config.enableDateFilter ? fetchDateFieldInfoMap().catch(function() { return new Map(); }) : Promise.resolve(new Map())
    ]);
    const views = asyncResults[0];
    const fieldInfoMap = asyncResults[1];

    if (currentTicket !== renderTicket) {
      return event;
    }

    const fieldInfo = resolveEffectiveFieldInfo(config, fieldInfoMap);
    const visibleViews = sortAndFilterViews(views, config);
    const currentView = views.find(function(view) {
      return String(view.id) === String(event.viewId);
    }) || null;

    normalizeUrlForList();

    let currentQuery = getCurrentQuery();
    if (containsInternalFieldId(currentQuery)) {
      const url = getCurrentUrl();
      url.searchParams.delete(PRIMARY_QUERY_PARAM);
      url.searchParams.delete(SECONDARY_QUERY_PARAM);
      clearLegacyStateParams(url);
      location.replace(url.toString());
      return event;
    }

    const showTabs = config.enableViewTabs && visibleViews.length > 0;
    const showDateFilter = config.enableDateFilter && shouldShowDateFilter(config, event.viewId);
    const showAggregates = config.enableAggregates && config.aggregateRules.some(function(rule) {
      return rule.op !== 'none';
    }) && shouldShowAggregates(config, event.viewId);

    if (!showTabs && !showDateFilter && !showAggregates) {
      unmountRoot();
      return event;
    }

    let minYmd = '';
    let maxYmd = '';
    if (showDateFilter && fieldInfo.code) {
      try {
        const edgeDates = await resolveFullRange(fieldInfo, currentView);
        minYmd = edgeDates.min;
        maxYmd = edgeDates.max;
      } catch (error) {
        console.error('[kintone-view-tab-date-filter] range load failed', error);
        showToast(t('rangeLoadFailed'));
      }
    }

    if (!minYmd || !maxYmd) {
      maxYmd = formatYmd(new Date());
      minYmd = formatYmd(addDays(new Date(), -180));
    }

    let aggregateItems = [];
    if (showAggregates) {
      try {
        aggregateItems = await resolveAggregateItems(config, currentView, event.records);
      } catch (error) {
        console.error('[kintone-view-tab-date-filter] aggregate load failed', error);
        showToast(t('aggregateLoadFailed'));
      }
    }

    if (currentTicket !== renderTicket) {
      return event;
    }

    runCleanup(root);
    root.replaceChildren();

    const cleanups = [];
    root.__kvtdfCleanup = function() {
      cleanups.forEach(function(cleanup) {
        try {
          cleanup();
        } catch (error) {
          console.error('[kintone-view-tab-date-filter] cleanup failed', error);
        }
      });
    };

    const bar = document.createElement('div');
    bar.className = 'kvtdf-bar';
    const topRow = document.createElement('div');
    topRow.className = 'kvtdf-row kvtdf-row-top';
    const bottomRow = document.createElement('div');
    bottomRow.className = 'kvtdf-row kvtdf-row-bottom';
    let modal = null;

    if (showTabs) {
      topRow.appendChild(buildTabs(visibleViews, currentView, event.viewId, config, cleanups));
    }

    if (showTabs && showDateFilter) {
      const spacer = document.createElement('div');
      spacer.className = 'kvtdf-spacer';
      topRow.appendChild(spacer);
    }

    if (showDateFilter) {
      const query = currentQuery;
      const parsed = parseRangeFromQuery(query, fieldInfo.code);
      const activeStart = parsed ? normalizeYmd(parsed.start) : '';
      const activeEnd = parsed ? normalizeYmd(parsed.end) : '';
      const initialStart = activeStart;
      const initialEnd = activeEnd;
      const statusStart = activeStart;
      const statusEnd = activeEnd;
      const isActive = !!(fieldInfo.code && activeStart && activeEnd);

      const filterWrap = document.createElement('div');
      filterWrap.className = 'kvtdf-filter-wrap';

      const trigger = buildFilterButton(isActive);
      filterWrap.appendChild(trigger);

      const statusText = createFilterStatus(statusStart, statusEnd, isActive);
      if (statusText) {
        const status = document.createElement('span');
        status.className = 'kvtdf-filter-status';
        status.textContent = statusText;
        filterWrap.appendChild(status);
      }

      modal = buildModal({
        trigger: trigger,
        fieldCode: fieldInfo.code,
        minYmd: minYmd,
        maxYmd: maxYmd,
        weekStart: config.weekStart,
        presets: config.presets.length ? config.presets : PRESETS.map(function(item) { return item.value; }),
        defaultPreset: config.defaultPreset || 'last-30',
        currentView: currentView,
        start: initialStart,
        end: initialEnd
      }, cleanups);

      topRow.appendChild(filterWrap);
    }

    if (showAggregates && aggregateItems.length) {
      bottomRow.appendChild(buildAggregateBar(aggregateItems));
    }

    if (topRow.children.length) {
      bar.appendChild(topRow);
    }
    if (bottomRow.children.length) {
      bar.appendChild(bottomRow);
    }

    if (bar.children.length) {
      root.appendChild(bar);
    }
    if (modal) {
      root.appendChild(modal);
    }

    return event;
  }

  kintone.events.on(EVENT_NAME, function(event) {
    return render(event).catch(function(error) {
      console.error('[kintone-view-tab-date-filter]', error);
      return event;
    });
  });
})(kintone.$PLUGIN_ID);
