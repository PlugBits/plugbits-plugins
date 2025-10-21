
/* plugin.js — Modal slider (polished UI v2 + half-year support), PNG icon, config-aware */
(function(PLUGIN_ID){
  'use strict';
  const EVENTS = ['app.record.index.show'];
  const DOCK_ID = `kb-dock-${PLUGIN_ID}`;

  // i18n
  function getLang(){ try{ return (kintone.getLoginUser().language||'ja').toLowerCase(); }catch(_){ return 'ja'; } }
  const isEN = getLang().indexOf('en')===0;
  const T = (ja,en)=> (isEN?en:ja);

   // CSS (same as previous v2)
  function injectStyle(){
    if (document.getElementById('kb-style-modal-slider')) return;
    const css = `
    .kb-root{
      --kb-accent:#2563eb; --kb-accent-ink:#fff;
      --kb-bg:#ffffff; --kb-text:#0f172a; --kb-sub:#64748b; --kb-line:#e5e7eb;
      --kb-chip:#f1f5f9; --kb-chip-border:#e5e7eb; --kb-hover:#f8fafc;
    }
    .kb-root.kb-dock{
      display:inline-flex;
      gap:6px;
      align-items:center;
      vertical-align:middle;
      align-self:center;
      flex-shrink:0;
    }
    .kb-root .kb-icon-btn{
      width:48px;height:48px;border:1px solid var(--kb-line);border-radius:0;background:var(--kb-bg);
      display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:var(--kb-text);margin-right: 8px;
      box-shadow:0 1px 0 rgba(0,0,0,.02);
    }
    .kb-root .kb-icon-btn:hover{ background:var(--kb-hover) } 
    .kb-root .kb-icon-btn svg, .kb-root .kb-icon-btn img{ width:48px;height:48px;display:block; }
    .kb-root .kb-icon-btn img{ object-fit:contain; image-rendering:auto; }

    .kb-root .kb-backdrop{
      position:fixed; inset:0; background:rgba(15,23,42,.36); display:none; z-index:9998;
      backdrop-filter: blur(5px) saturate(120%);
      -webkit-backdrop-filter: blur(5px) saturate(120%);
    }
    .kb-root .kb-modal{
      position:fixed; top:8%; left:50%; transform:translateX(-50%);
      background:var(--kb-bg); border:1px solid var(--kb-line); border-radius:14px; display:none; z-index:9999;
      width:min(820px, calc(100% - 48px)); box-shadow:0 18px 50px rgba(0,0,0,.22); overflow:hidden;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif;
    }
    .kb-root[data-modal="1"] .kb-backdrop{ display:block }
    .kb-root[data-modal="1"] .kb-modal{ display:block; animation:kbFadeUp .18s ease }
    .kb-root .kb-modal-slider{
      position:fixed;
      top:8%;
      left:50%;
      right:auto;
      bottom:auto;
      transform:translateX(-50%);
      width:min(820px, calc(100% - 48px));
      max-width:min(820px, calc(100% - 48px));
      max-height:calc(100vh - 120px);
      display:none;
      white-space:normal;
      word-wrap:normal;
      inset:auto;
      margin:0;
      overflow:hidden;
      box-sizing:border-box;
    }
    .kb-root .kb-modal-slider *{
      white-space:normal;
    }
    .kb-root[data-modal="1"] .kb-modal-slider{
      display:block;
      animation:kbFadeUp .18s ease;
    }
    @keyframes kbFadeUp{ from{ opacity:0; transform:translate(-50%, 6px) } to{ opacity:1; transform:translate(-50%, 0) } }

    .kb-root .kb-modal-head{ display:flex; align-items:center; justify-content:space-between; gap:8px; padding:18px 20px; border-bottom:1px solid var(--kb-line); }
    .kb-root .kb-title{ font-size:18px; font-weight:800; color:var(--kb-text); letter-spacing:.01em; }
    .kb-root .kb-x{ border:1px solid var(--kb-line); background:var(--kb-bg); width:30px; height:30px; border-radius:8px; cursor:pointer; }
    .kb-root .kb-x:hover{ background:var(--kb-hover); }

    .kb-root .kb-sheet{ display:flex; flex-direction:column; gap:22px; padding:18px 20px 22px; }
    .kb-root .kb-desc{ color:var(--kb-sub); font-size:12px; }

    .kb-root .kb-chips{ display:flex; flex-wrap:wrap; gap:10px; }
    .kb-root .kb-chip{ border:1px solid var(--kb-chip-border); background:var(--kb-chip); color:var(--kb-text); padding:8px 12px; border-radius:999px; font-size:12px; cursor:pointer; }
    .kb-root .kb-chip:hover{ background:var(--kb-hover); }
    .kb-root .kb-chip.kb-on{ background:var(--kb-accent); border-color:var(--kb-accent); color:var(--kb-accent-ink); }

    .kb-root .kb-block{ display:flex; flex-direction:column; gap:14px; }
    .kb-root .kb-row-center{ display:flex; gap:10px; align-items:center; justify-content:center; width:100%; }
    .kb-root .kb-date{border:1px solid var(--kb-line);border-radius:10px;padding:10px 12px;font-size:13px; background:#fff; min-width:180px}
    .kb-root .kb-date:focus{ outline:2px solid color-mix(in oklab, var(--kb-accent) 30%, transparent); outline-offset:1px }

    .kb-root .kb-rng{ position:relative; width:100%; height:42px; }
    .kb-root .kb-rail{ position:absolute; left:0; right:0; top:14px; height:12px; border-radius:999px; background:#d7dbe2; border:1px solid #c3c8cf; }
    .kb-root .kb-active{ position:absolute; left:0; top:14px; height:12px; border-radius:999px; background:linear-gradient(90deg, var(--kb-accent), var(--kb-accent)); pointer-events:none; }
    .kb-root .kb-range{ position:absolute; left:0; right:0; bottom:0; height:28px; width:100%; background:transparent; appearance:none; -webkit-appearance:none; pointer-events:none; }
    .kb-root .kb-range::-webkit-slider-runnable-track{ height:0; background:transparent; border:none }
    .kb-root .kb-range::-moz-range-track{ height:0; background:transparent; border:none }
    .kb-root .kb-range::-webkit-slider-thumb{ appearance:none; width:18px; height:18px; border-radius:50%; background:var(--kb-accent); border:1px solid rgba(0,0,0,.15); box-shadow:0 2px 0 0 #fff, 0 2px 6px rgba(0,0,0,.25); transform:translateY(7px); pointer-events:auto; }
    .kb-root .kb-range::-moz-range-thumb{ width:18px; height:18px; border-radius:50%; background:var(--kb-accent); border:1px solid rgba(0,0,0,.15); box-shadow:0 2px 0 0 #fff, 0 2px 6px rgba(0,0,0,.25); transform:translateY(7px); pointer-events:auto; }

    .kb-root .kb-actions{ display:flex; flex-direction:column; align-items:center; gap:10px; }
    .kb-root .kb-btn{ border:1px solid var(--kb-line); background:var(--kb-bg); color:var(--kb-text); padding:12px 14px; border-radius:12px; font-size:13px; cursor:pointer; }
    .kb-root .kb-btn.kb-primary{ background:var(--kb-accent); border-color:var(--kb-accent); color:var(--kb-accent-ink); font-weight:600; width:clamp(180px, 42%, 340px); }
    .kb-root .kb-link{ background:transparent; border:none; color:var(--kb-sub); text-decoration:underline; padding:2px; align-self:center; cursor:pointer; }
    `;
    const el=document.createElement('style'); el.id='kb-style-modal-slider'; el.textContent=css; document.head.appendChild(el);
  } 

  // utils
  const pad2=n=>String(n).padStart(2,'0');
  const fmtYMD=d=>`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  function normalizeYMD(s){ if(!s) return ''; const t=String(s).trim().replace(/[./]/g,'-'); const a=t.split('-'); if(a.length!==3) return ''; const y=a[0],m=pad2(+a[1]||0),d=pad2(+a[2]||0); if(!/^\d{4}$/.test(y)||m==='00'||d==='00') return ''; return `${y}-${m}-${d}`; }
  const parseYMD=s=>{ const n=normalizeYMD(s); if(!n) return new Date(NaN); const a=n.split('-').map(Number); return new Date(a[0],a[1]-1,a[2]); };
  const addDays=(d,n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; };
  const daysBetween=(a,b)=> Math.round((parseYMD(b)-parseYMD(a))/86400000);

  const currentQuery=()=>decodeURIComponent(new URL(location.href).searchParams.get('query')||'');
  const sameQuery=q=>currentQuery().trim()===String(q||'').trim();
  const buildQuery=(f,s,e)=> (f&&s&&e) ? `${f} >= "${s}" and ${f} <= "${e}"` : '';

  const startOfWeek=(date,startIdx)=>{ const t=new Date(date.getFullYear(),date.getMonth(),date.getDate()); const wd=t.getDay(); const diff=(wd-startIdx+7)%7; return addDays(t,-diff); };
  const endOfWeek=(date,startIdx)=> addDays(startOfWeek(date,startIdx),6);

  // --- preset key aliasing (supports Japanese synonyms) ---
  function canonKey(k){
    switch(String(k||'').trim()){
      case '今半期': case 'this-half': case 'current-half': case 'half-this': return 'this-half';
      case '前半期': case 'last-half': case 'previous-half': case 'half-last': return 'last-half';
      default: return String(k||'');
    }
  }

  // config
  function getConfigSafe(){
    try{
      const raw = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
      const parsePresets = (p)=>{
        if (!p) return ['all','today','yesterday','last-7','last-30','this-week','last-week','this-month','last-month','this-quarter','last-quarter','this-half','last-half','this-year'];
        try{ if (Array.isArray(p)) return p.map(canonKey); return JSON.parse(p).map(canonKey); }
        catch{ return String(p).split(',').map(s=>canonKey(s.trim())).filter(Boolean); }
      };
      const parseViews = (v)=>{
        const normalize = (list)=>Array.from(new Set((list||[]).map(x=>String(x).trim()).filter(Boolean)));
        if (!v) return [];
        try{
          if (Array.isArray(v)) return normalize(v);
          const parsed = JSON.parse(v);
          if (Array.isArray(parsed)) return normalize(parsed);
        }catch(_){ /* noop */ }
        return normalize(String(v).split(','));
      };
      return {
        dateField: raw.dateField || raw.dateFieldCode || '',
        weekStart: Number(raw.weekStart || 0),
        defaultPreset: canonKey(raw.defaultPreset || 'last-30'),
        theme: raw.theme || 'light',
        presets: parsePresets(raw.presets),
        targetViews: parseViews(raw.targetViews)
      };
    }catch(_){
      return {dateField:'', weekStart:0, defaultPreset:'last-30', theme:'light', presets:['all','today','yesterday','last-7','last-30','this-week','last-week','this-month','last-month','this-quarter','last-quarter','this-half','last-half','this-year'], targetViews: []};
    }
  }

  function shouldApplyToView(cfg, viewId){
    const list = Array.isArray(cfg?.targetViews) ? cfg.targetViews : [];
    if (!list.length) return true;
    if (viewId === null || viewId === undefined) return false;
    const id = String(viewId);
    return list.some(v => String(v) === id);
  }

  function rangeForKey(key,minY,maxY,weekStartIdx){
    const k = canonKey(key);
    const t=new Date(), y=t.getFullYear(), m=t.getMonth();
    switch(k){
      case 'all': return {start:normalizeYMD(minY), end:normalizeYMD(maxY)};
      case 'today': return {start:fmtYMD(t), end:fmtYMD(t)};
      case 'yesterday':{ const d=addDays(t,-1); return {start:fmtYMD(d), end:fmtYMD(d)}; }
      case 'last-7': return {start:fmtYMD(addDays(t,-6)), end:fmtYMD(t)};
      case 'last-30': return {start:fmtYMD(addDays(t,-29)), end:fmtYMD(t)};
      case 'this-week':{ const s=startOfWeek(t,weekStartIdx); return {start:fmtYMD(s), end:fmtYMD(endOfWeek(t,weekStartIdx))}; }
      case 'last-week':{ const s=addDays(startOfWeek(t,weekStartIdx),-7); return {start:fmtYMD(s), end:fmtYMD(addDays(s,6))}; }
      case 'this-month': return {start:fmtYMD(new Date(y,m,1)), end:fmtYMD(new Date(y,m+1,0))};
      case 'last-month':{ const s=new Date(y,m-1,1); return {start:fmtYMD(s), end:fmtYMD(new Date(s.getFullYear(),s.getMonth()+1,0))}; }
      case 'this-quarter':{ const qs=Math.floor(m/3)*3; const s=new Date(y,qs,1); return {start:fmtYMD(s), end:fmtYMD(new Date(y,qs+3,0))}; }
      case 'last-quarter':{ const qs=Math.floor((m-3)/3)*3; const s=new Date(y,qs,1); return {start:fmtYMD(s), end:fmtYMD(new Date(y,qs+3,0))}; }
      case 'this-half':{ const first = (m<6); const s = new Date(y, first?0:6, 1); const e = new Date(y, first?6:12, 0); return {start:fmtYMD(s), end:fmtYMD(e)}; }
      case 'last-half':{ const first = (m<6); const s = new Date(first?y-1:y, first?6:0, 1); const e = new Date(first?y-1:y, first?12:6, 0); return {start:fmtYMD(s), end:fmtYMD(e)}; }
      case 'this-year': return {start:`${y}-01-01`, end:`${y}-12-31`};
      case 'last-year':{ const yy=y-1; return {start:`${yy}-01-01`, end:`${yy}-12-31`}; }
      default: return {start:'', end:''};
    }
  }

  async function findFirstDateField(){
    try{
      const app=kintone.app.getId();
      const res=await kintone.api(kintone.api.url('/k/v1/app/form/fields',true),'GET',{app});
      let first=''; (function walk(map){ Object.values(map||{}).forEach(f=>{ if(first) return; if(f.type==='SUBTABLE') return walk(f.fields); if(f.type==='DATE'||f.type==='DATETIME') first=f.code; }); })(res.properties);
      return first;
    }catch{ return ''; }
  }
  async function fetchEdgeDates(field){
    const app=kintone.app.getId();
    const one=async(order)=>{
      const r=await kintone.api(kintone.api.url('/k/v1/records',true),'GET',{ app, query:`${field} != "" order by ${field} ${order} limit 1`, fields:[field] });
      const rec=(r.records&&r.records[0])||null; return (rec&&rec[field])? normalizeYMD(rec[field].value) : null;
    };
    const min=await one('asc'); const max=await one('desc'); return {min,max};
  }

  // 統一テーマ準拠：単色・currentColor・24pxのスライダーアイコン
  function sliderSVG(){
    return (
      
      '<svg version="1.1" id="_x32_" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512" style="width: 32px; height: 32px; opacity: 1;" xml:space="preserve">'+
      '<style type="text/css">.st0{fill:#4B4B4B;}</style>'+
      '<g>'+
        '<path class="st0" d="M149.193,103.525c15.994,0,28.964-12.97,28.964-28.972V28.964C178.157,12.97,165.187,0,149.193,0C133.19,0,120.22,12.97,120.22,28.964v45.589C120.22,90.556,133.19,103.525,149.193,103.525z" style="fill: rgb(168, 168, 168);"></path>'+
        '<path class="st0" d="M362.815,103.525c15.995,0,28.964-12.97,28.964-28.972V28.964C391.78,12.97,378.81,0,362.815,0c-16.002,0-28.972,12.97-28.972,28.964v45.589C333.843,90.556,346.813,103.525,362.815,103.525z" style="fill: rgb(168, 168, 168);"></path>'+
        '<path class="st0" d="M435.164,41.288h-17.925v33.265c0,30.017-24.414,54.431-54.423,54.431c-30.017,0-54.431-24.414-54.431-54.431V41.288H203.616v33.265c0,30.017-24.415,54.431-54.423,54.431c-30.016,0-54.432-24.414-54.432-54.431V41.288H76.836c-38.528,0-69.763,31.234-69.763,69.763v331.186C7.073,480.766,38.309,512,76.836,512h358.328c38.528,0,69.763-31.234,69.763-69.763V111.051C504.927,72.522,473.692,41.288,435.164,41.288z M450.023,429.989c0,17.826-14.503,32.328-32.329,32.328H94.306c-17.826,0-32.329-14.502-32.329-32.328V170.877h388.047V429.989z" style="fill: rgb(168, 168, 168);"></path>'+
        '<rect x="220.58" y="334.908" class="st0" width="70.806" height="70.798" style="fill: rgb(168, 168, 168);"></rect>'+
        '<rect x="110.839" y="334.908" class="st0" width="70.808" height="70.798" style="fill: rgb(168, 168, 168);"></rect>'+
        '<rect x="330.338" y="225.151" class="st0" width="70.824" height="70.807" style="fill: rgb(168, 168, 168);"></rect>'+
        '<rect x="330.338" y="334.908" class="st0" width="70.824" height="70.798" style="fill: rgb(168, 168, 168);"></rect>'+
        '<rect x="220.58" y="225.151" class="st0" width="70.806" height="70.807" style="fill: rgb(168, 168, 168);"></rect>'+
        '<rect x="110.839" y="225.151" class="st0" width="70.808" height="70.807" style="fill: rgb(168, 168, 168);"></rect>'+
      '</g>'+
      '</svg>'

    );
  }

  function getHeaderSpace(){
    return kintone.app?.getHeaderMenuSpaceElement?.() || null; // 一覧専用
  }

  function mountUI(cfgOverride){
    const host = kintone.app?.getHeaderMenuSpaceElement?.();
    if (!host) return null;

    const existing = document.getElementById(DOCK_ID);
    if (existing) {
      const bag = existing.__kbUi;
      if (bag) {
        if (cfgOverride) {
          bag.cfg = cfgOverride;
          if (cfgOverride.theme) existing.setAttribute('data-kb-theme', cfgOverride.theme);
          else existing.removeAttribute('data-kb-theme');
        }
        return bag;
      }
      if (existing.parentNode) existing.parentNode.removeChild(existing);
    }

    injectStyle();

    // ← dock（自前コンテナ）を作る
    const root = document.createElement('span');
    root.className = 'kb-root kb-dock';
    root.id = DOCK_ID;
    root.dataset.kbPid = PLUGIN_ID;

    const cfg = cfgOverride || getConfigSafe();
    if (cfg.theme) root.setAttribute('data-kb-theme', cfg.theme);
    else root.removeAttribute('data-kb-theme');

    // アイコン
    const icon = document.createElement('button');
    icon.type = 'button';
    icon.className = 'kb-icon-btn'; // 既存CSSに合わせるなら 'kb-icon-btn' or 'kp-icon-btn' など
    icon.title = T('一覧日付スライダー','Open (modal)');
    icon.innerHTML = sliderSVG();
    root.appendChild(icon);

    // モーダル
    const backdrop = document.createElement('div'); backdrop.className = 'kb-backdrop';
    const modal    = document.createElement('div');
    modal.className = 'kb-modal kb-modal-slider';
    Object.assign(modal.style, {
      position: 'fixed',
      top: '8%',
      left: '50%',
      right: 'auto',
      bottom: 'auto',
      transform: 'translateX(-50%)',
      width: 'min(820px, calc(100% - 48px))',
      maxWidth: 'min(820px, calc(100% - 48px))',
      maxHeight: 'calc(100vh - 120px)',
      whiteSpace: 'normal',
      wordWrap: 'normal',
      margin: '0',
      overflow: 'hidden',
      boxSizing: 'border-box'
    });
    const head     = document.createElement('div'); head.className = 'kb-modal-head';
    const title    = document.createElement('div'); title.className = 'kb-title';
    title.textContent = T('一覧日付スライダー','Index Date Slider');
    const x        = document.createElement('button'); x.className = 'kb-x'; x.innerHTML = '×'; x.title = T('閉じる','Close');
    head.appendChild(title); head.appendChild(x);

    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const titleId = `kbms-title-${PLUGIN_ID}`;
    title.id = titleId;
    modal.setAttribute('aria-labelledby', titleId);

    const sheet = document.createElement('div'); sheet.className = 'kb-sheet';
    const desc  = document.createElement('div'); desc.className  = 'kb-desc';
    desc.textContent = T('範囲を選択して「適用」を押すと一覧を絞り込みます。','Choose a range, then Apply to filter the list.');
    const chips = document.createElement('div'); chips.className = 'kb-chips';

    const block = document.createElement('div'); block.className = 'kb-block';
    const row   = document.createElement('div'); row.className   = 'kb-row-center';
    const from  = document.createElement('input'); from.type='date'; from.className='kb-date';
    const til   = document.createElement('span'); til.textContent='〜'; til.style.color='var(--kb-sub)';
    const to    = document.createElement('input'); to.type='date'; to.className='kb-date';
    row.append(from, til, to);

    const rbox  = document.createElement('div'); rbox.className='kb-rng';
    const rail  = document.createElement('div'); rail.className='kb-rail';
    const active= document.createElement('div'); active.className='kb-active';
    const r1    = Object.assign(document.createElement('input'), {type:'range',className:'kb-range',step:'1',title:''});
    const r2    = Object.assign(document.createElement('input'), {type:'range',className:'kb-range',step:'1',title:''});
    rbox.append(rail, active, r1, r2);

    block.append(row, rbox);

    const actions = document.createElement('div'); actions.className='kb-actions';
    const apply   = document.createElement('button'); apply.className='kb-btn kb-primary'; apply.textContent=T('適用','Apply');
    const reset   = document.createElement('button'); reset.className='kb-link';            reset.textContent=T('解除','Reset');
    actions.append(apply, reset);

    sheet.append(desc, chips, block, actions);
    modal.appendChild(head); modal.appendChild(sheet);
    root.append(backdrop, modal);
    // ★ 純正アイコン群の「右」に出したいので、末尾に append
    host.appendChild(root);

    const close = () => root.removeAttribute('data-modal');
    icon.addEventListener('click', () => { root.setAttribute('data-modal','1'); });
    backdrop.addEventListener('click', close);
    x.addEventListener('click', close);
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && root.getAttribute('data-modal') === '1') close();
    });

    const uiBag = { root, from, to, r1, r2, active, apply, reset, chips, cfg };
    root.__kbUi = uiBag;
    return uiBag;
  }
  function unmountUI(){
    const current = document.getElementById(DOCK_ID);
    if (!current) return;
    if (current.parentNode) current.parentNode.removeChild(current);
    if (current.__kbUi) delete current.__kbUi;
  }


  

  function makeRanger(from, to, r1, r2, active, minYMD, maxYMD){
    const min=normalizeYMD(minYMD), max=normalizeYMD(maxYMD);
    const today=fmtYMD(new Date());
    const safeMin=min || fmtYMD(addDays(new Date(), -180));
    const safeMax=max || today;

    const total=Math.max(1, daysBetween(safeMin, safeMax));
    const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
    const toIdx=ymd=>clamp(daysBetween(safeMin, normalizeYMD(ymd)||safeMin),0,total);
    const toYMD=i=>fmtYMD(addDays(parseYMD(safeMin), i));

    r1.min=r2.min='0'; r1.max=r2.max=String(total); r1.step=r2.step='1';

    const paintActive = () => {
      const a=Math.min(+r1.value||0, +r2.value||0);
      const b=Math.max(+r1.value||0, +r2.value||0);
      const pA=(a/total)*100, pW=((b-a)/total)*100;
      active.style.left = `${pA}%`; active.style.width= `${pW}%`;
    };
    const syncFromInputs = () => {
      const i1=toIdx(from.value||safeMin), i2=toIdx(to.value||safeMax);
      r1.value=String(Math.min(i1,i2)); r2.value=String(Math.max(i1,i2));
      paintActive(); r1.title=from.value; r2.title=to.value;
    };
    const syncFromRanges = () => {
      const a=Math.min(+r1.value||0, +r2.value||0);
      const b=Math.max(+r1.value||0, +r2.value||0);
      from.value=normalizeYMD(toYMD(a)); to.value=normalizeYMD(toYMD(b));
      paintActive(); r1.title=from.value; r2.title=to.value;
    };

    ['input','change','pointerup'].forEach(ev=>{ r1.addEventListener(ev, syncFromRanges); r2.addEventListener(ev, syncFromRanges); });
    ['input','change'].forEach(ev=>{ from.addEventListener(ev, syncFromInputs); to.addEventListener(ev, syncFromInputs); });

    syncFromInputs(); return { syncFromInputs, syncFromRanges };
  }

  function escRe(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
  function parseRangeFromQuery(q, field){
    if (!q||!field) return null;
    const f=escRe(field);
    let m=q.match(new RegExp(`${f}\\s*>=\\s*"(\\d{4}-\\d{2}-\\d{2})"\\s*and\\s*${f}\\s*<=\\s*"(\\d{4}-\\d{2}-\\d{2})"`,'i'));
    if(m) return {start:m[1], end:m[2]};
    m=q.match(new RegExp(`${f}\\s*<=\\s*"(\\d{4}-\\d{2}-\\d{2})"\\s*and\\s*${f}\\s*>=\\s*"(\\d{4}-\\d{2}-\\d{2})"`,'i'));
    if(m) return {start:m[2], end:m[1]};
    return null;
  }

  // main
  kintone.events.on(EVENTS, async ev => {
    const cfg = getConfigSafe();
    if (!shouldApplyToView(cfg, ev.viewId)) {
      unmountUI();
      return ev;
    }

    const ui = mountUI(cfg); if(!ui) return ev;

    const runtimeCfg = ui.cfg || cfg;
    let effectiveField = runtimeCfg.dateField || '';
    if (!effectiveField) effectiveField = await findFirstDateField();
    const canRun = !!effectiveField; ui.apply.disabled = !canRun;

    let minY, maxY;
    try{ const edges = await fetchEdgeDates(effectiveField); minY=edges.min; maxY=edges.max; }catch{}
    if (!minY || !maxY) { maxY = fmtYMD(new Date()); minY = fmtYMD(addDays(new Date(), -180)); }

    const ranger = makeRanger(ui.from, ui.to, ui.r1, ui.r2, ui.active, minY, maxY);

    const chosen = (runtimeCfg.presets && runtimeCfg.presets.length) ? runtimeCfg.presets
      : ['all','today','yesterday','last-7','last-30','this-week','last-week','this-month','last-month','this-quarter','last-quarter','this-half','last-half','this-year'];
    const LABEL_JA={'all':'全期間','today':'今日','yesterday':'昨日','last-7':'直近7日','last-30':'直近30日','this-week':'今週','last-week':'先週','this-month':'今月','last-month':'先月','this-quarter':'今四半期','last-quarter':'前四半期','this-half':'今半期','last-half':'前半期','this-year':'今年','last-year':'昨年'};
    const LABEL_EN={'all':'All','today':'Today','yesterday':'Yesterday','last-7':'Last 7','last-30':'Last 30','this-week':'This week','last-week':'Last week','this-month':'This month','last-month':'Last month','this-quarter':'This quarter','last-quarter':'Last quarter','this-half':'This half','last-half':'Last half','this-year':'This year','last-year':'Last year'};
    chosen.forEach(k=>{ const key=canonKey(k); const b=document.createElement('button'); b.type='button'; b.className='kb-chip'; b.textContent=(isEN?LABEL_EN:LABEL_JA)[key] || key;
      b.addEventListener('click',()=>{ const r=rangeForKey(key, minY, maxY, runtimeCfg.weekStart); ui.from.value=normalizeYMD(r.start); ui.to.value=normalizeYMD(r.end); ranger.syncFromInputs();
        Array.from(ui.chips.children).forEach(x=>x.classList.remove('kb-on')); b.classList.add('kb-on');
      });
      ui.chips.appendChild(b);
    });

    const parsed=parseRangeFromQuery(currentQuery(), effectiveField);
    if (parsed && parsed.start && parsed.end){ ui.from.value=normalizeYMD(parsed.start); ui.to.value=normalizeYMD(parsed.end); }
    else { const r=rangeForKey(runtimeCfg.defaultPreset||'last-30', minY, maxY, runtimeCfg.weekStart); ui.from.value=normalizeYMD(r.start); ui.to.value=normalizeYMD(r.end); }
    ranger.syncFromInputs();

    ui.apply.addEventListener('click',()=>{
      if(!canRun) return;
      const q=buildQuery(effectiveField, ui.from.value, ui.to.value);
      if (sameQuery(q)) { ui.root.removeAttribute('data-modal'); return; }
      const url=new URL(location.href);
      if(q) url.searchParams.set('query', q); else url.searchParams.delete('query');
      url.searchParams.set('kbds','1');
      location.href=url.toString();
    });
    ui.reset.addEventListener('click',()=>{
      const url=new URL(location.href); url.searchParams.delete('query'); url.searchParams.set('kbds','1'); location.href=url.toString();
    });
  });
})(kintone.$PLUGIN_ID);
