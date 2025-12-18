(function (PLUGIN_ID) {
  'use strict';

  var STRINGS = {
    ja: {
      button: '横断検索',
      modalTitle: '横断検索',
      keywordPlaceholder: '顧客コード・品番などを入力',
      search: '検索',
      close: '閉じる',
      masterResults: 'マスタ結果',
      childResults: '関連レコード',
      noKeyword: 'キーワードを入力してください。',
      noMaster: '該当するマスタがありません。',
      noChild: '関連するレコードはありません。',
      errorPrefix: '検索に失敗しました: ',
      masterCount: function (count) {
        return count + '件';
      }
    },
    en: {
      button: 'Cross Search',
      modalTitle: 'Cross Search',
      keywordPlaceholder: 'Enter customer or part code…',
      search: 'Search',
      close: 'Close',
      masterResults: 'Masters',
      childResults: 'Related Records',
      noKeyword: 'Please enter a keyword.',
      noMaster: 'No matching masters found.',
      noChild: 'No related records.',
      errorPrefix: 'Search failed: ',
      masterCount: function (count) {
        return count + ' records';
      }
    }
  };

  function resolveLocale() {
    var lang = 'en';
    try {
      lang = (kintone.getLoginUser && kintone.getLoginUser().language) || 'en';
    } catch (_err) {
      lang = 'en';
    }
    if (STRINGS[lang]) return lang;
    if (lang && lang.indexOf('ja') === 0) return 'ja';
    return 'en';
  }

  var locale = resolveLocale();
  var text = STRINGS[locale];

  var MASTER_LIMIT = 50;
  var CHILD_LIMIT = 200;

  var config = loadConfig();
  if (!config.masters.length || !config.children.length) {
    return;
  }

  var state = {
    masters: config.masters,
    children: config.children,
    masterResults: [],
    childResults: {},
    selectedMaster: null,
    activeChildId: config.children.length ? config.children[0].childAppId : null,
    loading: false,
    error: '',
    ui: null
  };

  ensureButton();

  function loadConfig() {
    var raw = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
    var masters = [];
    var children = [];
    try {
      masters = JSON.parse(raw.masters || '[]');
    } catch (_err) {
      masters = [];
    }
    try {
      children = JSON.parse(raw.children || '[]');
    } catch (_err2) {
      children = [];
    }
    masters = masters
      .map(function (entry) {
        return {
          masterAppId: String(entry.masterAppId || ''),
          masterKeyFieldCode: (entry.masterKeyFieldCode || '').trim(),
          masterLabelFields: Array.isArray(entry.masterLabelFields) ? entry.masterLabelFields.filter(Boolean) : []
        };
      })
      .filter(function (entry) {
        return entry.masterAppId && entry.masterKeyFieldCode;
      });
    children = children
      .map(function (entry) {
        return {
          childAppId: String(entry.childAppId || ''),
          masterAppId: String(entry.masterAppId || ''),
          lookupFieldCode: (entry.lookupFieldCode || '').trim(),
          displayFields: Array.isArray(entry.displayFields) ? entry.displayFields.filter(Boolean) : []
        };
      })
      .filter(function (entry) {
        return entry.childAppId && entry.masterAppId && entry.lookupFieldCode;
      });
    return { masters: masters, children: children };
  }

  function ensureButton() {
    var host = getHeaderSpace();
    if (!host || host.querySelector('.kb-cross-head')) return;
    var wrap = document.createElement('div');
    wrap.className = 'kb-root kb-head kb-cross-head';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kb-btn kb-primary';
    btn.textContent = text.button;
    btn.addEventListener('click', openOverlay);
    wrap.appendChild(btn);
    host.appendChild(wrap);
  }

  function getHeaderSpace() {
    if (kintone.app && kintone.app.getHeaderMenuSpaceElement) {
      var el = kintone.app.getHeaderMenuSpaceElement();
      if (el) return el;
    }
    if (kintone.app && kintone.app.record && kintone.app.record.getHeaderMenuSpaceElement) {
      return kintone.app.record.getHeaderMenuSpaceElement();
    }
    return null;
  }

  function openOverlay() {
    if (!state.ui) {
      buildOverlay();
    }
    if (!state.ui) return;
    state.ui.overlay.style.display = 'flex';
    state.ui.overlay.setAttribute('aria-hidden', 'false');
    state.ui.keyword.focus();
    document.addEventListener('keydown', escListener);
  }

  function closeOverlay() {
    if (!state.ui) return;
    state.ui.overlay.style.display = 'none';
    state.ui.overlay.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', escListener);
  }

  function escListener(event) {
    if (event.key === 'Escape') {
      closeOverlay();
    }
  }

  function buildOverlay() {
    var overlay = document.createElement('div');
    overlay.className = 'kb-root kb-cross-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    var shell = document.createElement('div');
    shell.className = 'kb-cross-shell';
    overlay.appendChild(shell);

    var header = document.createElement('div');
    header.className = 'kb-cross-header';
    var title = document.createElement('div');
    title.className = 'kb-cross-title';
    title.textContent = text.modalTitle;
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'kb-btn';
    closeBtn.textContent = text.close;
    closeBtn.addEventListener('click', closeOverlay);
    header.appendChild(title);
    header.appendChild(closeBtn);
    shell.appendChild(header);

    var form = document.createElement('form');
    form.className = 'kb-cross-filters';
    var keyword = document.createElement('input');
    keyword.type = 'search';
    keyword.className = 'kb-input kb-cross-keyword';
    keyword.placeholder = text.keywordPlaceholder;
    form.appendChild(keyword);
    var searchBtn = document.createElement('button');
    searchBtn.type = 'submit';
    searchBtn.className = 'kb-btn kb-primary';
    searchBtn.textContent = text.search;
    form.appendChild(searchBtn);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      runSearch();
    });
    shell.appendChild(form);

    var errorBox = document.createElement('div');
    errorBox.className = 'kb-cross-error';
    errorBox.hidden = true;
    shell.appendChild(errorBox);

    var layout = document.createElement('div');
    layout.className = 'kb-cross-layout';
    var masterPanel = document.createElement('div');
    masterPanel.className = 'kb-cross-master';
    var masterHeader = document.createElement('div');
    masterHeader.className = 'kb-cross-panel-title';
    masterHeader.textContent = text.masterResults;
    masterPanel.appendChild(masterHeader);
    var masterList = document.createElement('div');
    masterList.className = 'kb-cross-master-list';
    masterPanel.appendChild(masterList);
    layout.appendChild(masterPanel);

    var childPanel = document.createElement('div');
    childPanel.className = 'kb-cross-child';
    var childHeader = document.createElement('div');
    childHeader.className = 'kb-cross-panel-title';
    childHeader.textContent = text.childResults;
    childPanel.appendChild(childHeader);
    var tabs = document.createElement('div');
    tabs.className = 'kb-cross-tabs';
    childPanel.appendChild(tabs);
    var childBody = document.createElement('div');
    childBody.className = 'kb-cross-child-body';
    childPanel.appendChild(childBody);
    layout.appendChild(childPanel);

    shell.appendChild(layout);

    var loader = document.createElement('div');
    loader.className = 'kb-cross-loading is-hidden';
    loader.textContent = text.search;
    shell.appendChild(loader);

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) {
        closeOverlay();
      }
    });

    document.body.appendChild(overlay);

    state.ui = {
      overlay: overlay,
      keyword: keyword,
      errorBox: errorBox,
      masterList: masterList,
      childTabs: tabs,
      childBody: childBody,
      loader: loader
    };
  }

  function setError(message) {
    if (!state.ui) return;
    var box = state.ui.errorBox;
    if (!message) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    box.hidden = false;
    box.textContent = message;
  }

  function setLoading(flag) {
    if (!state.ui) return;
    state.loading = flag;
    if (flag) {
      state.ui.loader.classList.remove('is-hidden');
    } else {
      state.ui.loader.classList.add('is-hidden');
    }
  }

  async function runSearch() {
    if (!state.ui) return;
    var keyword = state.ui.keyword.value.trim();
    if (!keyword) {
      setError(text.noKeyword);
      return;
    }
    setError('');
    setLoading(true);
    try {
      var masters = await searchMasters(keyword);
      if (!masters.length) {
        state.masterResults = [];
        state.childResults = {};
        state.selectedMaster = null;
        renderMasterList();
        renderChildTabs();
        setError(text.noMaster);
        return;
      }
      state.masterResults = masters;
      state.selectedMaster = masters[0];
      var childMap = await searchChildren(masters);
      state.childResults = childMap;
      if (!state.activeChildId && state.children.length) {
        state.activeChildId = state.children[0].childAppId;
      }
      renderMasterList();
      renderChildTabs();
    } catch (err) {
      console.error(err);
      setError(text.errorPrefix + (err && err.message ? err.message : err));
    } finally {
      setLoading(false);
    }
  }

  async function searchMasters(keyword) {
    var results = [];
    for (var i = 0; i < state.masters.length; i++) {
      var master = state.masters[i];
      var records = await fetchMasterRecords(master, keyword);
      Array.prototype.push.apply(results, records);
    }
    return results;
  }

  async function fetchMasterRecords(master, keyword) {
    var targetFields = [master.masterKeyFieldCode].concat(master.masterLabelFields || []);
    var clause = buildKeywordClause(keyword, targetFields);
    if (!clause) return [];
    var query = clause + ' limit ' + MASTER_LIMIT;
    var fields = ['$id'].concat(targetFields);
    fields = dedupe(fields);
    var params = { app: master.masterAppId, query: query, fields: fields };
    var url = kintone.api.url('/k/v1/records.json', true);
    var resp = await kintone.api(url, 'GET', params);
    var records = Array.isArray(resp.records) ? resp.records : [];
    return records
      .map(function (record) {
        var key = valueToText(record[master.masterKeyFieldCode]);
        if (!key) return null;
        return {
          master: master,
          key: key,
          labels: (master.masterLabelFields || []).map(function (code) {
            return valueToText(record[code]);
          }),
          recordId: record.$id && record.$id.value,
          record: record,
          url: buildRecordUrl(master.masterAppId, record.$id && record.$id.value)
        };
      })
      .filter(Boolean);
  }

  async function searchChildren(masterResults) {
    var keysByMaster = {};
    masterResults.forEach(function (item) {
      if (!item || !item.key) return;
      var list = keysByMaster[item.master.masterAppId];
      if (!list) {
        list = [];
        keysByMaster[item.master.masterAppId] = list;
      }
      if (list.indexOf(item.key) === -1) {
        list.push(item.key);
      }
    });
    var result = {};
    for (var i = 0; i < state.children.length; i++) {
      var child = state.children[i];
      var keys = keysByMaster[child.masterAppId] || [];
      result[child.childAppId] = {
        child: child,
        recordsByKey: await fetchChildRecords(child, keys)
      };
    }
    return result;
  }

  async function fetchChildRecords(child, keys) {
    var recordsByKey = {};
    if (!Array.isArray(keys) || !keys.length) {
      return recordsByKey;
    }
    var cleanKeys = keys.filter(Boolean);
    if (!cleanKeys.length) return recordsByKey;
    var chunks = chunkArray(cleanKeys, 40);
    var url = kintone.api.url('/k/v1/records.json', true);
    var fields = ['$id', child.lookupFieldCode].concat(child.displayFields || []);
    fields = dedupe(fields);
    for (var i = 0; i < chunks.length; i++) {
      var clause = buildInClause(child.lookupFieldCode, chunks[i]);
      if (!clause) continue;
      var query = clause + ' order by ' + child.lookupFieldCode + ' asc limit ' + CHILD_LIMIT;
      var resp = await kintone.api(url, 'GET', { app: child.childAppId, query: query, fields: fields });
      var records = Array.isArray(resp.records) ? resp.records : [];
      records.forEach(function (record) {
        var keyValue = valueToText(record[child.lookupFieldCode]);
        if (!keyValue) return;
        if (!recordsByKey[keyValue]) {
          recordsByKey[keyValue] = [];
        }
        recordsByKey[keyValue].push(record);
      });
    }
    return recordsByKey;
  }

  function renderMasterList() {
    if (!state.ui) return;
    var list = state.ui.masterList;
    list.textContent = '';
    state.masterResults.forEach(function (item) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'kb-cross-master-row' + (state.selectedMaster === item ? ' is-active' : '');
      var title = document.createElement('div');
      title.className = 'kb-cross-master-key';
      title.textContent = item.key;
      row.appendChild(title);
      var label = document.createElement('div');
      label.className = 'kb-cross-master-labels';
      label.textContent = item.labels.filter(Boolean).join(' / ');
      row.appendChild(label);
      row.addEventListener('click', function () {
        state.selectedMaster = item;
        renderMasterList();
        renderChildTabs();
      });
      list.appendChild(row);
    });
    if (!state.masterResults.length) {
      var empty = document.createElement('div');
      empty.className = 'kb-cross-empty';
      empty.textContent = text.noMaster;
      list.appendChild(empty);
    }
  }

  function renderChildTabs() {
    if (!state.ui) return;
    var tabs = state.ui.childTabs;
    var body = state.ui.childBody;
    tabs.textContent = '';
    body.textContent = '';
    if (!state.children.length) return;
    state.children.forEach(function (child) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kb-cross-tab' + (state.activeChildId === child.childAppId ? ' is-active' : '');
      var count = getRecordCount(child.childAppId, state.selectedMaster && state.selectedMaster.key);
      btn.textContent = (child.childAppId || 'App') + ' (' + count + ')';
      btn.addEventListener('click', function () {
        state.activeChildId = child.childAppId;
        renderChildTabs();
      });
      tabs.appendChild(btn);
    });
    renderChildTable();
  }

  function getRecordCount(childAppId, key) {
    if (!key) return 0;
    var bucket = state.childResults[childAppId];
    if (!bucket || !bucket.recordsByKey) return 0;
    var list = bucket.recordsByKey[key];
    return Array.isArray(list) ? list.length : 0;
  }

  function renderChildTable() {
    if (!state.ui) return;
    var body = state.ui.childBody;
    body.textContent = '';
    if (!state.selectedMaster) {
      var empty = document.createElement('div');
      empty.className = 'kb-cross-empty';
      empty.textContent = text.noMaster;
      body.appendChild(empty);
      return;
    }
    var child = state.children.find(function (c) {
      return c.childAppId === state.activeChildId;
    }) || state.children[0];
    if (!child) return;
    var bucket = state.childResults[child.childAppId];
    var records = (bucket && bucket.recordsByKey && bucket.recordsByKey[state.selectedMaster.key]) || [];
    if (!records.length) {
      var emptyChild = document.createElement('div');
      emptyChild.className = 'kb-cross-empty';
      emptyChild.textContent = text.noChild;
      body.appendChild(emptyChild);
      return;
    }
    var table = document.createElement('table');
    table.className = 'kb-cross-table';
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    var fields = resolveDisplayFields(child, records);
    var thAction = document.createElement('th');
    thAction.textContent = '';
    headRow.appendChild(thAction);
    fields.forEach(function (code) {
      var th = document.createElement('th');
      th.textContent = code;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    records.forEach(function (record) {
      var tr = document.createElement('tr');
      var actionTd = document.createElement('td');
      var openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'kb-btn kb-inline';
      openBtn.textContent = '↗';
      var recordId = record.$id && record.$id.value;
      openBtn.addEventListener('click', function () {
        window.open(buildRecordUrl(child.childAppId, recordId), '_blank');
      });
      actionTd.appendChild(openBtn);
      tr.appendChild(actionTd);
      fields.forEach(function (code) {
        var td = document.createElement('td');
        td.textContent = valueToText(record[code]) || '-';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    body.appendChild(table);
  }

  function resolveDisplayFields(child, records) {
    if (child.displayFields && child.displayFields.length) return child.displayFields;
    if (!records.length) return [];
    var sample = records[0];
    return Object.keys(sample)
      .filter(function (code) {
        return code !== '$id' && code !== child.lookupFieldCode;
      })
      .slice(0, 6);
  }

  function buildKeywordClause(keyword, fields) {
    if (!keyword || !fields.length) return '';
    var words = keyword
      .split(/\s+/)
      .map(function (word) {
        return word.trim();
      })
      .filter(Boolean);
    if (!words.length) return '';
    return words
      .map(function (word) {
        var like = fields
          .map(function (field) {
            return field + ' like "' + escapeValue(word) + '"';
          })
          .join(' or ');
        return '(' + like + ')';
      })
      .join(' and ');
  }

  function buildInClause(field, values) {
    if (!values.length) return '';
    var inner = values
      .map(function (value) {
        return '"' + escapeValue(value) + '"';
      })
      .join(',');
    return field + ' in (' + inner + ')';
  }

  function escapeValue(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function chunkArray(list, size) {
    var out = [];
    for (var i = 0; i < list.length; i += size) {
      out.push(list.slice(i, i + size));
    }
    return out;
  }

  function dedupe(list) {
    var seen = {};
    var out = [];
    list.forEach(function (item) {
      if (!item || seen[item]) return;
      seen[item] = true;
      out.push(item);
    });
    return out;
  }

  function valueToText(field) {
    if (!field) return '';
    var value = field.value;
    if (value == null) return '';
    if (Array.isArray(value)) {
      return value
        .map(function (item) {
          if (!item) return '';
          if (typeof item === 'string') return item;
          if (item.name) return item.name;
          if (item.label) return item.label;
          if (item.value != null) return item.value;
          return '';
        })
        .filter(Boolean)
        .join(', ');
    }
    if (typeof value === 'object') {
      if (value.name) return value.name;
      if (value.code) return value.code;
    }
    return String(value);
  }

  function buildRecordUrl(appId, recordId) {
    if (!appId || !recordId) return '#';
    return location.origin + '/k/' + appId + '/show#record=' + recordId;
  }
})(kintone.$PLUGIN_ID);