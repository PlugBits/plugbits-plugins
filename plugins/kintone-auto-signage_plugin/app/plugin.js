(() => {
  'use strict';

  // ===== Constants =====
  const PLUGIN_ID = (typeof kintone !== 'undefined' && kintone.$PLUGIN_ID) || undefined;
  const EVENTS = ['app.record.index.show'];
  const STATE_ATTR = 'data-ask-mounted';

  // ===== Utilities =====
  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

  function parseQuery() {
    const q = new URLSearchParams(location.search);
    const getNum = (key, def) => {
      const v = q.get(key);
      if (v == null) return def;
      const n = Number(v);
      return Number.isFinite(n) ? n : def;
    };
    const getBool = (key, def) => {
      const v = q.get(key);
      if (v == null) return def;
      return v === '1' || v === 'true';
    };
    return {
      kiosk: getBool('kiosk', undefined),
      intervalSec: getNum('interval', undefined),
      speedMsPerPx: getNum('speed', undefined),
      stopSec: getNum('stop', undefined),
      loops: getNum('loops', undefined),
      zoom: getNum('zoom', undefined)
    };
  }

  function loadConfig() {
    const raw = (PLUGIN_ID && kintone.plugin.app.getConfig(PLUGIN_ID)) || {};
    const toNum  = (k) => raw[k] == null || raw[k] === '' ? undefined : Number(raw[k]);
    const toBool = (k) => raw[k] == null || raw[k] === '' ? undefined : raw[k] === 'true';
    const toArr  = (k) => {
      try { return raw[k] ? JSON.parse(raw[k]) : []; }
      catch { return []; }
    };
    const cfg = {
      kiosk: toBool('kiosk'),
      scrollEnabled: toBool('scrollEnabled'),
      speedMsPerPx: toNum('speedMsPerPx'),
      stopSec: toNum('stopSec'),
      loops: toNum('loops'),
      reloadEnabled: toBool('reloadEnabled'),
      intervalSec: toNum('intervalSec'),
      zoom: toNum('zoom'),
      viewIds: toArr('viewIds').map(Number).filter(Number.isFinite)
    };

    // URLクエリで上書き
    const ov = parseQuery();
    for (const k of Object.keys(ov)) {
      if (ov[k] !== undefined) cfg[k] = ov[k];
    }
    return cfg;
  }

  // ===== Styles =====
  function addGlobalStyles() {
    if (document.getElementById('ask-style')) return;
    const css = [
      '/* AutoSignage global styles */',
      'html, body { background: var(--ask-bg, #fff); color: var(--ask-fg, #222); }',
      'body.ask-kiosk::-webkit-scrollbar { width:0; height:0; }',
      '.ask-kiosk .contents-space-gaia { margin:0 !important; }',
      '.ask-kiosk .app-index-pager-gaia { margin: 0 12px; }',
      'body { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }',
      '#ask-bottom-spacer{height:16px;}'
    ].join('\n');
    const style = document.createElement('style');
    style.id = 'ask-style';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  function ensureBottomSpacer() {
    if (!document.getElementById('ask-bottom-spacer')) {
      const sp = document.createElement('div');
      sp.id = 'ask-bottom-spacer';
      (document.querySelector('#view-list-bottom-gaia') || document.body).appendChild(sp);
    }
  }

  function applyKioskHide() {
    const sel = [
      '#global-header',
      '.gaia-header',
      '.gaia-argoui-app-toolbar',
      '.app-record-iframe-gaia',
      '.ocean-menu',
      '.ocean-header',
      '.recordlist-gaia-comment',
      '.gaia-app-statusbar'
    ];
    sel.forEach(s => {
      const el = document.querySelector(s);
      if (el) el.style.display = 'none';
    });
    document.body.classList.add('ask-kiosk');
    document.body.style.overflow = ''; // 本体は制御しない（対象要素にロックを掛ける）
  }

  function setZoom(zoom) {
    if (!zoom || !Number.isFinite(zoom) || zoom === 1) {
      document.documentElement.style.zoom = '';
      return;
    }
    document.documentElement.style.zoom = String(clamp(zoom, 0.5, 2.0));
  }

  // ===== Reload with jitter =====
  function scheduleAutoReload(intervalSec) {
    if (!intervalSec || !Number.isFinite(intervalSec) || intervalSec <= 0) return () => {};
    const jitter = Math.floor((Math.random() * 10) - 5); // -5..+4 秒
    const dueMs = (intervalSec + jitter) * 1000;
    const t = setTimeout(() => location.reload(), Math.max(dueMs, 10_000));
    return () => clearTimeout(t);
  }

  // ===== Scroll target resolver =====
  function isScrollable(el){
    if (!el) return false;
    const st = getComputedStyle(el);
    const oy = st.overflowY;
    return (el.scrollHeight - el.clientHeight) > 2 && oy !== 'hidden' && oy !== 'clip';
  }
  function closestScrollable(from){
    let cur = from;
    while (cur && cur !== document.body && cur !== document.documentElement){
      if (isScrollable(cur)) return cur;
      cur = cur.parentElement;
    }
    return document.scrollingElement || document.documentElement || document.body;
  }
  function resolveScrollTarget(){
    const preferSelectors = [
      '#view-list-data-gaia',
      '.gaia-app-indexview-customview-html',
      '#ganttchart-container',
      '#ganttchart'
    ];
    for (const sel of preferSelectors){
      const el = document.querySelector(sel);
      if (el){
        const t = closestScrollable(el);
        if (t) return t;
      }
    }
    const cand = [
      document.querySelector('.recordlist-gaia'),
      document.querySelector('.gaia-app-index'),
      document.querySelector('.contents-body-gaia'),
      document.querySelector('#contents-area'),
      document.querySelector('.ocean-contents'),
      document.scrollingElement,
      document.documentElement,
      document.body
    ].filter(Boolean);
    let best = cand[0] || document.scrollingElement || document.documentElement || document.body;
    for (const el of cand){
      const room = el.scrollHeight - el.clientHeight;
      const bestRoom = best.scrollHeight - best.clientHeight;
      if (room > bestRoom) best = el;
    }
    return best;
  }

  // ===== Manual scroll lock (on target only) =====
  function lockManualScroll(target = resolveScrollTarget()) {
    if (document.body.getAttribute('data-ask-lockscroll') === '1') return;
    document.body.setAttribute('data-ask-lockscroll', '1');
    const preventWheel = (e) => e.preventDefault();
    const preventTouch = (e) => e.preventDefault();
    const preventKey = (e) => {
      const keys = ['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' ','Spacebar'];
      if (keys.includes(e.key) || keys.includes(e.code)) e.preventDefault();
    };
    target.addEventListener('wheel', preventWheel, { passive:false });
    target.addEventListener('touchmove', preventTouch, { passive:false });
    window.addEventListener('keydown', preventKey, { passive:false });
    window.__askUnlockScroll = () => {
      target.removeEventListener('wheel', preventWheel);
      target.removeEventListener('touchmove', preventTouch);
      window.removeEventListener('keydown', preventKey);
      document.body.removeAttribute('data-ask-lockscroll');
      delete window.__askUnlockScroll;
    };
  }

  // ===== Auto Scroll (element-based) =====
  function runAutoScroll({ target = resolveScrollTarget(), speedMsPerPx = 50, stopSec = 2, loops = 5, onFinish }) {
    let loop = 0;
    let timer = null;
    let paused = false;

    const atBottom = () => Math.ceil(target.scrollTop + target.clientHeight) >= (target.scrollHeight - 1);
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };

    const step = () => {
      if (paused) return;
      const before = target.scrollTop;
      target.scrollTop = before + 1;
      if (target.scrollTop === before) { // ターゲットが変わったかも → 再解決
        target = resolveScrollTarget();
        target.scrollTop = target.scrollTop + 1;
      }
      if (atBottom()) {
        loop += 1;
        if (loop >= loops) { clear(); onFinish && onFinish(); return; }
        clear();
        setTimeout(() => { target.scrollTop = 0; timer = setTimeout(step, Math.max(1, speedMsPerPx)); }, Math.max(0, stopSec * 1000));
        return;
      }
      timer = setTimeout(step, Math.max(1, speedMsPerPx));
    };

    return {
      start() { if (!timer) timer = setTimeout(step, Math.max(1, speedMsPerPx)); },
      stop()  { paused = true; clear(); },
      resume(){ if (paused){ paused = false; if (!timer) timer = setTimeout(step, Math.max(1, speedMsPerPx)); } },
      destroy(){ clear(); }
    };
  }

  // ===== Hotkeys: Shift+Esc pause/resume =====
  function registerHotkeys({ getScroller, getTarget }) {
    if (window.__askHotkeysBound) return () => {};
    window.__askHotkeysBound = true;
    let paused = false;

    const isTyping = (el) => {
      const t = (el && el.tagName || '').toLowerCase();
      return t === 'input' || t === 'textarea' || (el && el.isContentEditable);
    };
    function toast(msg){
      let s = document.getElementById('ask-toast-style');
      if (!s){
        s = document.createElement('style');
        s.id = 'ask-toast-style';
        s.textContent = `
          .ask-toast{position:fixed;left:50%;top:12px;transform:translateX(-50%);
            background:#111;color:#fff;padding:8px 12px;border-radius:10px;z-index:2147483647;
            box-shadow:0 4px 12px rgba(0,0,0,.25);font-size:12px;}
        `;
        document.head.appendChild(s);
      }
      const el = document.createElement('div');
      el.className = 'ask-toast'; el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(()=>el.remove(), 1600);
    }
    const onKey = (e) => {
      if (isTyping(e.target)) return;
      if (e.key === 'Escape' && e.shiftKey) {
        e.preventDefault();
        const sc = getScroller?.();
        if (!paused) {
          sc?.stop?.();
          window.__askUnlockScroll?.();
          paused = true;
          toast('一時停止: Shift+Escで再開');
        } else {
          sc?.resume?.();
          const t = getTarget?.();
          if (t) lockManualScroll(t);
          paused = false;
          toast('再開');
        }
      }
    };
    window.addEventListener('keydown', onKey, { passive:false });
    return () => {
      window.removeEventListener('keydown', onKey);
      delete window.__askHotkeysBound;
    };
  }

  // ===== Main (kintone event) =====
  function onIndexShow(ev) {
    // ビュー適用フィルタ（対象外なら何もしない）
    const cfg = loadConfig();
    if (Array.isArray(cfg.viewIds) && cfg.viewIds.length > 0) {
      const vid = Number(ev?.viewId);
      if (!cfg.viewIds.includes(vid)) return ev;
    }

    const host = document.body;
    if (!host || host.getAttribute(STATE_ATTR) === '1') return ev;
    host.setAttribute(STATE_ATTR, '1');

    addGlobalStyles();
    setZoom(cfg.zoom);
    ensureBottomSpacer();

    if (cfg.kiosk) {
      applyKioskHide();
      ensureBottomSpacer();
      lockManualScroll(resolveScrollTarget());
    }

    let cancelReload = () => {};
    if (cfg.reloadEnabled && cfg.intervalSec) {
      cancelReload = scheduleAutoReload(cfg.intervalSec);
    }

    let scroller = null;
    if (cfg.scrollEnabled) {
      scroller = runAutoScroll({
        target: resolveScrollTarget(),
        speedMsPerPx: clamp(cfg.speedMsPerPx ?? 50, 5, 2000),
        stopSec: clamp(cfg.stopSec ?? 2, 0, 60),
        loops: clamp(cfg.loops ?? 5, 1, 999),
        onFinish: () => location.reload() // ループ終了時は必ず更新
      });
      scroller.start();
    }

    const unregHotkeys = registerHotkeys({
      getScroller: () => scroller,
      getTarget: () => resolveScrollTarget()
    });

    window.addEventListener('beforeunload', () => {
      cancelReload();
      scroller?.destroy?.();
      unregHotkeys?.();
      window.__askUnlockScroll?.();
    }, { once: true });

    return ev;
  }

  // Register once
  if (typeof kintone !== 'undefined' && kintone.events) {
    kintone.events.on(EVENTS, onIndexShow);
  }
})();
