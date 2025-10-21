/* KB View Tabs — Sub-toolbar (Selected Views Only)
 * - ES2019 / IIFE / no deps
 * - AGENTS.md 準拠: innerHTML 動的値なし / IIFE / 依存なし
 * - 機能: ビュー・ドロップダウン直下にサブツールバー型タブを表示
 *   - 表示するビューはプラグイン設定で選択
 *   - 並び順は設定順（未指定はアプリの並び順）
 *   - maxInline 超は「その他 ▾」に格納
 */

(() => {
  'use strict';

  const PLUGIN_ID = kintone.$PLUGIN_ID;

  const ICONS = {
  list: {
    vb: '0 0 512 512',
    nodes: [
      ['rect', { x:'0',   y:'16',  width:'96',  height:'96'  }],
      ['rect', { x:'160', y:'16',  width:'352', height:'96'  }],
      ['rect', { x:'0',   y:'208', width:'96',  height:'96'  }],
      ['rect', { x:'160', y:'208', width:'352', height:'96'  }],
      ['rect', { x:'0',   y:'400', width:'96',  height:'96'  }],
      ['rect', { x:'160', y:'400', width:'352', height:'96'  }],
    ]
  },
  calendar: {
    vb: '0 0 512 512',
    nodes: [
      ['path', { d: 'M118.611,89.297c9.483,0,17.177-7.686,17.177-17.169v-54.96C135.788,7.686,128.094,0,118.611,0   c-9.482,0-17.176,7.686-17.176,17.169v54.96C101.435,81.611,109.129,89.297,118.611,89.297z' }],
      ['path', { d: 'M255.992,89.297c9.482,0,17.176-7.686,17.176-17.169v-54.96C273.168,7.686,265.474,0,255.992,0   c-9.482,0-17.176,7.686-17.176,17.169v54.96C238.816,81.611,246.51,89.297,255.992,89.297z' }],
      ['path', { d: 'M393.373,89.297c9.482,0,17.176-7.686,17.176-17.169v-54.96C410.549,7.686,402.855,0,393.373,0   c-9.483,0-17.177,7.686-17.177,17.169v54.96C376.196,81.611,383.89,89.297,393.373,89.297z' }],
      ['path', { d: 'M427,44.899h-2.713v27.229c0,17.038-13.862,30.906-30.914,30.906c-17.038,0-30.914-13.869-30.914-30.906   V44.899h-75.552v27.229c0,17.038-13.877,30.906-30.915,30.906c-17.038,0-30.914-13.869-30.914-30.906V44.899h-75.552v27.229   c0,17.038-13.877,30.906-30.914,30.906S87.697,89.166,87.697,72.128V44.899h-2.698c-37.082,0-67.133,30.058-67.133,67.133v332.835   c0,37.074,30.05,67.133,67.133,67.133H427c37.067,0,67.134-30.058,67.134-67.133V112.032C494.134,74.958,464.067,44.899,427,44.899   z M450.853,439.771c0,15.974-12.998,28.964-28.956,28.964H90.103c-15.974,0-28.972-12.99-28.972-28.964V190.482h389.723V439.771z' }]
    ]
  },
  custom: {
    vb: '0 0 512 512',
    nodes: [
        ['path', { d: 'M502.325,307.303l-39.006-30.805c-6.215-4.908-9.665-12.429-9.668-20.348c0-0.084,0-0.168,0-0.252   c-0.014-7.936,3.44-15.478,9.667-20.396l39.007-30.806c8.933-7.055,12.093-19.185,7.737-29.701l-17.134-41.366   c-4.356-10.516-15.167-16.86-26.472-15.532l-49.366,5.8c-7.881,0.926-15.656-1.966-21.258-7.586   c-0.059-0.06-0.118-0.119-0.177-0.178c-5.597-5.602-8.476-13.36-7.552-21.225l5.799-49.363   c1.328-11.305-5.015-22.116-15.531-26.472L337.004,1.939c-10.516-4.356-22.646-1.196-29.701,7.736l-30.805,39.005   c-4.908,6.215-12.43,9.665-20.349,9.668c-0.084,0-0.168,0-0.252,0c-7.935,0.014-15.477-3.44-20.395-9.667L204.697,9.675   c-7.055-8.933-19.185-12.092-29.702-7.736L133.63,19.072c-10.516,4.356-16.86,15.167-15.532,26.473l5.799,49.366   c0.926,7.881-1.964,15.656-7.585,21.257c-0.059,0.059-0.118,0.118-0.178,0.178c-5.602,5.598-13.36,8.477-21.226,7.552   l-49.363-5.799c-11.305-1.328-22.116,5.015-26.472,15.531L1.939,174.996c-4.356,10.516-1.196,22.646,7.736,29.701l39.006,30.805   c6.215,4.908,9.665,12.429,9.668,20.348c0,0.084,0,0.167,0,0.251c0.014,7.935-3.44,15.477-9.667,20.395L9.675,307.303   c-8.933,7.055-12.092,19.185-7.736,29.701l17.134,41.365c4.356,10.516,15.168,16.86,26.472,15.532l49.366-5.799   c7.882-0.926,15.656,1.965,21.258,7.586c0.059,0.059,0.118,0.119,0.178,0.178c5.597,5.603,8.476,13.36,7.552,21.226l-5.799,49.364   c-1.328,11.305,5.015,22.116,15.532,26.472l41.366,17.134c10.516,4.356,22.646,1.196,29.701-7.736l30.804-39.005   c4.908-6.215,12.43-9.665,20.348-9.669c0.084,0,0.168,0,0.251,0c7.936-0.014,15.478,3.44,20.396,9.667l30.806,39.007   c7.055,8.933,19.185,12.093,29.701,7.736l41.366-17.134c10.516-4.356,16.86-15.168,15.532-26.472l-5.8-49.366   c-0.926-7.881,1.965-15.656,7.586-21.257c0.059-0.059,0.119-0.119,0.178-0.178c5.602-5.597,13.36-8.476,21.225-7.552l49.364,5.799   c11.305,1.328,22.117-5.015,26.472-15.531l17.134-41.365C514.418,326.488,511.258,314.358,502.325,307.303z M281.292,329.698   c-39.68,16.436-85.172-2.407-101.607-42.087c-16.436-39.68,2.407-85.171,42.087-101.608c39.68-16.436,85.172,2.407,101.608,42.088   C339.815,267.771,320.972,313.262,281.292,329.698z' }]
    ]
  },
  // 以降、ICON MONOの各SVGを同様に追加
};

function createIcon(name) {
  const def = ICONS[name];
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class','kb-ico');          // CSSで 16px に
  svg.setAttribute('viewBox', def?.vb || '0 0 24 24');
  (def?.nodes || []).forEach(([tag, attrs]) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.setAttribute('fill','currentColor');    // 文字色に追従
    svg.appendChild(el);
  });
  svg.setAttribute('aria-hidden','true');      // 装飾目的なら
  return svg;
}


  /* ========= utilities ========= */

  function safeText(node, text) { node.textContent = String(text == null ? '' : text); }

  function getQueryParam(name) {
    const params = new URLSearchParams(location.search);
    return params.get(name);
  }

  // ビュー・ドロップダウン／ツールバーの候補
  const ANCHOR_SELECTORS = [
    '[class*="-view-selector"]',
    '.gaia-argoui-selectbox-view',
    '[data-test-id="view-dropdown"]',
    '.recordlist-header-gaia',
    '.gaia-argoui-app-index-toolbar',
    '.ocean-ui .recordlist-toolbar-gaia'
  ];

  function waitForElement(selectors, timeoutMs = 3000) {
    return new Promise((resolve) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return resolve(el);
      }
      const timer = setTimeout(() => { obs.disconnect(); resolve(null); }, timeoutMs);
      const obs = new MutationObserver(() => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) { clearTimeout(timer); obs.disconnect(); return resolve(el); }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    });
  }

  function hideNativeViewDropdown() {
    try {
      const candidates = document.querySelectorAll('[class*="-view-selector"], .gaia-argoui-selectbox-view');
      candidates.forEach((el) => {
        if (!el.dataset.kbHidden) { el.dataset.kbHidden = '1'; el.style.display = 'none'; }
      });
    } catch (_) {}
  }

  function readViewsFromSelect(anchor) {
    // kintone標準のビューセレクタ内に select がある想定
    const sel = anchor?.querySelector?.('select') || document.querySelector('.gaia-argoui-selectbox-view select');
    if (!sel || !sel.options || !sel.options.length) return null;
    return Array.from(sel.options).map((opt, i) => ({
      id: String(opt.value),
      name: (opt.textContent || '').trim(),
      type: 'LIST',   // DOMからは種別が取れないので既定（必要なら後でAPIで補完）
      index: i
    }));
  }

  async function getViewsFast(anchor) {
    const dom = readViewsFromSelect(anchor);
    if (dom && dom.length) return dom;
    const appId = kintone.app.getId();
    const res = await kintone.api(kintone.api.url('/k/v1/app/views', true), 'GET', { app: appId });
    // API形式を配列化（index 付き）
    return Object.values(res.views || {}).map(v => ({
      id: String(v.id), name: v.name, type: v.type, index: v.index || 0
    }));
  }

  // 設定読取（存在しないキーは undefined）
  function loadConfig() {
    const cfg = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
    // JSON文字列項目の安全パース
    const parseJSON = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch (_) { return fallback; } };
    return {
      visibleViewIds: parseJSON(cfg.visibleViewIds, null), // null = 全ビュー表示
      orderViewIds:   parseJSON(cfg.orderViewIds,   null), // null = アプリ順
      maxInline:      Number.isFinite(Number(cfg.maxInline)) ? Number(cfg.maxInline) : 6,
      showIcons:      cfg.showIcons === 'false' ? false : true,
    };
  }

  /* ========= view icons (optional) ========= */

  // kintoneの View.type → icon.js のキー名を合わせるヘルパ
  function mapViewTypeToIconName(viewType) {
    // kintone: 'LIST' | 'CALENDAR' | 'CHART' | 'CUSTOM' など
    const m = { LIST: 'list', CALENDAR: 'calendar', CHART: 'chart', CUSTOM: 'custom' };
    return m[String(viewType).toUpperCase()] || 'list';
  }
  // サブバー用：必要なら .kb-ico を付与
  function buildIconNode(viewType) {
    const name = mapViewTypeToIconName(viewType);
    const svg = createIcon(name);               // ← icon.js 側のビルダー
    if (svg && !svg.classList.contains('kb-ico')) svg.classList.add('kb-ico');
    return svg;
  }
  

  /* ========= style (inject once) ========= */

  (function injectStyleOnce(){
    if (document.getElementById('kb-view-tabs-style')) return;
    const style = document.createElement('style');
    style.id = 'kb-view-tabs-style';
    style.textContent = [
      // サブバーのベース
      '.kb-root.kb-subbar{ position:relative; display:flex; align-items:center; gap:8px;',
      '--kb-subbar-fz:12px; font-size:var(--kb-subbar-fz);',
      '  min-height:16px;  padding:0 0; padding-left:12px; background:var(--kb-surface,#fff); }',
      '.kb-subbar::after{ content:""; position:absolute; left:0; right:0; bottom:0; height:1px;',
      '  background:var(--kb-line,#d9dee5); }',
      '.kb-subbar button, .kb-subbar .kb-btn, .kb-subbar .kb-tab, .kb-subbar .kb-morebtn, .kb-subbar .kb-menuitem{',
      '  font-size:inherit; }',
      // タブ群（アンダーラインナビ）
      '.kb-tabs{ display:flex; flex-wrap:wrap; gap:16px; }',
      '.kb-tab{ appearance:none; border:none; background:transparent; cursor:pointer; padding:2px 2px;',
      '  line-height:1; font-weight:400; color:var(--kb-sub,#8a94a6); display:inline-flex; align-items:center; gap:6px; }',
      '.kb-tab:hover{ background:rgba(0,0,0,0.03); color:var(--kb-text,#1a1f36);}',
      '.kb-tab:focus{ outline:none; }',
      '.kb-tab:focus-visible{ outline:2px solid var(--kb-focus,#76a7ff); outline-offset:2px; border-radius:6px; }',
      '.kb-tab[aria-selected="true"]{ color:var(--kb-text,#111); }',
      '.kb-tab[aria-selected="true"] .kb-uline{ background:var(--kb-primary,#2e7); }',
      '.kb-uline{ display:block; height:2px; background:transparent; margin-top:4px; }',
      // 1行高調整
      '.kb-tab .kb-linewrap{ display:flex; flex-direction:column; }',
      // アイコン
      '.kb-ico{ width:12px; height:12px; fill:currentColor; flex:none; }',
      '.kb-tab .kb-ico{ color:var(--kb-sub,#8a94a6); opacity:.45; }',
      '.kb-tab[aria-selected=\"true\"] .kb-ico{ color:inherit; opacity:.8; }',

      // その他ドロップ
      /* メニュー内アイコンも控えめ */
      '.kb-menuitem .kb-ico{ opacity:.55; margin-right:6px; }',

      '.kb-more{ margin-left:8px; position:relative; }',
      '.kb-morebtn{ appearance:none; border:1px solid transparent; background:var(--kb-surface,#fff);',
      '  padding:6px 10px; border-radius:8px; cursor:pointer; line-height:1; color:var(--kb-sub,#8a94a6);}',
      '.kb-morebtn:focus{ outline:none; }',
      '.kb-morebtn:focus-visible{ outline:2px solid var(--kb-focus,#76a7ff); outline-offset:2px; }',
      '.kb-menu{ position:absolute; right:0; top:calc(100% + 6px); min-width:220px; z-index:100;',
      '  background:#fff; box-shadow:0 8px 24px rgba(0,0,0,.12);',
      '  padding:6px; display:none; }',
      '.kb-menu[aria-hidden="false"]{ display:block; border:1px solid var(--kb-line,#d9dee5); border-radius:10px; }',
      '.kb-menu[aria-hidden="false"]{ display:block; }',
      '.kb-menuitem{ appearance:none; border:none; width:100%; text-align:left; background:transparent; cursor:pointer;',
      '  padding:8px 10px; border-radius:8px; display:flex; align-items:center; gap:8px; }',
      '.kb-menuitem:hover{ background:#f7f9fc; }',
      '.kb-menuitem:focus{ outline:none; }',
      '.kb-menuitem:focus-visible{ outline:2px solid var(--kb-focus,#76a7ff); outline-offset:2px; border-radius:6px; }',
      '.kb-subbar *{ -webkit-tap-highlight-color: transparent; }',
      '.kb-ellipsis{ max-width:32ch; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }'
    ].join('');
    document.head.appendChild(style);
  })();

  /* ========= core ========= */

  function tabButton({ id, name, type, selected, showIcons }) {
    const btn = document.createElement('button');
    btn.className = 'kb-tab';
    btn.type = 'button';
    btn.setAttribute('role','tab');
    btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    btn.setAttribute('data-view-id', String(id));
    btn.title = String(name);

    if (showIcons) {
      btn.appendChild(buildIconNode(type));
    }

    const wrap = document.createElement('span');
    wrap.className = 'kb-linewrap';
    const title = document.createElement('span');
    title.className = 'kb-ellipsis';
    safeText(title, name);
    const uline = document.createElement('span');
    uline.className = 'kb-uline';
    wrap.appendChild(title);
    wrap.appendChild(uline);
    btn.appendChild(wrap);

    btn.addEventListener('click', () => {
      const url = new URL(location.href);
      url.searchParams.set('view', String(id));
      location.href = url.toString();
    });

    return btn;
  }

  function moreMenuButton() {
    const wrap = document.createElement('div');
    wrap.className = 'kb-more';
    const btn = document.createElement('button');
    btn.className = 'kb-morebtn';
    btn.type = 'button';
    safeText(btn, 'その他 ▾');
    btn.setAttribute('aria-expanded','false');

    const menu = document.createElement('div');
    menu.className = 'kb-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-hidden', 'true');

    btn.addEventListener('click', () => {
      const open = menu.getAttribute('aria-hidden') === 'false';
      menu.setAttribute('aria-hidden', open ? 'true' : 'false');
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    });

    // メニュー外クリックで閉じる
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) {
        menu.setAttribute('aria-hidden','true');
        btn.setAttribute('aria-expanded','false');
      }
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    return { wrap, btn, menu };
  }

  function buildSubbar({ views, currentViewId, cfg }) {
    const root = document.createElement('div');
    root.className = 'kb-root kb-subbar';
    root.setAttribute('role', 'tablist');

    const tabs = document.createElement('div');
    tabs.className = 'kb-tabs';

    // 「その他」メニュー
    const { wrap: moreWrap, menu: moreMenu } = moreMenuButton();

  // 並べ方（数値を厳格にしておく）
    const max = Math.max(0, Number(cfg.maxInline || 6));
    const inline = views.slice(0, max);
    const overflow = views.slice(max);

    const selectedId = String(currentViewId ?? '');

    // インライン側はフラグメントで一括追加（reflow削減）
    const fragTabs = document.createDocumentFragment();
    inline.forEach(v => {
      const btn = tabButton({
        id: v.id,
        name: v.name,
        type: v.type,
        selected: String(v.id) === selectedId,
        showIcons: cfg.showIcons,
      });
      fragTabs.appendChild(btn);
    });
    tabs.appendChild(fragTabs);

    if (overflow.length > 0) {
      // 余りを「その他」に詰める（空で出ないように必ず中身を作る）
      const fragMenu = document.createDocumentFragment();
      overflow.forEach(v => {
        const item = document.createElement('button');
        item.className = 'kb-menuitem';
        item.type = 'button';
        item.setAttribute('role', 'menuitem');
        if (cfg.showIcons) item.appendChild(buildIconNode(v.type));
        const span = document.createElement('span');
        span.className = 'kb-ellipsis';
        span.textContent = v.name;
        item.title = String(v.name);
        item.addEventListener('click', () => {
          const url = new URL(location.href);
          url.searchParams.set('view', String(v.id));
          location.href = url.toString();
        });
        item.appendChild(span);
        fragMenu.appendChild(item);
      });
      moreMenu.appendChild(fragMenu);

      root.appendChild(tabs);
      root.appendChild(moreWrap); // ← 中身がある時だけ「その他」を出す
    } else {
      // 余りが無いなら「その他」は出さない
      root.appendChild(tabs);
    }

    return root;
  }

  function applyOrderAndFilter(views, cfg) {
    const list = Object.values(views || {});
    // 権限により非表示のものはそもそも返ってこない想定
    // 表示対象
    let filtered = list;
    if (Array.isArray(cfg.visibleViewIds) && cfg.visibleViewIds.length > 0) {
      const set = new Set(cfg.visibleViewIds.map(String));
      filtered = list.filter(v => set.has(String(v.id)));
    }
    // 並び順
    if (Array.isArray(cfg.orderViewIds) && cfg.orderViewIds.length > 0) {
      const orderIndex = new Map(cfg.orderViewIds.map((id, i) => [String(id), i]));
      filtered.sort((a, b) => {
        const ai = orderIndex.has(String(a.id)) ? orderIndex.get(String(a.id)) : 1e9;
        const bi = orderIndex.has(String(b.id)) ? orderIndex.get(String(b.id)) : 1e9;
        if (ai !== bi) return ai - bi;
        // どちらも未指定なら元の index 順
        return (a.index || 0) - (b.index || 0);
      });
    } else {
      // 未指定ならアプリの index 順
      filtered.sort((a, b) => (a.index || 0) - (b.index || 0));
    }
    return filtered;
  }

  /* ========= mount ========= */

  function init() {
    kintone.events.on(['app.record.index.show'], async (event) => {
      // アンカーを見つける
      const anchor = await waitForElement(ANCHOR_SELECTORS, 3000);
      if (!anchor || !anchor.parentElement) return event;
      if (anchor.parentElement.querySelector('.kb-root.kb-subbar')) return event; // 二重防止

      const cfg = loadConfig();

      // ビュー一覧取得
      const rawViews = await getViewsFast(anchor);
      const views = applyOrderAndFilter(rawViews, cfg);
      // サブバーを生成
      const currentViewId = getQueryParam('view') || (anchor.querySelector('select')?.value ?? null);
      const subbar = buildSubbar({ views, currentViewId, cfg });

      // ドロップダウン直下に挿入
      anchor.parentElement.insertBefore(subbar, anchor.nextSibling);

      // 既存のドロップダウンは見た目だけ隠す
      hideNativeViewDropdown();

      return event;
    });
  }

  try { init(); } catch (_) {}
})();
