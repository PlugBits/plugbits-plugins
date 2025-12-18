(function () {
  'use strict';

  var PLUGIN_ID = (kintone && kintone.$PLUGIN_ID) || '';

  var STRINGS = {
    ja: {
      title: '横断検索プラグイン - 設定',
      description: 'マスタアプリと子アプリの関連を設定し、Lookupを使った横断検索を実行します。',
      masterTitle: 'マスタアプリ定義',
      childTitle: '子アプリ定義',
      masterEmpty: 'マスタを少なくとも1つ登録してください。',
      childEmpty: '子アプリを少なくとも1つ登録してください。',
      addMaster: 'マスタを追加',
      addChild: '子アプリを追加',
      fields: {
        masterAppId: 'マスタアプリID',
        masterKey: 'キーとなるフィールドコード',
        masterLabels: '表示用フィールド（1行1項目）',
        childAppId: '子アプリID',
        childMasterId: '参照するマスタのアプリID',
        lookupField: 'Lookupフィールドコード',
        displayFields: '一覧表示フィールド（任意・1行1項目）'
      },
      save: '保存',
      cancel: 'キャンセル',
      saving: '保存中…',
      validationError: '入力内容を確認してください。'
    },
    en: {
      title: 'Cross Search Plugin - Settings',
      description: 'Define master apps and child apps to build lookup-based cross searches.',
      masterTitle: 'Master Apps',
      childTitle: 'Child Apps',
      masterEmpty: 'Register at least one master app.',
      childEmpty: 'Register at least one child app.',
      addMaster: 'Add Master',
      addChild: 'Add Child',
      fields: {
        masterAppId: 'Master App ID',
        masterKey: 'Master Key Field Code',
        masterLabels: 'Label Fields (one per line)',
        childAppId: 'Child App ID',
        childMasterId: 'Master App ID (lookup source)',
        lookupField: 'Lookup Field Code',
        displayFields: 'Display Fields (optional, one per line)'
      },
      save: 'Save',
      cancel: 'Cancel',
      saving: 'Saving…',
      validationError: 'Please review the required fields.'
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

  var state = {
    masters: [],
    children: [],
    mounted: false,
    saving: false
  };

  var refs = {
    masterList: null,
    childList: null,
    saveBtn: null
  };

  function blankMaster() {
    return { masterAppId: '', masterKeyFieldCode: '', masterLabelFields: [] };
  }

  function blankChild() {
    return { childAppId: '', masterAppId: '', lookupFieldCode: '', displayFields: [] };
  }

  function splitLines(value) {
    if (!value) return [];
    return value
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
  }

  function joinLines(list) {
    if (!Array.isArray(list)) return '';
    return list.join('\n');
  }

  function parseList(raw) {
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
      return [];
    }
  }

  function loadConfig() {
    var conf = (kintone.plugin.app.getConfig && kintone.plugin.app.getConfig(PLUGIN_ID)) || {};
    state.masters = parseList(conf.masters).map(function (entry) {
      return {
        masterAppId: String(entry.masterAppId || ''),
        masterKeyFieldCode: entry.masterKeyFieldCode || '',
        masterLabelFields: Array.isArray(entry.masterLabelFields) ? entry.masterLabelFields : []
      };
    });
    state.children = parseList(conf.children).map(function (entry) {
      return {
        childAppId: String(entry.childAppId || ''),
        masterAppId: String(entry.masterAppId || ''),
        lookupFieldCode: entry.lookupFieldCode || '',
        displayFields: Array.isArray(entry.displayFields) ? entry.displayFields : []
      };
    });
    if (!state.masters.length) state.masters.push(blankMaster());
    if (!state.children.length) state.children.push(blankChild());
  }

  function createField(label, input) {
    var wrap = document.createElement('label');
    wrap.className = 'cfg-field';
    var span = document.createElement('span');
    span.className = 'cfg-label';
    span.textContent = label;
    wrap.appendChild(span);
    wrap.appendChild(input);
    return wrap;
  }

  function renderMasters() {
    if (!refs.masterList) return;
    refs.masterList.textContent = '';
    state.masters.forEach(function (master, idx) {
      var card = document.createElement('div');
      card.className = 'cfg-card';

      var appInput = document.createElement('input');
      appInput.type = 'number';
      appInput.className = 'kb-input';
      appInput.value = master.masterAppId;
      appInput.addEventListener('input', function () {
        master.masterAppId = appInput.value.trim();
      });
      card.appendChild(createField(text.fields.masterAppId, appInput));

      var keyInput = document.createElement('input');
      keyInput.type = 'text';
      keyInput.className = 'kb-input';
      keyInput.value = master.masterKeyFieldCode;
      keyInput.addEventListener('input', function () {
        master.masterKeyFieldCode = keyInput.value.trim();
      });
      card.appendChild(createField(text.fields.masterKey, keyInput));

      var labelsArea = document.createElement('textarea');
      labelsArea.className = 'kb-input';
      labelsArea.rows = 3;
      labelsArea.value = joinLines(master.masterLabelFields);
      labelsArea.addEventListener('input', function () {
        master.masterLabelFields = splitLines(labelsArea.value);
      });
      card.appendChild(createField(text.fields.masterLabels, labelsArea));

      if (state.masters.length > 1) {
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'kb-btn cfg-remove';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', function () {
          state.masters.splice(idx, 1);
          renderMasters();
        });
        card.appendChild(removeBtn);
      }

      refs.masterList.appendChild(card);
    });
  }

  function renderChildren() {
    if (!refs.childList) return;
    refs.childList.textContent = '';
    state.children.forEach(function (child, idx) {
      var card = document.createElement('div');
      card.className = 'cfg-card';

      var appInput = document.createElement('input');
      appInput.type = 'number';
      appInput.className = 'kb-input';
      appInput.value = child.childAppId;
      appInput.addEventListener('input', function () {
        child.childAppId = appInput.value.trim();
      });
      card.appendChild(createField(text.fields.childAppId, appInput));

      var masterInput = document.createElement('input');
      masterInput.type = 'number';
      masterInput.className = 'kb-input';
      masterInput.value = child.masterAppId;
      masterInput.addEventListener('input', function () {
        child.masterAppId = masterInput.value.trim();
      });
      card.appendChild(createField(text.fields.childMasterId, masterInput));

      var lookupInput = document.createElement('input');
      lookupInput.type = 'text';
      lookupInput.className = 'kb-input';
      lookupInput.value = child.lookupFieldCode;
      lookupInput.addEventListener('input', function () {
        child.lookupFieldCode = lookupInput.value.trim();
      });
      card.appendChild(createField(text.fields.lookupField, lookupInput));

      var displayArea = document.createElement('textarea');
      displayArea.className = 'kb-input';
      displayArea.rows = 3;
      displayArea.value = joinLines(child.displayFields);
      displayArea.addEventListener('input', function () {
        child.displayFields = splitLines(displayArea.value);
      });
      card.appendChild(createField(text.fields.displayFields, displayArea));

      if (state.children.length > 1) {
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'kb-btn cfg-remove';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', function () {
          state.children.splice(idx, 1);
          renderChildren();
        });
        card.appendChild(removeBtn);
      }

      refs.childList.appendChild(card);
    });
  }

  function normalizeMasters() {
    return state.masters
      .map(function (master) {
        return {
          masterAppId: master.masterAppId.trim(),
          masterKeyFieldCode: master.masterKeyFieldCode.trim(),
          masterLabelFields: master.masterLabelFields.filter(Boolean)
        };
      })
      .filter(function (master) {
        return master.masterAppId && master.masterKeyFieldCode;
      });
  }

  function normalizeChildren() {
    return state.children
      .map(function (child) {
        return {
          childAppId: child.childAppId.trim(),
          masterAppId: child.masterAppId.trim(),
          lookupFieldCode: child.lookupFieldCode.trim(),
          displayFields: child.displayFields.filter(Boolean)
        };
      })
      .filter(function (child) {
        return child.childAppId && child.masterAppId && child.lookupFieldCode;
      });
  }

  function setSaving(flag) {
    state.saving = flag;
    if (refs.saveBtn) {
      refs.saveBtn.disabled = flag;
      refs.saveBtn.textContent = flag ? text.saving : text.save;
    }
  }

  function handleSave() {
    if (state.saving) return;
    var masters = normalizeMasters();
    var children = normalizeChildren();
    if (!masters.length) {
      window.alert(text.masterEmpty);
      return;
    }
    if (!children.length) {
      window.alert(text.childEmpty);
      return;
    }
    setSaving(true);
    kintone.plugin.app.setConfig(
      {
        masters: JSON.stringify(masters),
        children: JSON.stringify(children)
      },
      function () {
        setSaving(false);
        history.back();
      }
    );
  }

  function buildUI(root) {
    var container = document.createElement('div');
    container.className = 'kb-container';

    var intro = document.createElement('div');
    intro.className = 'kb-card cfg-card';
    var title = document.createElement('h1');
    title.className = 'kb-title';
    title.textContent = text.title;
    intro.appendChild(title);
    var desc = document.createElement('p');
    desc.className = 'kb-desc';
    desc.textContent = text.description;
    intro.appendChild(desc);
    container.appendChild(intro);

    var masterSection = document.createElement('div');
    masterSection.className = 'kb-card cfg-section';
    var masterHeader = document.createElement('div');
    masterHeader.className = 'kb-title';
    masterHeader.textContent = text.masterTitle;
    masterSection.appendChild(masterHeader);
    var masterList = document.createElement('div');
    masterList.className = 'cfg-list';
    masterSection.appendChild(masterList);
    refs.masterList = masterList;
    var addMasterBtn = document.createElement('button');
    addMasterBtn.type = 'button';
    addMasterBtn.className = 'kb-btn kb-inline';
    addMasterBtn.textContent = text.addMaster;
    addMasterBtn.addEventListener('click', function () {
      state.masters.push(blankMaster());
      renderMasters();
    });
    masterSection.appendChild(addMasterBtn);
    container.appendChild(masterSection);

    var childSection = document.createElement('div');
    childSection.className = 'kb-card cfg-section';
    var childHeader = document.createElement('div');
    childHeader.className = 'kb-title';
    childHeader.textContent = text.childTitle;
    childSection.appendChild(childHeader);
    var childList = document.createElement('div');
    childList.className = 'cfg-list';
    childSection.appendChild(childList);
    refs.childList = childList;
    var addChildBtn = document.createElement('button');
    addChildBtn.type = 'button';
    addChildBtn.className = 'kb-btn kb-inline';
    addChildBtn.textContent = text.addChild;
    addChildBtn.addEventListener('click', function () {
      state.children.push(blankChild());
      renderChildren();
    });
    childSection.appendChild(addChildBtn);
    container.appendChild(childSection);

    var actions = document.createElement('div');
    actions.className = 'kb-toolbar';
    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'kb-btn kb-primary';
    saveBtn.textContent = text.save;
    saveBtn.addEventListener('click', handleSave);
    refs.saveBtn = saveBtn;
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'kb-btn';
    cancelBtn.textContent = text.cancel;
    cancelBtn.addEventListener('click', function () {
      history.back();
    });
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    container.appendChild(actions);

    root.appendChild(container);
  }

  function init() {
    if (state.mounted) return;
    state.mounted = true;
    loadConfig();
    var root = document.getElementById('kb-root');
    if (!root) return;
    buildUI(root);
    renderMasters();
    renderChildren();
  }

  if (window.kintone && kintone.events && kintone.events.on) {
    kintone.events.on('app.plugin.config.show', function (event) {
      init();
      return event;
    });
  }

  if (document.readyState !== 'loading') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      if (document.getElementById('kb-root')) {
        init();
      }
    });
  }
})();