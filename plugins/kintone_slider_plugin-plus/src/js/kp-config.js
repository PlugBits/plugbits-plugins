(function (){
  'use strict';
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'}[c]));

  async function fetchFields(types){
    const app = kintone.app.getId();
    const resp = await kintone.api(kintone.api.url('/k/v1/app/form/fields', true), 'GET', { app });
    const out = [];
    (function walk(map){
      Object.values(map).forEach(f=>{
        if (f.type==='SUBTABLE') return walk(f.fields);
        if (!types || types.includes(f.type)) out.push({ code:f.code, label:f.label, type:f.type });
      });
    })(resp.properties);
    return out;
  }

  function makeRow({label, node, help}){
    const row = document.createElement('div'); row.className='kp-row kp-card';
    const l = document.createElement('div'); l.className='kp-label'; l.textContent = label;
    const f = document.createElement('div'); f.className='kp-field'; f.appendChild(node);
    if (help){ const h=document.createElement('div'); h.className='kp-help'; h.textContent=help; f.appendChild(h); }
    row.append(l,f); return row;
  }

  function fieldSelect(options, value=''){
    const sel = document.createElement('select');
    sel.innerHTML = ['<option value=""></option>']
      .concat(options.map(o=>`<option value="${esc(o.code)}">${esc(`${o.label} (${o.code})`)}</option>`))
      .join('');
    sel.value = value || '';
    return sel;
  }

  function actions({onSave, onCancel, saveText='保存', cancelText='キャンセル'}){
    const wrap = document.createElement('div'); wrap.className='kp-actions';
    const save = document.createElement('button'); save.className='kp-btn primary'; save.textContent = saveText;
    const cancel = document.createElement('button'); cancel.className='kp-btn ghost'; cancel.textContent = cancelText;
    save.onclick = onSave; cancel.onclick = onCancel;
    wrap.append(save, cancel); return wrap;
  }

  function toast(msg, type){
    const t = document.createElement('div'); t.className='kp-toast'+(type?` ${type}`:''); t.textContent = msg;
    document.body.appendChild(t); setTimeout(()=>t.remove(), 2200);
  }

  async function selfCheck(checkFn){
    try{
      const res = await checkFn();
      toast(res===true ? '自己診断OK' : (res || '診断NG'), res===true ? 'ok' : 'err');
    }catch(e){ toast('診断エラー: '+(e && e.message || e), 'err'); }
  }

  window.KPConfig = { fetchFields, makeRow, fieldSelect, actions, toast, selfCheck };
})();
