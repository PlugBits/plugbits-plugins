// src/js/config.js
// 条件付き書式 プラグイン設定画面
// ES2019 / IIFE / DOM非破壊 / innerHTML(動的値)禁止
(function(){
  'use strict';

  var _inited = false;

  // ---------- utils ----------
  function kbSetTheme(rootEl, name){ if (rootEl) rootEl.setAttribute('data-kb-theme', name || 'light'); }

  function getConfig(){
    try{
      var pid = (typeof kintone !== 'undefined' && kintone.$PLUGIN_ID) ? kintone.$PLUGIN_ID : null;
      if (!pid) return { rules: [], defaultPreset: 'index-on', theme: 'light', applyToDetail: false };
      var raw = kintone.plugin.app.getConfig(pid) || {};
      return {
        rules: raw.rules ? JSON.parse(raw.rules) : [],
        defaultPreset: raw.defaultPreset || 'index-on',
        theme: raw.theme || 'light',
        applyToDetail: raw.applyToDetail === 'true'
      };
    }catch(e){
      console.error(e);
      return { rules: [], defaultPreset: 'index-on', theme: 'light', applyToDetail: false };
    }
  }

  function safeUpdate(cfg){
    try{ kintone.plugin.app.setConfig(cfg); }
    catch(e){ console.error(e); }
  }

  // フィールド一覧取得（choicesも付与）
  function fetchFields(cb){
    var appId; try{ appId = kintone.app.getId(); }catch(e){ appId = null; }
    if (!appId){ cb([]); return; }
    var url = kintone.api.url('/k/v1/app/form/fields', true);
    kintone.api(url,'GET',{app:appId},function(resp){
      var out = [];
      var props = resp && resp.properties ? resp.properties : {};
      for (var code in props){
        if (!props.hasOwnProperty(code)) continue;
        var p = props[code];
        var list = [];
        if (p.options){
          for (var k in p.options){ if (p.options.hasOwnProperty(k)){ list.push(p.options[k].label || k); } }
        }
        if (p.type==='NUMBER' || p.type==='SINGLE_LINE_TEXT' || p.type==='DATE' || p.type==='STATUS' ||
            p.type==='RADIO_BUTTON' || p.type==='DROP_DOWN' ||  p.type==='DATETIME'){
          out.push({ code:code, label:p.label || code, type:p.type, choices:list });
        }
      }
      cb(out);
    }, function(err){ console.error(err); cb([]); });
  }

  // ---------- 1ルール行 ----------
  function buildRuleRow(rule, fieldOptions){
    var row = document.createElement('div'); row.className = 'kp-rule';

    // Field
    var fieldSel = document.createElement('select'); fieldSel.className = 'kp-select';
    for (var i=0;i<fieldOptions.length;i++){
      var fo = fieldOptions[i];
      var opt = document.createElement('option');
      opt.value = fo.code;
      opt.textContent = (fo.label ? String(fo.label) : String(fo.code)) + ' (' + String(fo.code) + ')';
      if (fo.code===rule.field) opt.selected = true;
      fieldSel.appendChild(opt);
    }

    // Type（自動・編集不可）
    var typeSel = document.createElement('select'); typeSel.className = 'kp-select kp-type';
    var TYPES = ['number','text','date','choice','empty'];
    for (var t=0;t<TYPES.length;t++){
      var o = document.createElement('option'); o.value = TYPES[t]; o.textContent = TYPES[t];
      if (TYPES[t]===rule.type) o.selected = true;
      typeSel.appendChild(o);
    }
    typeSel.disabled = true;

    // OP
    var opSel = document.createElement('select'); opSel.className = 'kp-select kp-op';
    var OP_MAP = {
      number:['=','!=','>','>=','<','<=','between','notBetween'],
      text:['=','!=','contains','notContains','regex'],
      date:['=','!=','today','yesterday','tomorrow','past','future','withinDays','olderThanDays'],
      empty:['isEmpty','isNotEmpty'],
      choice:['=','!=','in','notIn'],
      
    };
    function fillOps(kind,current){
      var ops = OP_MAP[kind] || OP_MAP.text;
      opSel.textContent = '';
      for (var k=0;k<ops.length;k++){
        var oo = document.createElement('option'); oo.value = ops[k]; oo.textContent = ops[k];
        if (ops[k]===current) oo.selected = true;
        opSel.appendChild(oo);
      }
    }

    // Value（動的UI）
    var valWrap = document.createElement('span'); valWrap.className = 'kp-value-wrap';
    var sep = document.createElement('span'); sep.className = 'kp-sep'; sep.textContent = '–';
    var v1 = null, v2 = null;

    function choicesFor(code){
      for (var i=0;i<fieldOptions.length;i++){ if (fieldOptions[i].code===code) return fieldOptions[i].choices || []; }
      return [];
    }
    function buildChoiceGroup(list, multiple, nameKey){
      var g = document.createElement('div'); g.className = 'kp-choices';
      var name = nameKey || ('grp_' + Math.random().toString(36).slice(2));
      for (var i=0;i<list.length;i++){
        var label = document.createElement('label'); label.style.marginRight = '10px';
        var inp = document.createElement('input'); inp.type = multiple ? 'checkbox' : 'radio';
        inp.name = name; inp.value = list[i];
        label.appendChild(inp);
        var cap = document.createElement('span'); cap.textContent = list[i];
        label.appendChild(cap);
        g.appendChild(label);
      }
      return g;
    }
    function readChoiceGroup(group, single){
      var ins = group.querySelectorAll('input'); var out = [];
      for (var i=0;i<ins.length;i++){ if (ins[i].checked) out.push(ins[i].value); }
      return single ? (out[0] || '') : out;
    }

    function buildValue(kind){
      valWrap.textContent=''; v1=null; v2=null;
      var op = opSel.value;

      if (kind==='choice'){
        var list = choicesFor(fieldSel.value);
        var grp = buildChoiceGroup(list, (op==='in' || op==='notIn'), 'ch_'+fieldSel.value+'_'+Math.random());
        v1 = grp; valWrap.appendChild(grp); return;
      }
    
      if (kind==='number'){
        var i1=document.createElement('input'); i1.className='kb-input'; i1.type='number'; i1.step='any';
        var i2=document.createElement('input'); i2.className='kb-input'; i2.type='number'; i2.step='any';
        v1=i1; v2=i2;
        var show2 = (op==='between'||op==='notBetween');
        sep.style.display = show2?'':'none'; i2.style.display = show2?'':'none';
        // restore cached value if present
        if (row._currentValue!=null){ var parts = String(row._currentValue).split(','); i1.value = parts[0]||''; if (show2) i2.value = (parts[1]||''); }
        valWrap.appendChild(i1); valWrap.appendChild(sep); valWrap.appendChild(i2); return;
      }
      if (kind==='date'){
        if (op==='today'||op==='yesterday'||op==='tomorrow'||op==='past'||op==='future'){
          valWrap.classList.add('is-hidden'); return;
        }
        valWrap.classList.remove('is-hidden');
        if (op==='withinDays' || op==='olderThanDays'){
          var nd=document.createElement('input'); nd.className='kb-input'; nd.type='number'; nd.step='1';
          v1=nd; valWrap.appendChild(nd); return;
        }
        var d=document.createElement('input'); d.className='kb-input'; d.type='date';
        v1=d; valWrap.appendChild(d); return;
      }
      var t=document.createElement('input'); t.className='kb-input'; t.type='text';
      v1=t; if (row._currentValue!=null && (op==='='||op==='!='||op==='withinDays'||op==='olderThanDays')){ t.value = String(row._currentValue); } valWrap.appendChild(t);
    }

    // Color
    var colorSel = document.createElement('select'); colorSel.className = 'kp-select kp-color';
    var COLORS = ['red','yellow','green','blue','orange','purple','teal','gray'];
    for (var c=0;c<COLORS.length;c++){
      var oc = document.createElement('option'); oc.value = COLORS[c]; oc.textContent = COLORS[c];
      if (COLORS[c]===rule.color) oc.selected = true;
      colorSel.appendChild(oc);
    }

    // Delete
    var del = document.createElement('button'); del.className = 'kb-btn'; del.textContent = '削除';
    del.addEventListener('click', function(){ if (row.parentNode) row.parentNode.removeChild(row); });

    // 並べる（Field | Type | Op | Value | Color | Delete）
    row.appendChild(fieldSel);
    row.appendChild(typeSel);
    row.appendChild(opSel);
    row.appendChild(valWrap);
    row.appendChild(colorSel);
    row.appendChild(del);

    // 型判定
    function fieldTypeOf(code){
      for (var x=0;x<fieldOptions.length;x++){
        if (fieldOptions[x].code===code){
          var t = fieldOptions[x].type;
          if (t==='NUMBER') return 'number';
          if (t==='DATE' || t==='DATETIME') return 'date';
          if (t==='RADIO_BUTTON' || t==='DROP_DOWN') return 'choice';
          
          return 'text'; // STATUS など
        }
      }
      return 'text';
    }

    function setValueUI(kind){ buildValue(kind); }

    function refresh(preferOp){
      var kind = fieldTypeOf(fieldSel.value);
      typeSel.value = kind;
      fillOps(kind, (preferOp && preferOp.length ? preferOp : opSel.value));
      setValueUI(kind);
    }

    // 初期反映
    refresh(rule && rule.op);
    (function applyInitial(){
      var kind = typeSel.value, op = opSel.value;
      if (kind==='choice'){
        if (!v1) return;
        var single = !(op==='in'||op==='notIn');
        var vals = Array.isArray(rule.value) ? rule.value : (single ? [rule.value] : []);
        var ins = v1.querySelectorAll('input');
        for (var i=0;i<ins.length;i++){ ins[i].checked = vals.indexOf(ins[i].value) > -1; }
      }else if (kind==='set'){
        if (!v1) return;
        var ins2 = v1.querySelectorAll('input');
        var vals2 = Array.isArray(rule.value) ? rule.value : [];
        for (var j=0;j<ins2.length;j++){ ins2[j].checked = vals2.indexOf(ins2[j].value) > -1; }
      }else if (kind==='number'){
        if (Array.isArray(rule.value)){ if (v1) v1.value = rule.value[0] || ''; if (v2) v2.value = rule.value[1] || ''; }
        else { if (v1) v1.value = rule && rule.value != null ? String(rule.value) : ''; }
      }else{
        if (v1) v1.value = rule && rule.value != null ? String(rule.value) : '';
      }
    })();

    // 連動
    opSel.addEventListener('change', function(){
      // cache current value(s) on the row before rebuilding inputs
      try{
        var k = typeSel.value; var o = opSel.value;
        if (k==='number'){
          var ins = valWrap.querySelectorAll('input');
          if (o==='between'||o==='notBetween'){
            row._currentValue = (ins[0]?ins[0].value:'') + ',' + (ins[1]?ins[1].value:'');
          }else{ row._currentValue = (ins[0]?ins[0].value:''); }
        }else if (k==='date' || k==='text'){
          var i = valWrap.querySelector('input'); row._currentValue = i ? i.value : '';
        } else { row._currentValue = null; }
      }catch(e){ row._currentValue = row._currentValue || null; }
      refresh(opSel.value);
    });
    fieldSel.addEventListener('change', function(){ refresh(); });

    // 収集
    row.getValue = function(){
      var kind = typeSel.value, op = opSel.value;
      if (kind==='choice'){
        var single = !(op==='in'||op==='notIn');
        return {
          field: fieldSel.value, type: kind, op: op,
          value: v1 ? (single ? readChoiceGroup(v1,true) : readChoiceGroup(v1,false)) : (single?'':[]),
          color: colorSel.value
        };
      }
      if (kind==='set'){
        return {
          field: fieldSel.value, type: kind, op: op,
          value: v1 ? readChoiceGroup(v1,false) : [],
          color: colorSel.value
        };
      }
      if (kind==='number' && (op==='between'||op==='notBetween')){
        return { field: fieldSel.value, type: kind, op: op,
          value: [v1 ? v1.value : '', v2 ? v2.value : ''], color: colorSel.value };
      }
      return { field: fieldSel.value, type: kind, op: op, value: v1 ? v1.value : '', color: colorSel.value };
    };

    return row;
  }

  // ---------- 全体UI ----------
  function buildUI(root){
    var cfg = getConfig();
    kbSetTheme(root, cfg.theme);

    var wrap = document.createElement('div'); wrap.className = 'kp-wrap';
    var card = document.createElement('div'); card.className = 'kp-card';
    var h = document.createElement('h2'); h.textContent = '条件付き書式 設定'; card.appendChild(h);

    var rulesCard = document.createElement('div'); rulesCard.className = 'kp-card'; rulesCard.style.marginTop = '4px';
    var title = document.createElement('div'); title.className = 'kp-label';
    title.textContent = 'Rules (field / type / op / value / color)';
    var list = document.createElement('div'); list.style.display = 'grid'; list.style.gap = '6px';
    var addBtn = document.createElement('button'); addBtn.className = 'kb-btn kb-primary'; addBtn.textContent = 'ルール追加';

    rulesCard.appendChild(title); rulesCard.appendChild(list); rulesCard.appendChild(addBtn);
    card.appendChild(rulesCard);

    // ▼ 詳細画面にも表示する（オプション）
    var optCard = document.createElement('div'); optCard.className = 'kp-card'; optCard.style.marginTop = '8px';
    var optRow  = document.createElement('label'); optRow.style.display = 'flex'; optRow.style.alignItems = 'center'; optRow.style.gap = '8px';
    var optChk  = document.createElement('input'); optChk.type = 'checkbox';
    optChk.checked = !!cfg.applyToDetail;
    var optCap  = document.createElement('span'); optCap.textContent = '詳細画面にも表示する';
    optRow.appendChild(optChk); optRow.appendChild(optCap);
    var optHelp = document.createElement('div'); optHelp.className = 'kb-help';
    optHelp.textContent = 'チェックすると、app.record.detail.show でも一覧と同じ条件で色付けします。';
    optCard.appendChild(optRow); optCard.appendChild(optHelp);
    card.appendChild(optCard);

    var actions = document.createElement('div'); actions.className = 'kp-actions';
    var saveBtn = document.createElement('button'); saveBtn.className = 'kb-btn kb-primary'; saveBtn.textContent = '保存';
    var cancelBtn = document.createElement('button'); cancelBtn.className = 'kb-btn'; cancelBtn.textContent = 'キャンセル';
    actions.appendChild(saveBtn); actions.appendChild(cancelBtn);
    card.appendChild(actions);

    wrap.appendChild(card); root.appendChild(wrap);

    fetchFields(function(fields){
      function pushRow(r){ var row = buildRuleRow(r, fields); list.appendChild(row); }
      if (cfg.rules && cfg.rules.length){
        for (var i=0;i<cfg.rules.length;i++) pushRow(cfg.rules[i]);
      }else{
        pushRow({ field:'', type:'text', op:'contains', value:'URGENT', color:'yellow' });
      }
      addBtn.addEventListener('click', function(){
        pushRow({ field:'', type:'text', op:'=', value:'', color:'yellow' });
      });
    });

    saveBtn.addEventListener('click', function(){
      var rows = list.children; var rules = [];
      for (var i=0;i<rows.length;i++){ if (rows[i].getValue) rules.push(rows[i].getValue()); }
      var next = {
        rules: JSON.stringify(rules),
        defaultPreset: cfg.defaultPreset || 'index-on',
        theme: cfg.theme || 'light',
        applyToDetail: optChk && optChk.checked ? 'true' : 'false'
      };
      safeUpdate(next);
    });
    cancelBtn.addEventListener('click', function(){ history.back(); });
  }

  // ---------- boot ----------
  function init(){
    if (_inited) return; _inited = true;
    var root = document.getElementById('kb-root');
    if (root) buildUI(root);
  }

  if (window.kintone && kintone.events && kintone.events.on){
    kintone.events.on('app.plugin.config.show', function(ev){ init(); return ev; });
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', function(){ if (document.querySelector('#kb-root')) init(); });
})();
