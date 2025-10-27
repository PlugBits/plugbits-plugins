
(() => {
  'use strict';

  const PLUGIN_ID = kintone.$PLUGIN_ID;

  const PRESET_LABELS = [
    ['all','全期間 / All'],
    ['today','今日 / Today'],
    ['yesterday','昨日 / Yesterday'],
    ['last-7','直近7日 / Last 7'],
    ['last-30','直近30日 / Last 30'],
    ['this-week','今週 / This week'],
    ['last-week','先週 / Last week'],
    ['this-month','今月 / This month'],
    ['last-month','先月 / Last month'],
    ['this-quarter','今四半期 / This quarter'],
    ['last-quarter','前四半期 / Last quarter'],
    ['this-half','今半期 / This half'],
    ['last-half','前半期 / Last half'],
    ['this-year','今年 / This year'],
    ['last-year','昨年 / Last year']
  ];

  const DEFAULTS = {
    dateField: '',
    weekStart: 0,
    defaultPreset: 'last-30',
    presets: PRESET_LABELS.map(x => x[0]),
    targetViews: []
  };

  function parsePresets(raw) {
    if (!raw) return DEFAULTS.presets.slice();
    try {
      if (Array.isArray(raw)) return raw.slice();
      return JSON.parse(raw);
    } catch (_) {
      return String(raw).split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  function normalizeList(list) {
    return Array.from(new Set((list || []).map(v => String(v).trim()).filter(Boolean)));
  }

  function parseViewSelection(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return normalizeList(raw);
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return normalizeList(parsed);
    } catch (_) {
      // noop
    }
    return normalizeList(String(raw).split(','));
  }

  function getConfig() {
    const saved = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
    return {
      dateField: saved.dateField || saved.dateFieldCode || DEFAULTS.dateField,
      weekStart: Number(saved.weekStart ?? DEFAULTS.weekStart),
      defaultPreset: saved.defaultPreset || DEFAULTS.defaultPreset,
      presets: parsePresets(saved.presets),
      targetViews: parseViewSelection(saved.targetViews)
    };
  }

  function setOptions(el, list, value) {
    el.textContent = '';
    list.forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = label;
      el.appendChild(opt);
    });
    el.value = value;
  }

  function mountPresetCheckboxes(box, presets, selected) {
    box.textContent = '';
    presets.forEach(([val, label]) => {
      const id = 'chk_' + val;
      const wrap = document.createElement('label');
      wrap.className = 'kb-row';
      wrap.style.gap = '6px';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = val; cb.id = id;
      cb.checked = selected.includes(val);
      const span = document.createElement('span');
      span.textContent = label;
      wrap.appendChild(cb); wrap.appendChild(span);
      box.appendChild(wrap);
    });
  }

  async function populateDateFields(selectEl, current) {
    try {
      const app = kintone.app.getId();
      const res = await kintone.api(kintone.api.url('/k/v1/app/form/fields', true), 'GET', { app });
      const codes = [];
      (function walk(map){
        Object.values(map || {}).forEach(f => {
          if (f.type === 'SUBTABLE') return walk(f.fields);
          if (f.type === 'DATE' || f.type === 'DATETIME') codes.push(f.code);
        });
      })(res.properties);
      selectEl.textContent = '';
      if (codes.length === 0) {
        const opt = document.createElement('option');
        opt.value = ''; opt.textContent = '（日付/日時フィールドなし）';
        selectEl.appendChild(opt);
      } else {
        codes.forEach(code => {
          const opt = document.createElement('option'); opt.value = code; opt.textContent = code;
          selectEl.appendChild(opt);
        });
      }
      if (current && codes.includes(current)) selectEl.value = current;
    } catch (e) {
      // フォールバック：自由入力にする
      const opt = document.createElement('option');
      opt.value = ''; opt.textContent = '読み込み失敗（手入力可）';
      selectEl.appendChild(opt);
    }
  }

  function appendViewOption(container, id, title, note, checked) {
    const wrap = document.createElement('label');
    wrap.className = 'kb-row';
    wrap.style.gap = '6px';
    wrap.style.alignItems = 'flex-start';
    wrap.style.minWidth = '220px';
    wrap.style.flex = '0 1 260px';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = id;
    cb.checked = checked;
    const textWrap = document.createElement('div');
    textWrap.style.display = 'flex';
    textWrap.style.flexDirection = 'column';
    textWrap.style.rowGap = '2px';
    const primary = document.createElement('span');
    primary.textContent = title;
    textWrap.appendChild(primary);
    if (note) {
      const secondary = document.createElement('span');
      secondary.className = 'kb-muted';
      secondary.style.fontSize = '11px';
      secondary.textContent = note;
      textWrap.appendChild(secondary);
    }
    wrap.append(cb, textWrap);
    container.appendChild(wrap);
  }

  async function populateViews(box, selected) {
    if (!box) return;
    const selectedIds = Array.isArray(selected) ? selected.map(id => String(id)) : [];
    const selectedSet = new Set(selectedIds);
    box.textContent = '';
    let fetched = [];
    try {
      const app = kintone.app.getId();
      const res = await kintone.api(kintone.api.url('/k/v1/app/views', true), 'GET', { app });
      fetched = Object.values(res.views || {})
        .filter(view => view && ['LIST', 'CUSTOM'].includes(view.type))
        .map(view => ({
          id: String(view.id),
          name: view.name,
          type: view.type,
          index: Number(view.index ?? 0)
        }));
      fetched.sort((a, b) => a.index - b.index);
    } catch (error) {
      const warn = document.createElement('div');
      warn.className = 'kb-muted';
      warn.textContent = 'ビューの読み込みに失敗しました / Failed to load views';
      box.appendChild(warn);
      selectedIds.forEach(id => {
        appendViewOption(box, id, 'View ID ' + id, '現在のアプリに存在しない可能性があります / Missing', true);
      });
      return;
    }
    fetched.forEach(view => {
      const meta = 'ID: ' + view.id + ' / ' + view.type.toLowerCase();
      appendViewOption(box, view.id, view.name, meta, selectedSet.has(view.id));
      selectedSet.delete(view.id);
    });
    if (!fetched.length) {
      const empty = document.createElement('div');
      empty.className = 'kb-muted';
      empty.textContent = '一覧ビューが見つかりません / No list views';
      box.appendChild(empty);
    }
    selectedSet.forEach(id => {
      appendViewOption(box, id, 'View ID ' + id, '現在のアプリに存在しない可能性があります / Missing', true);
    });
  }

  function collectCheckedValues(box) {
    if (!box) return [];
    return Array.from(box.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
  }

  async function main() {
    const cfg = getConfig();

    const dateField = document.getElementById('dateField');
    const weekStart = document.getElementById('weekStart');
    const viewsBox = document.getElementById('viewsBox');
    const defaultPreset = document.getElementById('defaultPreset');
    const save = document.getElementById('save');
    const cancel = document.getElementById('cancel');
    const presetsBox = document.getElementById('presetsBox');
    // Week start
    weekStart.value = String(cfg.weekStart);

    // Presets
    mountPresetCheckboxes(presetsBox, PRESET_LABELS, cfg.presets);

    // Default preset options（選択中のプリセットのみから生成）
    const refreshDefault = () => {
      const selected = collectCheckedValues(presetsBox);
      const list = PRESET_LABELS.filter(([v]) => selected.includes(v));
      setOptions(defaultPreset, list, cfg.defaultPreset && selected.includes(cfg.defaultPreset) ? cfg.defaultPreset : (list[0]?.[0] || 'last-30'));
    };
    presetsBox.addEventListener('change', refreshDefault);
    refreshDefault();

    // Date field select
    await populateDateFields(dateField, cfg.dateField);
    await populateViews(viewsBox, cfg.targetViews);
if (cfg.dateField && !Array.from(dateField.options).some(o => o.value === cfg.dateField)) {
      // 持っている値が候補にない場合でも保持
      const opt = document.createElement('option'); opt.value = cfg.dateField; opt.textContent = cfg.dateField + '（存在しない可能性）';
      dateField.appendChild(opt); dateField.value = cfg.dateField;
    }

    // Save
    save.addEventListener('click', () => {
      const chosenPresets = collectCheckedValues(presetsBox);
      const chosenViews = collectCheckedValues(viewsBox);
      const payload = {
        dateField: dateField.value,
        weekStart: String(Number(weekStart.value)||0),
        defaultPreset: defaultPreset.value,
        presets: JSON.stringify(chosenPresets.length ? chosenPresets : DEFAULTS.presets),
        targetViews: JSON.stringify(chosenViews)
      };
      kintone.plugin.app.setConfig(payload);
    });

    // Cancel
    cancel.addEventListener('click', () => {
      history.back();
    });
  }

  if (document.readyState !== 'loading') main();
  else document.addEventListener('DOMContentLoaded', main);
})();








