/*!
 * prototype.js — Excel-like Conditional Formatting (INDEX only, event.records-based)
 * Author: ChatGPT (kintoneプラグイン量産・試作)
 * ES2019 / No deps / IIFE / DOM非破壊
 * 対象画面: app.record.index.show（一覧のみ）
 */
(() => {
  'use strict';

  // ─────────────────────────────────────────────
  // Config: イベント（一覧のみ）
  // ─────────────────────────────────────────────
  const EVENTS = ['app.record.index.show'];

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn, {once:true}); }
  function injectStyle(id, css){
    if(document.getElementById(id)) return;
    const el=document.createElement('style'); el.id=id; el.textContent=css;
    document.head.appendChild(el);
  }
  function kbSetTheme(rootEl,name){ rootEl?.setAttribute('data-kb-theme',name); }
  function toast(msg){ const t=document.createElement('div'); t.className='kb-root kb-toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2200); }
  function parseNumber(x){ if(x==null) return null; const n=Number(String(x).replace(/,/g,'')); return Number.isFinite(n)?n:null; }
  function parseDateOnly(s){ if(!s) return null; const d=new Date(s); if(isNaN(d)) return null; return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function daysDiff(a,b){ const ms=24*60*60*1000; return Math.floor((a-b)/ms); }
  function todayDate(){ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  // ─────────────────────────────────────────────
  // Scoped CSS（UI + 条件付き書式クラス）
  // ─────────────────────────────────────────────
  const CSS = String.raw`
/* Theme tokens */
.kb-root{
--kb-bg:#f7f9fa; --kb-surface:#ffffff; --kb-text:#23272a; --kb-sub:#6b7280; --kb-line:#dfe3e8;
--kb-primary:#3498db; --kb-primary-ink:#ffffff; --kb-danger:#e74c3c; --kb-focus:#1e5fb2;
--kb-radius:4px; --kb-gap:8px; --kb-gap-lg:16px;
}
.kb-root[data-kb-theme="mono-blue"]{
--kb-bg:#f8fafc; --kb-surface:#ffffff; --kb-text:#1f2937; --kb-sub:#6b7280; --kb-line:#e5e7eb;
--kb-primary:#1E88E5; --kb-primary-ink:#ffffff; --kb-danger:#ef4444; --kb-focus:#1667b8;
}
.kb-root[data-kb-theme="mint"]{
--kb-bg:#f7f9f9; --kb-surface:#ffffff; --kb-text:#1f2937; --kb-sub:#627d77; --kb-line:#d7e2df;
--kb-primary:#26A69A; --kb-primary-ink:#ffffff; --kb-danger:#e57373; --kb-focus:#1f8c83;
}
.kb-root[data-kb-theme="soft-dark"]{
--kb-bg:#2c2f33; --kb-surface:#30343a; --kb-text:#f5f6fa; --kb-sub:#c5c7ce; --kb-line:#3c4047;
--kb-primary:#7289da; --kb-primary-ink:#0f1115; --kb-danger:#ef5350; --kb-focus:#4f63a8;
}
.kb-root[data-kb-theme="pale"]{
--kb-bg:#fdfdfd; --kb-surface:#ffffff; --kb-text:#0d1b2a; --kb-sub:#51606f; --kb-line:#e6eef5;
--kb-primary:#BBDEFB; --kb-primary-ink:#0D47A1; --kb-danger:#ff8a80; --kb-focus:#90CAF9;
}

/* Primitives */
.kb-root .kb-card{background:var(--kb-surface);border:1px solid var(--kb-line);border-radius:var(--kb-radius);padding:var(--kb-gap-lg)}
.kb-root .kb-btn{border:1px solid var(--kb-line);background:#fff;color:var(--kb-text);padding:6px 12px;border-radius:var(--kb-radius);cursor:pointer;font-size:13px;line-height:1.2}
.kb-root .kb-btn.kb-primary{background:var(--kb-primary);border-color:var(--kb-focus);color:var(--kb-primary-ink)}
.kb-root .kb-btn.kb-primary:hover{filter:brightness(0.95)}
.kb-root .kb-label{color:var(--kb-sub);font-size:12px}
.kb-root .kb-row{display:flex;gap:var(--kb-gap);align-items:center}
.kb-root .kb-hr{height:1px;background:var(--kb-line);margin:var(--kb-gap-lg) 0}
.kb-root .kb-toast{position:fixed;right:16px;bottom:16px;background:#111a;color:#fff;padding:8px 12px;border-radius:8px;opacity:.95}

/* Conditional formatting（背景+文字色セット、セルTDに付与） */
td.puchi-bg-red{ background:#fde8e8 !important; color:#c0392b !important; }
td.puchi-bg-green{ background:#e8f7ec !important; color:#1e824c !important; }
td.puchi-bg-yellow{ background:#fff7da !important; color:#8a6d3b !important; }
`;

  // ─────────────────────────────────────────────
  // ルール定義（一覧のみ / screens:{index:true}）
  // effect は bg のみ（文字色はクラスで自動セット）
  // フィールドコードは実アプリに合わせてください。
  // ─────────────────────────────────────────────
  const SAMPLE_RULES = [
    // 例: 数値 > 100000 → 赤系
    { enabled:true, screens:{index:true}, field:'Amount', type:'number', op:'>', value:100000, effect:{ bg:'red' } },
    // 例: ステータス に "URGENT" を含む → 黄系
    { enabled:true, screens:{index:true}, field:'ステータス', type:'text',   op:'contains', value:'URGENT', effect:{ bg:'yellow' } },
    // 例: ターゲット が30日より古い → 緑系
    { enabled:true, screens:{index:true}, field:'ターゲット', type:'date',  op:'olderThanDays', value:30, effect:{ bg:'green' } }
  ];

  // ─────────────────────────────────────────────
  // 評価（event.records の真値を使用）
  // ─────────────────────────────────────────────
  function testRule(rule, rawValue){
    const t = rule.type, op = rule.op;

    if (t === 'empty'){
      const empty = rawValue == null || String(rawValue) === '' || (Array.isArray(rawValue) && rawValue.length===0);
      return op === 'isEmpty' ? empty : !empty;
    }

    if (t === 'number'){
      const n = parseNumber(rawValue);
      if (n == null) return false;
      const v = parseNumber(rule.value);
      if (op === '=') return n === v;
      if (op === '!=') return n !== v;
      if (op === '>') return n > v;
      if (op === '>=') return n >= v;
      if (op === '<') return n < v;
      if (op === '<=') return n <= v;
      if (op === 'between' || op === 'notBetween'){
        const [a,b] = Array.isArray(rule.value)? rule.value : [v,v];
        const lo = Math.min(a,b), hi = Math.max(a,b);
        const ok = (n >= lo && n <= hi);
        return op === 'between' ? ok : !ok;
      }
      return false;
    }

    if (t === 'text'){
      const s = String(rawValue ?? '');
      if (op === 'contains') return s.includes(String(rule.value ?? ''));
      if (op === 'notContains') return !s.includes(String(rule.value ?? ''));
      if (op === '=') return s === String(rule.value ?? '');
      if (op === '!=') return s !== String(rule.value ?? '');
      if (op === 'regex'){ try{ return new RegExp(String(rule.value||''), 'i').test(s); }catch{ return false; } }
      return false;
    }

    if (t === 'date'){
      // 日付フィールドの .value は 'YYYY-MM-DD'
      const d = parseDateOnly(
        rawValue?.start || rawValue?.date || rawValue // range対策
      ) || parseDateOnly(rawValue);
      if (!d) return false;
      const td = todayDate();
      if (op === 'today') return daysDiff(d, td) === 0;
      if (op === 'yesterday') return daysDiff(d, td) === -1;
      if (op === 'tomorrow') return daysDiff(d, td) === 1;
      if (op === 'past') return d < td;
      if (op === 'future') return d > td;
      if (op === 'withinDays'){ const n=parseNumber(rule.value)??0; return Math.abs(daysDiff(d, td)) <= n; }
      if (op === 'olderThanDays'){ const n=parseNumber(rule.value)??0; return Math.abs(daysDiff(d, td)) > n; }
      return false;
    }

    return false;
  }

  // ─────────────────────────────────────────────
  // DOM適用（必ず TD に色を付ける）
  // ─────────────────────────────────────────────
  function applyEffect(cellLike, effect){
    if (!cellLike) return;
    const td = cellLike.closest ? (cellLike.closest('td') || cellLike) : cellLike;
    if(effect.bg==='red') td.classList.add('puchi-bg-red');
    else if(effect.bg==='green') td.classList.add('puchi-bg-green');
    else if(effect.bg==='yellow') td.classList.add('puchi-bg-yellow');
  }

  function clearEffects(root){
    if(!root) root = document;
    root.querySelectorAll('td.puchi-bg-red,td.puchi-bg-green,td.puchi-bg-yellow')
      .forEach(td => td.classList.remove('puchi-bg-red','puchi-bg-green','puchi-bg-yellow'));
  }

  // ─────────────────────────────────────────────
  // 一覧：fieldCode→セル要素配列
  // ─────────────────────────────────────────────
  function getElementsIndex(fieldCode){
    try{ return kintone.app.getFieldElements(fieldCode) || []; }catch(_){ return []; }
  }

  // event.records から値を取得
  function getRecordValue(rec, field){
    const f = rec?.[field];
    if (!f) return null;
    return ('value' in f) ? f.value : f;
  }

  // ─────────────────────────────────────────────
  // ルール実行（INDEX）— 描画待ち不要：records 真値で評価
  // ─────────────────────────────────────────────
  function runRulesIndex(event, rules){
    const active = (rules||[]).filter(r => r.enabled && r.screens?.index);
    if(active.length === 0) return;

    clearEffects(document);

    for (const rule of active){
      const cells = getElementsIndex(rule.field) || [];
      if (!cells.length){ console.warn('[puchi] field not found or not on this view:', rule.field); continue; }
      const recs = event?.records || [];
      const len = Math.min(cells.length, recs.length);
      for (let i=0; i<len; i++){
        const raw = getRecordValue(recs[i], rule.field); // ★ 真値で判定
        if (testRule(rule, raw)) applyEffect(cells[i], rule.effect);
      }
    }
  }

  // ─────────────────────────────────────────────
  // ヘッダUI（非破壊、テーマ切替維持）
  // ─────────────────────────────────────────────
  function mountUI(storage){
    const host = kintone?.app?.getHeaderMenuSpaceElement?.();
    if(!host) return;

    const root=document.createElement('div');
    root.className='kb-root';
    root.dataset.kbTheme=storage.theme || 'light';

    const bar=document.createElement('div');
    bar.className='kb-card kb-row';
    // 静的テンプレのみ（動的値は使わない）
    bar.innerHTML = '<span class="kb-label">条件付き書式 / Conditional Formatting</span> \
<button class="kb-btn kb-primary" title="Run">実行 / Run</button> \
<button class="kb-btn" title="Settings">設定 / Settings</button> \
<div class="kb-hr" style="flex:0 0 1px;opacity:.001"></div> \
<button class="kb-btn" title="Theme">テーマ / Theme</button>';

    const [runBtn,settingsBtn,themeBtn] = bar.querySelectorAll('button');
    runBtn.addEventListener('click', ()=>{ try{ runRulesIndex(storage.lastEvent||{}, storage.rules||SAMPLE_RULES); toast('実行しました / Applied'); }catch(e){ console.error(e); toast('エラー / Error'); } });
    settingsBtn.addEventListener('click',()=>toast('この試作は設定不要 / No settings (prototype)'));
    themeBtn.addEventListener('click',()=>{ const order=['light','mono-blue','mint','soft-dark','pale']; const cur=root.dataset.kbTheme||'light'; const next=order[(order.indexOf(cur)+1)%order.length]; kbSetTheme(root,next); storage.theme=next; try{ localStorage.setItem('puchi-theme', next);}catch(_){} });

    root.appendChild(bar);
    host.appendChild(root);
  }

  // ─────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────
  const storage = { rules: SAMPLE_RULES, theme: (localStorage.getItem('puchi-theme')||'light'), lastEvent: null };

  ready(()=>{ injectStyle('kb-style-prototype', CSS); mountUI(storage); });

  kintone.events.on('app.record.index.show', (event) => {
    try{
      storage.lastEvent = event;
      runRulesIndex(event, storage.rules);
    }catch(e){ console.error(e); toast('エラー / Error'); }
    return event;
  });
})();
