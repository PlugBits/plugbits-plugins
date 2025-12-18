(() => {
  'use strict';
  const PLUGIN_ID = kintone.$PLUGIN_ID;

  // state
  const $ = (id) => /** @type {HTMLElement|null} */(document.getElementById(id));
  let viewMap = new Map();          // id:number -> {id,name}
  let selectedViewIds = [];         // number[]

  // ---- ビュー一覧を取得してセレクトに詰める ----
  async function buildViewDropdown() {
    const appId = kintone.app.getId();
    const res = await kintone.api('/k/v1/app/views.json', 'GET', { app: appId });
    // res.views は { "ビュー名": { id, name, ... } } 形式
    const arr = Object.values(res.views || {});
    // index → name 順
    arr.sort((a,b) => (a.index ?? 0) - (b.index ?? 0) || a.name.localeCompare(b.name, 'ja'));
    viewMap = new Map(arr.map(v => [Number(v.id), { id: Number(v.id), name: v.name }]));
    const sel = /** @type {HTMLSelectElement} */($('viewSelect'));
    if (!sel) return;
    sel.innerHTML = '';
    for (const v of arr) {
      const opt = document.createElement('option');
      opt.value = String(v.id);
      opt.textContent = `${v.name} (ID:${v.id})`;
      sel.appendChild(opt);
    }
  }

  // ---- 選択済みのチップ表示 ----
  function renderSelected() {
    const host = $('viewList');
    if (!host) return;
    host.textContent = '';
    for (const id of selectedViewIds) {
      const meta = viewMap.get(Number(id));
      const chip = document.createElement('span');
      chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid #cbd5e1;border-radius:9999px;';
      const label = document.createElement('span');
      label.textContent = meta ? `${meta.name} (ID:${meta.id})` : `ID:${id} (不明)`;
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'kb-btn';
      close.style.cssText = 'padding:0 6px;border-radius:9999px;';
      close.textContent = '×';
      close.addEventListener('click', () => {
        selectedViewIds = selectedViewIds.filter(x => Number(x) !== Number(id));
        renderSelected();
      });
      chip.append(label, close);
      host.appendChild(chip);
    }
  }

  // ---- 設定の復元 ----
  function restore() {
    const cfg = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
    const b = (v) => v === 'true';
    const n = (v, d='') => (v == null || v === '' ? d : String(Number(v)));

    const elKiosk = /** @type {HTMLInputElement|null} */($('kiosk'));
    if (elKiosk) elKiosk.checked = b(cfg.kiosk);
    const elScroll = /** @type {HTMLInputElement|null} */($('scrollEnabled'));
    if (elScroll) elScroll.checked = b(cfg.scrollEnabled);
    const elSpeed = /** @type {HTMLInputElement|null} */($('speedMsPerPx'));
    if (elSpeed) elSpeed.value = n(cfg.speedMsPerPx, '50');
    const elStop = /** @type {HTMLInputElement|null} */($('stopSec'));
    if (elStop) elStop.value = n(cfg.stopSec, '2');
    const elStopTop = /** @type {HTMLInputElement|null} */($('stopTopSec'));
    if (elStopTop) elStopTop.value = n(cfg.stopTopSec, '0');
    const elLoops = /** @type {HTMLInputElement|null} */($('loops'));
    if (elLoops) elLoops.value = n(cfg.loops, '5');
    const elReload = /** @type {HTMLInputElement|null} */($('reloadEnabled'));
    if (elReload) elReload.checked = b(cfg.reloadEnabled);
    const elInterval = /** @type {HTMLInputElement|null} */($('intervalSec'));
    if (elInterval) elInterval.value = n(cfg.intervalSec, '180');
    const elZoom = /** @type {HTMLInputElement|null} */($('zoom'));
    if (elZoom) elZoom.value = n(cfg.zoom, '1.2');

    // 新規：viewIds（JSON配列）
    try {
      selectedViewIds = cfg.viewIds ? JSON.parse(cfg.viewIds).map(Number).filter(Number.isFinite) : [];
    } catch { selectedViewIds = []; }

    renderSelected();
  }

  // ---- 設定の保存 ----
  function save() {
    const out = {
      kiosk: String((/** @type {HTMLInputElement} */($('kiosk')))?.checked || false),
      scrollEnabled: String((/** @type {HTMLInputElement} */($('scrollEnabled')))?.checked || false),
      speedMsPerPx: (/** @type {HTMLInputElement} */($('speedMsPerPx')))?.value.trim() || '',
      stopSec: (/** @type {HTMLInputElement} */($('stopSec')))?.value.trim() || '',
      stopTopSec: (/** @type {HTMLInputElement} */($('stopTopSec')))?.value.trim() || '',
      loops: (/** @type {HTMLInputElement} */($('loops')))?.value.trim() || '',
      reloadEnabled: String((/** @type {HTMLInputElement} */($('reloadEnabled')))?.checked || false),
      intervalSec: (/** @type {HTMLInputElement} */($('intervalSec')))?.value.trim() || '',
      zoom: (/** @type {HTMLInputElement} */($('zoom')))?.value.trim() || '',
      viewIds: JSON.stringify(selectedViewIds)
    };

    // 軽バリデーション（数値）
    for (const k of ['speedMsPerPx','stopSec','stopTopSec','loops','intervalSec','zoom']) {
      const v = out[k];
      if (v !== '' && !Number.isFinite(Number(v))) {
        alert(`${k} は数値で入力してください。`);
        return;
      }
    }

    kintone.plugin.app.setConfig(out, () => {
      alert('保存しました。アプリ設定へ戻ります。');
      history.back();
    });
  }

  // ---- 初期化（保存ボタンを最優先で結線）----
  (function initConfigUI() {
    let bound = false;

    function wire() {
      if (bound) return true;
      const saveBtn   = $('save');
      const cancelBtn = $('cancel');
      const addBtn    = $('addView');
      const viewSel   = /** @type {HTMLSelectElement} */($('viewSelect'));

      if (!saveBtn || !cancelBtn) return false; // まだDOM未挿入

      // 1) 既存設定を復元（ビュー名は後で再描画）
      restore();

      // 2) 先にリスナーを結線
      saveBtn.addEventListener('click', save);
      cancelBtn.addEventListener('click', () => history.back());

      if (addBtn && viewSel) {
        addBtn.setAttribute('disabled', 'true'); // ビュー一覧が来るまで一時無効
        addBtn.addEventListener('click', () => {
          const id = Number(viewSel.value);
          if (!Number.isFinite(id)) return;
          if (!selectedViewIds.includes(id)) {
            selectedViewIds.push(id);
            renderSelected();
          }
        });
      }

      // 3) 非同期でビュー一覧を取得 → ドロップダウン構築 → チップを名前付きで再描画
      (async () => {
        try {
          await buildViewDropdown();
          renderSelected();                 // ID→名前に置き換え
          addBtn?.removeAttribute('disabled');
        } catch (e) {
          console.error(e);
          alert('ビュー一覧の取得に失敗しました。権限をご確認ください。');
        }
      })();

      bound = true;
      return true;
    }

    if (!wire()) {
      // DOMが差し込まれた後にも再試行
      document.addEventListener('readystatechange', () => {
        if (document.readyState !== 'loading') wire();
      });
      const mo = new MutationObserver(() => { if (wire()) mo.disconnect(); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  })();
})();
