(function(PLUGIN_ID) {
  'use strict';

  const PRESETS = [
    { value: 'today', group: 'basic', en: 'Today', ja: '\u4eca\u65e5' },
    { value: 'yesterday', group: 'basic', en: 'Yesterday', ja: '\u6628\u65e5' },
    { value: 'this-week', group: 'basic', en: 'This week', ja: '\u4eca\u9031' },
    { value: 'this-month', group: 'basic', en: 'This month', ja: '\u4eca\u6708' },
    { value: 'last-7', group: 'range', en: 'Last 7 days', ja: '\u76f4\u8fd17\u65e5' },
    { value: 'last-30', group: 'range', en: 'Last 30 days', ja: '\u76f4\u8fd130\u65e5' },
    { value: 'all', group: 'range', en: 'All', ja: '\u5168\u671f\u9593' },
    { value: 'this-year', group: 'period', en: 'This year', ja: '\u4eca\u5e74' },
    { value: 'last-year', group: 'period', en: 'Last year', ja: '\u6628\u5e74' },
    { value: 'this-half', group: 'period', en: 'This half', ja: '\u4eca\u534a\u671f' },
    { value: 'last-half', group: 'period', en: 'Last half', ja: '\u524d\u534a\u671f' },
    { value: 'this-quarter', group: 'period', en: 'This quarter', ja: '\u4eca\u56db\u534a\u671f' },
    { value: 'last-quarter', group: 'period', en: 'Last quarter', ja: '\u524d\u56db\u534a\u671f' },
    { value: 'last-week', group: 'assist', en: 'Last week', ja: '\u5148\u9031' },
    { value: 'last-month', group: 'assist', en: 'Last month', ja: '\u5148\u6708' }
  ];

  const PRESET_GROUPS = [
    { id: 'basic', titleKey: 'preset_group_basic' },
    { id: 'range', titleKey: 'preset_group_range' },
    { id: 'period', titleKey: 'preset_group_period' },
    { id: 'assist', titleKey: 'preset_group_assist' }
  ];

  const AGGREGATE_OPS = [
    { value: 'sum', ja: '\u5408\u8a08', en: 'Sum' },
    { value: 'avg', ja: '\u5e73\u5747', en: 'Average' },
    { value: 'min', ja: '\u6700\u5c0f', en: 'Minimum' },
    { value: 'max', ja: '\u6700\u5927', en: 'Maximum' },
    { value: 'cnt', ja: '\u4ef6\u6570', en: 'Count' },
    { value: 'none', ja: '\u96c6\u8a08\u3057\u306a\u3044', en: 'Do not aggregate' }
  ];

  const I18N = {
    ja: {
      page_title: '\u30d3\u30e5\u30fc\u30bf\u30d6 + \u65e5\u4ed8\u30d5\u30a3\u30eb\u30bf\u30fc + \u96c6\u8a08 \u8a2d\u5b9a',
      page_heading: '\u30d3\u30e5\u30fc\u30bf\u30d6 + \u65e5\u4ed8\u30d5\u30a3\u30eb\u30bf\u30fc + \u96c6\u8a08',
      page_desc: '\u30d3\u30e5\u30fc\u30bf\u30d6\u3001\u65e5\u4ed8\u30d5\u30a3\u30eb\u30bf\u30fc\u3001\u96c6\u8a08\u3092\u5de6\u30e1\u30cb\u30e5\u30fc\u304b\u3089\u500b\u5225\u306b\u8a2d\u5b9a\u3057\u307e\u3059\u3002',
      menu_title: '\u30e1\u30cb\u30e5\u30fc',
      nav_view_tabs: '\u30d3\u30e5\u30fc\u30bf\u30d6',
      nav_date_filter: '\u65e5\u4ed8\u30d5\u30a3\u30eb\u30bf\u30fc',
      nav_aggregates: '\u96c6\u8a08',
      view_tabs_title: '\u30d3\u30e5\u30fc\u30bf\u30d6',
      view_tabs_help: '\u8868\u793a\u3059\u308b\u30d3\u30e5\u30fc\u3068\u9806\u5e8f\u3092\u6574\u7406\u3057\u307e\u3059\u3002',
      enable_view_tabs_label: '\u30d3\u30e5\u30fc\u30bf\u30d6\u3092\u6709\u52b9\u5316',
      enable_view_tabs_help: '\u4e00\u89a7\u30d8\u30c3\u30c0\u30fc\u306b\u30bf\u30d6\u3092\u8868\u793a',
      available_views: '\u5229\u7528\u53ef\u80fd\u306a\u30d3\u30e5\u30fc',
      filter_views_placeholder: '\u30d3\u30e5\u30fc\u540d\u3067\u7d5e\u308a\u8fbc\u307f',
      add_button: '\u8ffd\u52a0 ->',
      remove_button: '<- \u524a\u9664',
      move_up_button: '\u4e0a\u3078',
      move_down_button: '\u4e0b\u3078',
      selected_views: '\u8868\u793a\u9806',
      selected_views_help: '\u4e0a\u304b\u3089\u9806\u306b\u30bf\u30d6\u3078\u8868\u793a',
      inline_tabs_label: '\u6a2a\u4e26\u3073\u30bf\u30d6\u6570',
      inline_tabs_note: '\u6ea2\u308c\u305f\u5206\u306f\u300c\u305d\u306e\u4ed6\u300d\u306b\u79fb\u52d5',
      show_icons_label: '\u30a2\u30a4\u30b3\u30f3\u8868\u793a',
      show_icons_help: '\u30bf\u30d6\u3068\u30e1\u30cb\u30e5\u30fc\u306b\u30d3\u30e5\u30fc\u7a2e\u5225\u30a2\u30a4\u30b3\u30f3\u3092\u8868\u793a',
      date_filter_title: '\u65e5\u4ed8\u30d5\u30a3\u30eb\u30bf\u30fc',
      date_filter_help: '\u5bfe\u8c61\u30d5\u30a3\u30fc\u30eb\u30c9\u3068\u8868\u793a\u6761\u4ef6\u3092\u6574\u7406\u3057\u307e\u3059\u3002',
      enable_date_filter_label: '\u65e5\u4ed8\u30d5\u30a3\u30eb\u30bf\u30fc\u3092\u6709\u52b9\u5316',
      enable_date_filter_help: '\u4e00\u89a7\u30d8\u30c3\u30c0\u30fc\u306b\u30d5\u30a3\u30eb\u30bf\u30fc\u3092\u8868\u793a',
      date_field_label: '\u5bfe\u8c61\u65e5\u4ed8\u30d5\u30a3\u30fc\u30eb\u30c9',
      date_field_note: '\u672a\u8a2d\u5b9a\u6642\u306f\u5b9f\u884c\u6642\u306b\u81ea\u52d5\u9078\u629e',
      week_start_label: '\u9031\u306e\u958b\u59cb',
      sunday: '\u65e5\u66dc',
      monday: '\u6708\u66dc',
      visible_presets_label: '\u8868\u793a\u30d7\u30ea\u30bb\u30c3\u30c8',
      visible_presets_note: '\u8868\u793a\u3059\u308b\u3082\u306e\u3060\u3051\u9078\u629e',
      default_preset_label: '\u65e2\u5b9a\u30d7\u30ea\u30bb\u30c3\u30c8',
      filter_target_views_label: '\u8868\u793a\u5bfe\u8c61\u30d3\u30e5\u30fc',
      filter_target_views_note: '\u672a\u8a2d\u5b9a\u6642\u306f\u5168\u30d3\u30e5\u30fc\u5bfe\u8c61',
      aggregates_title: '\u96c6\u8a08',
      aggregates_help: '\u6570\u5024\u30d5\u30a3\u30fc\u30eb\u30c9\u306e\u96c6\u8a08\u30c1\u30c3\u30d7\u3092\u4e00\u89a7\u30d8\u30c3\u30c0\u30fc\u306b\u8868\u793a\u3057\u307e\u3059\u3002',
      enable_aggregates_label: '\u96c6\u8a08\u3092\u6709\u52b9\u5316',
      enable_aggregates_help: '\u4e00\u89a7\u30d8\u30c3\u30c0\u30fc\u306b\u96c6\u8a08\u30c1\u30c3\u30d7\u3092\u8868\u793a',
      aggregate_target_views_label: '\u8868\u793a\u5bfe\u8c61\u30d3\u30e5\u30fc',
      aggregate_target_views_note: '\u672a\u8a2d\u5b9a\u6642\u306f\u5168\u30d3\u30e5\u30fc\u5bfe\u8c61',
      aggregate_add_row: '\u884c\u3092\u8ffd\u52a0',
      aggregate_field: '\u30d5\u30a3\u30fc\u30eb\u30c9',
      aggregate_op: '\u96c6\u8a08',
      aggregate_digits: '\u5c0f\u6570\u6841',
      aggregate_prefix: '\u63a5\u982d',
      aggregate_suffix: '\u63a5\u5c3e',
      aggregate_actions: '\u64cd\u4f5c',
      aggregate_delete: '\u524a\u9664',
      aggregate_empty: '\u6570\u5024\u307e\u305f\u306f\u8a08\u7b97\u30d5\u30a3\u30fc\u30eb\u30c9\u304c\u3042\u308a\u307e\u305b\u3093\u3002',
      save_button: '\u4fdd\u5b58',
      cancel_button: '\u30ad\u30e3\u30f3\u30bb\u30eb',
      auto_detect_runtime: '\u5b9f\u884c\u6642\u306b\u81ea\u52d5\u9078\u629e',
      missing_suffix: '\uff08\u898b\u3064\u304b\u308a\u307e\u305b\u3093\uff09',
      preset_group_basic: '\u57fa\u672c',
      preset_group_range: '\u671f\u9593',
      preset_group_period: '\u5e74 / \u534a\u671f / \u56db\u534a\u671f',
      preset_group_assist: '\u88dc\u52a9',
      type_LIST: '\u4e00\u89a7',
      type_CUSTOM: '\u30ab\u30b9\u30bf\u30e0',
      type_CALENDAR: '\u30ab\u30ec\u30f3\u30c0\u30fc',
      type_CHART: '\u30b0\u30e9\u30d5'
    },
    en: {
      page_title: 'View Tabs + Date Filter + Aggregates Config',
      page_heading: 'View Tabs + Date Filter + Aggregates',
      page_desc: 'Configure view tabs, date filter, and aggregates separately from the left menu.',
      menu_title: 'Menu',
      nav_view_tabs: 'View tabs',
      nav_date_filter: 'Date filter',
      nav_aggregates: 'Aggregates',
      view_tabs_title: 'View tabs',
      view_tabs_help: 'Choose visible views and their order.',
      enable_view_tabs_label: 'Enable view tabs',
      enable_view_tabs_help: 'Show tabs in the list header',
      available_views: 'Available views',
      filter_views_placeholder: 'Filter by name',
      add_button: 'Add ->',
      remove_button: '<- Remove',
      move_up_button: 'Up',
      move_down_button: 'Down',
      selected_views: 'Display order',
      selected_views_help: 'Rendered from top to bottom',
      inline_tabs_label: 'Inline count',
      inline_tabs_note: 'Overflow goes to Other',
      show_icons_label: 'Show icons',
      show_icons_help: 'Render view type icons',
      date_filter_title: 'Date filter',
      date_filter_help: 'Choose the field and display conditions.',
      enable_date_filter_label: 'Enable date filter',
      enable_date_filter_help: 'Show the filter in the list header',
      date_field_label: 'Target date field',
      date_field_note: 'Auto-select when empty',
      week_start_label: 'Week start',
      sunday: 'Sunday',
      monday: 'Monday',
      visible_presets_label: 'Visible presets',
      visible_presets_note: 'Choose only the presets to show',
      default_preset_label: 'Default preset',
      filter_target_views_label: 'Target views',
      filter_target_views_note: 'All views when empty',
      aggregates_title: 'Aggregates',
      aggregates_help: 'Show aggregate chips for numeric fields in the list header.',
      enable_aggregates_label: 'Enable aggregates',
      enable_aggregates_help: 'Show aggregate chips in the list header',
      aggregate_target_views_label: 'Target views',
      aggregate_target_views_note: 'All views when empty',
      aggregate_add_row: 'Add row',
      aggregate_field: 'Field',
      aggregate_op: 'Operation',
      aggregate_digits: 'Decimals',
      aggregate_prefix: 'Prefix',
      aggregate_suffix: 'Suffix',
      aggregate_actions: 'Actions',
      aggregate_delete: 'Delete',
      aggregate_empty: 'No numeric or calc fields found.',
      save_button: 'Save',
      cancel_button: 'Cancel',
      auto_detect_runtime: 'Auto-detect at runtime',
      missing_suffix: ' (missing)',
      preset_group_basic: 'Basic',
      preset_group_range: 'Range',
      preset_group_period: 'Year / Half / Quarter',
      preset_group_assist: 'Assist',
      type_LIST: 'List',
      type_CUSTOM: 'Custom',
      type_CALENDAR: 'Calendar',
      type_CHART: 'Chart'
    }
  };

  const state = {
    allViews: [],
    selectedViewIds: [],
    aggregateFields: [],
    aggregateRules: []
  };

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

  function tr(key) {
    const lang = getLanguage();
    return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
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

  function aggregateOpLabel(value) {
    const item = AGGREGATE_OPS.find(function(option) {
      return option.value === value;
    });
    if (!item) {
      return value;
    }
    return getLanguage() === 'en' ? item.en : item.ja;
  }

  function viewTypeLabel(type) {
    return tr('type_' + String(type || 'LIST').toUpperCase());
  }

  function applyI18n() {
    document.documentElement.lang = getLanguage();
    Array.from(document.querySelectorAll('[data-i18n]')).forEach(function(node) {
      node.textContent = tr(node.getAttribute('data-i18n'));
    });
    Array.from(document.querySelectorAll('[data-i18n-placeholder]')).forEach(function(node) {
      node.setAttribute('placeholder', tr(node.getAttribute('data-i18n-placeholder')));
    });
  }

  function $(id) {
    return document.getElementById(id);
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
      return {
        field: String(rule && rule.field || '').trim(),
        label: String(rule && (rule.label || rule.field) || '').trim(),
        op: String(rule && rule.op || 'sum').trim() || 'sum',
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
      maxInline: Math.max(0, Number(raw.maxInline) || 6),
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

  function getAppId() {
    if (kintone.app && typeof kintone.app.getId === 'function') {
      const appId = kintone.app.getId();
      if (appId) {
        return appId;
      }
    }
    const match = location.search.match(/[?&]app=(\d+)/);
    return match ? Number(match[1]) : null;
  }

  function createOption(value, label) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }

  async function fetchViews() {
    const response = await kintone.api(kintone.api.url('/k/v1/app/views', true), 'GET', { app: getAppId() });
    return Object.values(response.views || {}).map(function(view) {
      return {
        id: String(view.id),
        name: String(view.name || ''),
        type: String(view.type || 'LIST'),
        index: Number(view.index || 0)
      };
    }).sort(function(left, right) {
      return left.index - right.index;
    });
  }

  async function fetchFieldProperties() {
    const endpoints = [
      '/k/v1/app/form/fields',
      '/k/v1/preview/app/form/fields'
    ];
    for (let index = 0; index < endpoints.length; index += 1) {
      try {
        const response = await kintone.api(kintone.api.url(endpoints[index], true), 'GET', { app: getAppId() });
        return response.properties || {};
      } catch {
        // try next endpoint
      }
    }
    return {};
  }

  async function fetchDateFields() {
    const properties = await fetchFieldProperties();
    const fields = [];
    (function walk(source) {
      Object.keys(source || {}).forEach(function(key) {
        const field = source[key];
        if (!field) {
          return;
        }
        if (field.type === 'SUBTABLE') {
          walk(field.fields);
          return;
        }
        if (field.type === 'DATE' || field.type === 'DATETIME') {
          fields.push(field.code);
        }
      });
    })(properties);
    return fields;
  }

  async function fetchAggregateFields() {
    const properties = await fetchFieldProperties();
    const fields = [];
    (function walk(source) {
      Object.keys(source || {}).forEach(function(key) {
        const field = source[key];
        if (!field) {
          return;
        }
        if (field.type === 'SUBTABLE') {
          walk(field.fields);
          return;
        }
        if (field.type === 'NUMBER' || field.type === 'CALC') {
          fields.push({
            code: String(field.code),
            label: String(field.label || field.code)
          });
        }
      });
    })(properties);
    return fields.sort(function(left, right) {
      return left.label.localeCompare(right.label, getLanguage() === 'ja' ? 'ja' : undefined);
    });
  }

  function createChecklistItem(view, checked) {
    const label = document.createElement('label');
    label.className = 'kvtdf-item';
    label.dataset.viewId = String(view.id);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!checked;

    const text = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'kvtdf-item-title';
    title.textContent = view.name;
    const meta = document.createElement('div');
    meta.className = 'kvtdf-item-meta';
    meta.textContent = viewTypeLabel(view.type);

    text.appendChild(title);
    text.appendChild(meta);
    label.appendChild(checkbox);
    label.appendChild(text);
    return label;
  }

  function getCheckedIds(container) {
    return Array.from(container.querySelectorAll('.kvtdf-item')).filter(function(item) {
      const checkbox = item.querySelector('input[type="checkbox"]');
      return checkbox && checkbox.checked;
    }).map(function(item) {
      return item.dataset.viewId;
    });
  }

  function renderViewLists() {
    const available = $('kvtdf-available-list');
    const selected = $('kvtdf-selected-list');
    const filterText = String($('kvtdf-search-available').value || '').toLowerCase();
    const selectedSet = new Set(state.selectedViewIds.map(String));
    const viewMap = new Map(state.allViews.map(function(view) {
      return [String(view.id), view];
    }));

    available.textContent = '';
    state.allViews.filter(function(view) {
      return !selectedSet.has(String(view.id));
    }).filter(function(view) {
      return !filterText || view.name.toLowerCase().indexOf(filterText) >= 0;
    }).forEach(function(view) {
      available.appendChild(createChecklistItem(view, false));
    });

    selected.textContent = '';
    state.selectedViewIds.forEach(function(id) {
      const view = viewMap.get(String(id));
      if (view) {
        selected.appendChild(createChecklistItem(view, false));
      }
    });

    $('kvtdf-add').disabled = !available.children.length;
    $('kvtdf-remove').disabled = !selected.children.length;
  }

  function createCheckCard(name, value, checked) {
    const label = document.createElement('label');
    label.className = 'kvtdf-checkcard';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = value;
    checkbox.checked = !!checked;
    const span = document.createElement('span');
    span.textContent = name;
    label.appendChild(checkbox);
    label.appendChild(span);
    return label;
  }

  function mountPresetCheckboxes(selectedValues) {
    const selectedSet = new Set(selectedValues);
    const container = $('kvtdf-presets');
    container.textContent = '';

    PRESET_GROUPS.forEach(function(group) {
      const section = document.createElement('section');
      section.className = 'kvtdf-preset-group';

      const heading = document.createElement('div');
      heading.className = 'kvtdf-preset-title';
      heading.textContent = tr(group.titleKey);
      section.appendChild(heading);

      const grid = document.createElement('div');
      grid.className = 'kvtdf-preset-grid';
      PRESETS.filter(function(item) {
        return item.group === group.id;
      }).forEach(function(item) {
        grid.appendChild(createCheckCard(presetLabel(item.value), item.value, selectedSet.has(item.value)));
      });
      section.appendChild(grid);
      container.appendChild(section);
    });
  }

  function collectCheckedValues(container) {
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(function(input) {
      return input.value;
    });
  }

  function refreshDefaultPreset(preferred) {
    const selected = collectCheckedValues($('kvtdf-presets'));
    const select = $('kvtdf-default-preset');
    select.textContent = '';
    const source = selected.length ? PRESETS.filter(function(item) {
      return selected.indexOf(item.value) >= 0;
    }) : PRESETS.slice();
    source.forEach(function(item) {
      select.appendChild(createOption(item.value, presetLabel(item.value)));
    });
    select.value = source.some(function(item) { return item.value === preferred; }) ? preferred : source[0].value;
  }

  function renderTargetViews(allViews, selectedValues, containerId) {
    const container = $(containerId || 'kvtdf-target-views');
    const selectedSet = new Set(selectedValues.map(String));
    container.textContent = '';
    allViews.forEach(function(view) {
      container.appendChild(createCheckCard(view.name, String(view.id), selectedSet.has(String(view.id))));
    });
  }

  function createAggregateFieldSelect(value) {
    const select = document.createElement('select');
    select.className = 'kvtdf-select';
    state.aggregateFields.forEach(function(field) {
      select.appendChild(createOption(field.code, field.label + ' (' + field.code + ')'));
    });
    if (value && !state.aggregateFields.some(function(field) { return field.code === value; })) {
      select.appendChild(createOption(value, value + tr('missing_suffix')));
    }
    select.value = value || (state.aggregateFields[0] ? state.aggregateFields[0].code : '');
    return select;
  }

  function createAggregateOpSelect(value) {
    const select = document.createElement('select');
    select.className = 'kvtdf-select';
    AGGREGATE_OPS.forEach(function(op) {
      select.appendChild(createOption(op.value, aggregateOpLabel(op.value)));
    });
    select.value = value || 'sum';
    return select;
  }

  function createAggregateInput(type, value, options) {
    const input = document.createElement('input');
    input.className = 'kvtdf-input';
    input.type = type;
    input.value = String(value || '');
    Object.keys(options || {}).forEach(function(key) {
      input.setAttribute(key, options[key]);
    });
    return input;
  }

  function collectAggregateRules() {
    state.aggregateRules = Array.from(document.querySelectorAll('#kvtdf-aggregate-body tr')).map(function(row) {
      const field = row.querySelector('[data-k="field"]');
      const op = row.querySelector('[data-k="op"]');
      const digits = row.querySelector('[data-k="digits"]');
      const prefix = row.querySelector('[data-k="prefix"]');
      const suffix = row.querySelector('[data-k="suffix"]');
      const fieldCode = field ? String(field.value || '').trim() : '';
      const fieldMeta = state.aggregateFields.find(function(item) {
        return item.code === fieldCode;
      });
      return {
        field: fieldCode,
        label: fieldMeta ? fieldMeta.label : fieldCode,
        op: op ? String(op.value || 'sum') : 'sum',
        digits: clamp(Number(digits ? digits.value : 0) || 0, 0, 6),
        prefix: prefix ? String(prefix.value || '').trim() : '',
        suffix: suffix ? String(suffix.value || '').trim() : ''
      };
    }).filter(function(rule) {
      return !!rule.field;
    });
  }

  function renderAggregateRules() {
    const body = $('kvtdf-aggregate-body');
    const empty = $('kvtdf-aggregate-empty');
    body.textContent = '';

    if (!state.aggregateFields.length) {
      empty.hidden = false;
      $('kvtdf-aggregate-add').disabled = true;
      return;
    }

    empty.hidden = !!state.aggregateRules.length;
    $('kvtdf-aggregate-add').disabled = false;

    state.aggregateRules.forEach(function(rule, index) {
      const row = document.createElement('tr');

      const fieldCell = document.createElement('td');
      const fieldSelect = createAggregateFieldSelect(rule.field);
      fieldSelect.dataset.k = 'field';
      fieldCell.appendChild(fieldSelect);

      const opCell = document.createElement('td');
      const opSelect = createAggregateOpSelect(rule.op);
      opSelect.dataset.k = 'op';
      opCell.appendChild(opSelect);

      const digitsCell = document.createElement('td');
      const digitsInput = createAggregateInput('number', rule.digits, { min: '0', max: '6' });
      digitsInput.dataset.k = 'digits';
      digitsCell.appendChild(digitsInput);

      const prefixCell = document.createElement('td');
      const prefixInput = createAggregateInput('text', rule.prefix, { maxlength: '16' });
      prefixInput.dataset.k = 'prefix';
      prefixCell.appendChild(prefixInput);

      const suffixCell = document.createElement('td');
      const suffixInput = createAggregateInput('text', rule.suffix, { maxlength: '16' });
      suffixInput.dataset.k = 'suffix';
      suffixCell.appendChild(suffixInput);

      const actionCell = document.createElement('td');
      const actionWrap = document.createElement('div');
      actionWrap.className = 'kvtdf-table-actions';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'kvtdf-btn danger';
      remove.textContent = tr('aggregate_delete');
      remove.addEventListener('click', function() {
        collectAggregateRules();
        state.aggregateRules.splice(index, 1);
        renderAggregateRules();
      });
      actionWrap.appendChild(remove);
      actionCell.appendChild(actionWrap);

      row.appendChild(fieldCell);
      row.appendChild(opCell);
      row.appendChild(digitsCell);
      row.appendChild(prefixCell);
      row.appendChild(suffixCell);
      row.appendChild(actionCell);
      body.appendChild(row);
    });

    if (!state.aggregateRules.length) {
      empty.hidden = false;
    }
  }

  function createDefaultAggregateRule() {
    const first = state.aggregateFields[0] || { code: '', label: '' };
    return {
      field: first.code,
      label: first.label,
      op: 'sum',
      digits: 0,
      prefix: '',
      suffix: ''
    };
  }

  function showPanel(name) {
    const isViewTabs = name === 'view-tabs';
    const isDateFilter = name === 'date-filter';
    const isAggregates = name === 'aggregates';
    $('kvtdf-panel-view-tabs').hidden = !isViewTabs;
    $('kvtdf-panel-date-filter').hidden = !isDateFilter;
    $('kvtdf-panel-aggregates').hidden = !isAggregates;
    $('kvtdf-nav-view-tabs').classList.toggle('is-active', isViewTabs);
    $('kvtdf-nav-date-filter').classList.toggle('is-active', isDateFilter);
    $('kvtdf-nav-aggregates').classList.toggle('is-active', isAggregates);
  }

  function syncPanelDisabled() {
    $('kvtdf-view-tabs-body').classList.toggle('is-disabled', !$('kvtdf-enable-view-tabs').checked);
    $('kvtdf-date-filter-body').classList.toggle('is-disabled', !$('kvtdf-enable-date-filter').checked);
    $('kvtdf-aggregates-body').classList.toggle('is-disabled', !$('kvtdf-enable-aggregates').checked);
  }

  async function init() {
    const config = loadConfig();
    applyI18n();
    state.selectedViewIds = config.orderViewIds.length ? config.orderViewIds.slice() : config.visibleViewIds.slice();
    state.aggregateRules = config.aggregateRules.length ? config.aggregateRules.slice() : [];

    $('kvtdf-enable-view-tabs').checked = config.enableViewTabs;
    $('kvtdf-enable-date-filter').checked = config.enableDateFilter;
    $('kvtdf-enable-aggregates').checked = config.enableAggregates;
    $('kvtdf-show-icons').checked = config.showIcons;
    $('kvtdf-max-inline').value = String(config.maxInline);
    $('kvtdf-week-start').value = String(config.weekStart);

    mountPresetCheckboxes(config.presets);
    refreshDefaultPreset(config.defaultPreset);
    $('kvtdf-presets').addEventListener('change', function() {
      refreshDefaultPreset($('kvtdf-default-preset').value);
    });

    const results = await Promise.all([
      fetchViews().catch(function() { return []; }),
      fetchDateFields().catch(function() { return []; }),
      fetchAggregateFields().catch(function() { return []; })
    ]);
    const views = results[0];
    const dateFields = results[1];
    const aggregateFields = results[2];

    state.allViews = views;
    state.aggregateFields = aggregateFields;
    state.selectedViewIds = state.selectedViewIds.filter(function(id) {
      return state.allViews.some(function(view) {
        return String(view.id) === String(id);
      });
    });

    renderViewLists();
    renderTargetViews(state.allViews, config.targetViews);
    renderTargetViews(state.allViews, config.aggregateTargetViews, 'kvtdf-aggregate-target-views');
    renderAggregateRules();

    const dateFieldSelect = $('kvtdf-date-field');
    dateFieldSelect.textContent = '';
    dateFieldSelect.appendChild(createOption('', tr('auto_detect_runtime')));
    dateFields.forEach(function(fieldCode) {
      dateFieldSelect.appendChild(createOption(fieldCode, fieldCode));
    });
    if (config.dateField) {
      if (!dateFields.some(function(fieldCode) { return fieldCode === config.dateField; })) {
        dateFieldSelect.appendChild(createOption(config.dateField, config.dateField + tr('missing_suffix')));
      }
      dateFieldSelect.value = config.dateField;
    }

    $('kvtdf-nav-view-tabs').addEventListener('click', function() {
      showPanel('view-tabs');
    });
    $('kvtdf-nav-date-filter').addEventListener('click', function() {
      showPanel('date-filter');
    });
    $('kvtdf-nav-aggregates').addEventListener('click', function() {
      showPanel('aggregates');
    });

    $('kvtdf-enable-view-tabs').addEventListener('change', syncPanelDisabled);
    $('kvtdf-enable-date-filter').addEventListener('change', syncPanelDisabled);
    $('kvtdf-enable-aggregates').addEventListener('change', syncPanelDisabled);
    $('kvtdf-search-available').addEventListener('input', renderViewLists);

    $('kvtdf-add').addEventListener('click', function() {
      getCheckedIds($('kvtdf-available-list')).forEach(function(id) {
        if (state.selectedViewIds.indexOf(id) < 0) {
          state.selectedViewIds.push(id);
        }
      });
      renderViewLists();
    });

    $('kvtdf-remove').addEventListener('click', function() {
      const removeIds = new Set(getCheckedIds($('kvtdf-selected-list')).map(String));
      state.selectedViewIds = state.selectedViewIds.filter(function(id) {
        return !removeIds.has(String(id));
      });
      renderViewLists();
    });

    $('kvtdf-up').addEventListener('click', function() {
      const ids = getCheckedIds($('kvtdf-selected-list'));
      if (ids.length !== 1) {
        return;
      }
      const index = state.selectedViewIds.indexOf(ids[0]);
      if (index > 0) {
        const temp = state.selectedViewIds[index - 1];
        state.selectedViewIds[index - 1] = state.selectedViewIds[index];
        state.selectedViewIds[index] = temp;
        renderViewLists();
      }
    });

    $('kvtdf-down').addEventListener('click', function() {
      const ids = getCheckedIds($('kvtdf-selected-list'));
      if (ids.length !== 1) {
        return;
      }
      const index = state.selectedViewIds.indexOf(ids[0]);
      if (index >= 0 && index < state.selectedViewIds.length - 1) {
        const temp = state.selectedViewIds[index + 1];
        state.selectedViewIds[index + 1] = state.selectedViewIds[index];
        state.selectedViewIds[index] = temp;
        renderViewLists();
      }
    });

    $('kvtdf-aggregate-add').addEventListener('click', function() {
      collectAggregateRules();
      state.aggregateRules.push(createDefaultAggregateRule());
      renderAggregateRules();
    });

    $('kvtdf-save').addEventListener('click', function() {
      collectAggregateRules();
      const chosenPresets = collectCheckedValues($('kvtdf-presets'));
      const chosenTargetViews = collectCheckedValues($('kvtdf-target-views'));
      const chosenAggregateTargetViews = collectCheckedValues($('kvtdf-aggregate-target-views'));
      const payload = {
        enableViewTabs: $('kvtdf-enable-view-tabs').checked ? 'true' : 'false',
        enableDateFilter: $('kvtdf-enable-date-filter').checked ? 'true' : 'false',
        enableAggregates: $('kvtdf-enable-aggregates').checked ? 'true' : 'false',
        visibleViewIds: JSON.stringify(state.selectedViewIds),
        orderViewIds: JSON.stringify(state.selectedViewIds),
        maxInline: String(Math.max(0, Number($('kvtdf-max-inline').value) || 0)),
        showIcons: $('kvtdf-show-icons').checked ? 'true' : 'false',
        dateField: $('kvtdf-date-field').value,
        weekStart: String(Number($('kvtdf-week-start').value) || 0),
        defaultPreset: $('kvtdf-default-preset').value,
        presets: JSON.stringify(chosenPresets.length ? chosenPresets : PRESETS.map(function(item) { return item.value; })),
        targetViews: JSON.stringify(chosenTargetViews),
        aggregateTargetViews: JSON.stringify(chosenAggregateTargetViews),
        aggregateRules: JSON.stringify(state.aggregateRules)
      };
      kintone.plugin.app.setConfig(payload);
    });

    $('kvtdf-cancel').addEventListener('click', function() {
      window.history.back();
    });

    showPanel('view-tabs');
    syncPanelDisabled();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(kintone.$PLUGIN_ID);
