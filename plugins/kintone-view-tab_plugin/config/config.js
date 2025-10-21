/* KB View Tabs — config.js (設定画面ロジック)
 * - ES2019 / IIFE / 依存なし
 * - AGENTS.md 準拠（innerHTMLに動的値を入れない / DOM API + textContent）
 * - 機能: 表示するビューを選択・並び替え、オプション保存
 */

(() => {
  'use strict';

  const PLUGIN_ID = kintone.$PLUGIN_ID;
  // 軽量トースト（kb-shell.css の .kb-toast を利用）
  function showToast(message, duration = 1600) {
    const t = document.createElement('div');
    t.className = 'kb-root kb-toast';
    t.textContent = String(message ?? '');
    document.body.appendChild(t);
    setTimeout(() => t.remove(), duration);
  }

  /**
   * 設定画面の URL では kintone.app.getId() が null の場合があるため、
   * URL クエリ (?app=123) からも取得できるようにしておく。
   */
  function getAppIdInConfig() {
    const byApi = kintone.app && typeof kintone.app.getId === 'function' ? kintone.app.getId() : null;
    if (byApi) return byApi;
    const m = location.search.match(/[?&]app=(\d+)/);
    return m ? Number(m[1]) : null;
  }

  // 安全に文字列をノードへ
  function safeText(el, text) { el.textContent = String(text == null ? '' : text); }

  // 要素ショートカット
  function $(id) { return document.getElementById(id); }

  // UI要素参照（DOM構築後に評価）
  let ulAvailable, ulSelected, searchAvailable,
      btnAddSelected, btnRemoveSelected, btnUp, btnDown,
      optIcons, optMaxInline,
      btnSave, btnCancel;

  // 状態
  let allViews = [];      // { id: string, name: string, type: string, index: number }
  let selectedIds = [];   // 表示対象に選ばれた viewId の配列（順序は右リスト順）

  // <li> を生成（チェックボックス + ラベル）
  function createLi(view) {
    const li = document.createElement('li');
    li.className = 'kb-li';
    li.setAttribute('data-id', String(view.id));

    const span = document.createElement('span');
    safeText(span, view.name);

    const chk = document.createElement('input');
    chk.type = 'checkbox';

    li.appendChild(span);
    li.appendChild(chk);

    // ダブルクリックで片側↔片側の移動を簡単に
    li.addEventListener('dblclick', () => {
      const id = String(view.id);
      if (selectedIds.includes(id)) {
        // 右→左（削除）
        selectedIds = selectedIds.filter(x => x !== id);
      } else {
        // 左→右（追加）
        selectedIds.push(id);
      }
      renderLists();
    });

    return li;
  }

  function getCheckedIds(listEl) {
    return Array.from(listEl.querySelectorAll('.kb-li'))
      .filter(li => li.querySelector('input[type="checkbox"]').checked)
      .map(li => li.getAttribute('data-id'));
  }

  function renderLists() {
    // 左リスト：未選択 + 検索フィルタ
    const q = (searchAvailable.value || '').toLowerCase();
    ulAvailable.textContent = '';
    allViews
      .filter(v => !selectedIds.includes(String(v.id)))
      .filter(v => v.name.toLowerCase().includes(q))
      .sort((a,b) => (a.index || 0) - (b.index || 0))
      .forEach(v => ulAvailable.appendChild(createLi(v)));

    // 右リスト：選択済み（selectedIds の並び順）
    ulSelected.textContent = '';
    const vmap = new Map(allViews.map(v => [String(v.id), v]));
    selectedIds.forEach(id => {
      const v = vmap.get(String(id));
      if (v) ulSelected.appendChild(createLi(v));
    });

    // ボタンの有効/無効
    btnAddSelected.disabled    = ulAvailable.querySelectorAll('input[type="checkbox"]:checked').length === 0;
    btnRemoveSelected.disabled = ulSelected.querySelectorAll('input[type="checkbox"]:checked').length === 0;
  }

  function wireEvents() {
    searchAvailable.addEventListener('input', renderLists);

    ulAvailable.addEventListener('change', () => {
      btnAddSelected.disabled = ulAvailable.querySelectorAll('input[type="checkbox"]:checked').length === 0;
    });
    ulSelected.addEventListener('change', () => {
      btnRemoveSelected.disabled = ulSelected.querySelectorAll('input[type="checkbox"]:checked').length === 0;
    });

    btnAddSelected.addEventListener('click', () => {
      const ids = getCheckedIds(ulAvailable);
      ids.forEach(id => { if (!selectedIds.includes(id)) selectedIds.push(id); });
      renderLists();
    });

    btnRemoveSelected.addEventListener('click', () => {
      const ids = getCheckedIds(ulSelected);
      selectedIds = selectedIds.filter(id => !ids.includes(id));
      renderLists();
    });

    btnUp.addEventListener('click', () => {
      const ids = getCheckedIds(ulSelected);
      if (ids.length !== 1) return;
      const id = ids[0];
      const idx = selectedIds.indexOf(id);
      if (idx > 0) {
        [selectedIds[idx - 1], selectedIds[idx]] = [selectedIds[idx], selectedIds[idx - 1]];
        renderLists();
        // チェック状態を維持
        const li = ulSelected.querySelector(`.kb-li[data-id="${CSS.escape(id)}"] input[type="checkbox"]`);
        li && (li.checked = true);
      }
    });

    btnDown.addEventListener('click', () => {
      const ids = getCheckedIds(ulSelected);
      if (ids.length !== 1) return;
      const id = ids[0];
      const idx = selectedIds.indexOf(id);
      if (idx >= 0 && idx < selectedIds.length - 1) {
        [selectedIds[idx], selectedIds[idx + 1]] = [selectedIds[idx + 1], selectedIds[idx]];
        renderLists();
        const li = ulSelected.querySelector(`.kb-li[data-id="${CSS.escape(id)}"] input[type="checkbox"]`);
        li && (li.checked = true);
      }
    });

    btnSave.addEventListener('click', () => {
      // 未選択（0件）は全ビュー表示扱い → 空文字保存（reader側でnull扱い）
      const visibleViewIds = selectedIds.length ? JSON.stringify(selectedIds) : '';
      const orderViewIds   = selectedIds.length ? JSON.stringify(selectedIds) : '';
      const maxInline      = String(Math.max(0, Number(optMaxInline.value || 6)));
      const showIcons      = optIcons.checked ? 'true' : 'false';
      const cfg = { visibleViewIds, orderViewIds, maxInline, showIcons };

      // ボタン状態（多重押下防止）
      const prevLabel = btnSave.textContent;
      btnSave.disabled = true;
      btnSave.textContent = '保存中…';

      try {
        kintone.plugin.app.setConfig(cfg, () => {
          // 成功：トーストを出して、確実にアプリ設定へ戻す
          showToast('保存しました。アプリ設定に戻ります…', 1200);
          const appId = getAppIdInConfig();
          setTimeout(() => {
            if (appId) {
              location.href = `/k/admin/app/flow?app=${appId}#plugin/list`;
            } else {
              history.back();
            }
          }, 300);
        });
      } catch (_) {
        // 失敗：見えるフィードバック + ボタン復帰
        showToast('保存に失敗しました。もう一度お試しください', 1800);
        btnSave.disabled = false;
        btnSave.textContent = prevLabel;
      }
    });
    
    btnCancel.addEventListener('click', () => { history.back(); });
  }

  async function init() {
    // 要素参照
    ulAvailable      = $('ulAvailable');
    ulSelected       = $('ulSelected');
    searchAvailable  = $('searchAvailable');
    btnAddSelected   = $('btnAddSelected');
    btnRemoveSelected= $('btnRemoveSelected');
    btnUp            = $('btnUp');
    btnDown          = $('btnDown');
    optIcons         = $('optIcons');
    optMaxInline     = $('optMaxInline');
    btnSave          = $('btnSave');
    btnCancel        = $('btnCancel');

    // 既存設定の読み込み
    const raw = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
    const parseJSON = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch (_) { return fb; } };
    selectedIds = parseJSON(raw.visibleViewIds, []);
    optIcons.checked     = raw.showIcons !== 'false';
    optMaxInline.value   = String(Number.isFinite(Number(raw.maxInline)) ? Number(raw.maxInline) : 6);

    // ビュー一覧取得
    const appId = getAppIdInConfig();
    if (!appId) {
      // appId が取得できない場合はレンダリングだけして終了
      renderLists();
      return;
    }

    let res;
    try {
      res = await kintone.api(kintone.api.url('/k/v1/app/views', true), 'GET', { app: appId });
    } catch (_) {
      // 失敗時は空で進む
      res = { views: {} };
    }

    allViews = Object.values(res.views || {}).map(v => ({
      id: String(v.id), name: v.name, type: v.type, index: v.index || 0
    }));

    // 保存されている selectedIds が存在しないIDを含む場合は除外
    const validSet = new Set(allViews.map(v => v.id));
    selectedIds = selectedIds.filter(id => validSet.has(String(id)));

    wireEvents();
    renderLists();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
