(function(PID){
  'use strict';

  // ---- Utilities ----
  function getPID(){ return (typeof kintone!=='undefined' && kintone.$PLUGIN_ID) ? kintone.$PLUGIN_ID : PID; }
  function readConfig(){
    var pid=getPID(); if(!pid) return {rules:[], defaultPreset:'index-on', theme:'light', applyToDetail:false};
    var raw=kintone.plugin.app.getConfig(pid)||{};
    return {
      rules: raw.rules ? JSON.parse(raw.rules) : [],
      defaultPreset: raw.defaultPreset || 'index-on',
      theme: raw.theme || 'light',
      applyToDetail: raw.applyToDetail === 'true'
    };
  }
  function writeConfig(next){ var pid=getPID(); if(!pid) return; kintone.plugin.app.setConfig(next); }
  function el(tag, cls, text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
  function option(value, label){ var o=document.createElement('option'); o.value=value; o.textContent=label; return o; }

  // ---- Field Meta ----
  async function fetchFields(){
    var appId = (kintone.app && kintone.app.getId && kintone.app.getId()) || null;
    if(!appId) return [];
    var resp = await kintone.api(kintone.api.url('/k/v1/app/form/fields', true), 'GET', { app: appId });
    var fields = [];
    function walk(group){
      Object.keys(group).forEach(function(code){
        var f = group[code];
        if (f.type === 'GROUP' || f.type === 'SUBTABLE'){
          if (f.fields) walk(f.fields);
        } else {
          fields.push({ code: f.code, label: f.label || f.code, type: f.type });
        }
      });
    }
    walk(resp.properties || resp);
    fields.sort(function(a,b){
      var la=(a.label||'')+(a.code||''), lb=(b.label||'')+(b.code||'');
      return la.localeCompare(lb, 'ja');
    });
    return fields;
  }

  function mapFieldTypeToRuleType(fieldType){
    // plugin.js に合わせた粗い型マップ
    var numberish = ['NUMBER','CALC','RECORD_NUMBER'];
    var dateish   = ['DATE','DATETIME','CREATED_TIME','UPDATED_TIME'];
    var choiceish = ['RADIO_BUTTON','DROP_DOWN'];
    var setish    = ['CHECK_BOX','MULTI_SELECT','CATEGORY'];
    if (numberish.indexOf(fieldType)>=0) return 'number';
    if (dateish.indexOf(fieldType)>=0) return 'date';
    if (choiceish.indexOf(fieldType)>=0) return 'choice';
    if (setish.indexOf(fieldType)>=0) return 'set';
    return 'text';
  }

  // ---- Operators per type (plugin.js 準拠) ----
  var OPS = {
    number: [
      ['=','等しい'],['!=','等しくない'],['>','より大きい'],['>=','以上'],
      ['<','より小さい'],['<=','以下'],['between','の間'],['notBetween','の間ではない']
    ],
    text: [
      ['=','等しい'],['!=','等しくない'],['contains','含む'],['notContains','含まない']
    ],
    choice: [
      ['=','等しい'],['!=','等しくない'],['in','次のいずれか'],['notIn','次のいずれでもない']
    ],
    set: [
      // 将来用。plugin.js 側の実装が未確定ならUI上も控えめに。
      ['contains','いずれか含む'],['notContains','いずれも含まない']
    ],
    date: [
      ['=','同じ日'],['!=','同じ日ではない'],
      ['today','今日'],['yesterday','昨日'],['tomorrow','明日'],
      ['past','過去日'],['future','未来日'],
      ['withinDays','N日以内'],['olderThanDays','N日より前']
    ]
  };

  // ---- Rules Editor ----
  function makeRuleRow(fields, rule, onChange, onDelete){
    var row=el('div','kb-grid');

    // field
    var sField=el('select','kb-select');
    sField.appendChild(option('','(フィールドを選択)'));
    fields.forEach(function(f){
      sField.appendChild(option(f.code, f.label + ' ['+f.code+']'));
    });
    sField.value = rule.field || '';
    row.appendChild(sField);

    // operator (depends on type)
    var sOp=el('select','kb-select');

    // value + color container
    var cell=el('div');
    var input=el('input','kb-input'); input.placeholder='値';
    input.value = rule.value!=null ? String(rule.value) : '';
    cell.appendChild(input);

    // color: 元の3色のみ（red/green/yellow）
    var sColor=el('select','kb-select'); sColor.style.marginTop='8px';
[['yellow','黄色'],['green','緑'],['red','赤'],['blue','青'],['orange','オレンジ'],['purple','紫'],['teal','ティール'],['gray','グレー']]
.forEach(function(p){ sColor.appendChild(option(p[0], p[1])); });
    sColor.value = (rule.color || 'yellow');
    cell.appendChild(sColor);

    row.appendChild(sOp);
    row.appendChild(cell);

    // delete
    var delWrap=el('div'); delWrap.style.gridColumn='1 / -1';
    var del=el('button','kb-btn kb-danger','削除');
    delWrap.appendChild(del);
    row.appendChild(delWrap);

    function refreshOps(){
      // 型判定
      var f = fields.find(function(x){return x.code===sField.value;});
      var rtype = f ? mapFieldTypeToRuleType(f.type) : (rule.type || 'text');
      // オペレータ入れ替え
      sOp.innerHTML='';
      (OPS[rtype]||OPS.text).forEach(function(p){ sOp.appendChild(option(p[0], p[1])); });
      // 以前の値を維持できれば維持、なければ先頭
      var current = sOp.value;                    // 直前の選択肢（存在すれば使う）
      var want    = current || rule.op || (OPS[tp] ? OPS[tp][0][0] : 'contains');
      var exists  = Array.prototype.some.call(sOp.options, function(o){ return o.value===want; });
      sOp.value   = exists ? want : (OPS[tp] ? OPS[tp][0][0] : 'contains');
      // 値のplaceholder微調整
      if (rtype==='date' && (sOp.value==='=' || sOp.value==='!=')){
        input.placeholder='YYYY-MM-DD';
      } else if (rtype==='date' && (sOp.value==='withinDays' || sOp.value==='olderThanDays')){
        input.placeholder='日数（例: 7）';
      } else {
        input.placeholder='値';
      }
      emit();
    }

    function emit(){
      var f = fields.find(function(x){return x.code===sField.value;});
      var rtype = f ? mapFieldTypeToRuleType(f.type) : (rule.type || 'text');
      onChange({
        field: sField.value || '',
        type:  rtype,
        op:    sOp.value || 'contains',
        value: input.value || '',
        color: sColor.value || 'yellow'
      });
    }
    
    sField.addEventListener('change', function(){ refreshOps(); emit(); });
    sOp.addEventListener('change', emit);
    input.addEventListener('input', emit);
    sColor.addEventListener('change', emit);
    del.addEventListener('click', function(){ onDelete(); });

    // 初期化
    refreshOps();
    return row;
  }

  
  async function mountRulesUI(container, cfg){
    container.innerHTML='';
    var fields = await fetchFields();

    var listWrap = el('div','kb-rules-list');
    container.appendChild(listWrap);

    var rules = Array.isArray(cfg.rules) ? cfg.rules.slice() : [];

    function renderRow(rule, idx){
      var row = el('div','kb-rule-row');

      // field
      var sField=el('select','kb-select');
      sField.appendChild(option('','(フィールド)'));
      fields.forEach(function(f){ sField.appendChild(option(f.code, f.label + ' ['+f.code+']')); });
      sField.value = rule.field || '';
      row.appendChild(sField);

      // operator (type-sensitive)
      var sOp=el('select','kb-select');
      row.appendChild(sOp);

      // values (1 or 2)
      var valuesWrap = el('div','kb-rule-values');
      var v1=el('input','kb-input'); v1.placeholder='値';
      v1.value = (rule && rule.value!=null) ? String(rule.value) : '';
      valuesWrap.appendChild(v1);

      // second value for between/notBetween
      var v2=el('input','kb-input'); v2.placeholder='最大値'; v2.style.display='none';
      valuesWrap.appendChild(v2);
      row.appendChild(valuesWrap);

      // color
      var sColor=el('select','kb-select');
      [['yellow','黄色'],['green','緑'],['red','赤'],['blue','青'],['orange','オレンジ'],['purple','紫'],['teal','ティール'],['gray','グレー']]
      .forEach(function(p){ sColor.appendChild(option(p[0], p[1])); });
      sColor.value = (rule.color || 'yellow');
      row.appendChild(sColor);

      // delete
      var del=el('button','kb-btn kb-btn-danger','削除');
      row.appendChild(del);

      function rtype(){
        var f = fields.find(function(x){return x.code===sField.value;});
        return f ? mapFieldTypeToRuleType(f.type) : (rule.type || 'text');
      }
      function refreshOps(){
        var tp = rtype();
        sOp.innerHTML='';
        (OPS[tp]||OPS.text).forEach(function(p){ sOp.appendChild(option(p[0], p[1])); });
        var want = rule.op || (OPS[tp] ? OPS[tp][0][0] : 'contains');
        var exists = Array.prototype.some.call(sOp.options, function(o){ return o.value===want; });
        sOp.value = exists ? want : (OPS[tp] ? OPS[tp][0][0] : 'contains');
        // values inputs
        if (sOp.value==='between' || sOp.value==='notBetween'){
          v1.placeholder='最小値'; v2.placeholder='最大値'; v2.style.display='';
          var raw = (rule && rule.value!=null) ? String(rule.value) : '';
          var parts = raw.split(',');
          v1.value = parts[0] || '';
          v2.value = parts.length>1 ? parts[1] : '';
        }else{
          v1.placeholder = (tp==='date' && (sOp.value==='=' || sOp.value==='!=')) ? 'YYYY-MM-DD'
                        : (tp==='date' && (sOp.value==='withinDays' || sOp.value==='olderThanDays')) ? '日数（例:7）'
                        : '値';
          v2.style.display='none';
          if (rule && typeof rule.value==='string' && rule.value.indexOf(',')>=0){
            v1.value = rule.value;
          }
        }
        emit();
      }

      function emit(){
        var tp = rtype();
        var val = (sOp.value==='between' || sOp.value==='notBetween') ? (v1.value + ',' + v2.value) : v1.value;
        rules[idx] = {
          field: sField.value || '',
          type:  tp,
          op:    sOp.value || 'contains',
          value: val || '',
          color: sColor.value || 'yellow'
        };
      }

      sField.addEventListener('change', refreshOps);
      sOp.addEventListener('change', refreshOps);
      v1.addEventListener('input', emit);
      v2.addEventListener('input', emit);
      sColor.addEventListener('change', emit);
      del.addEventListener('click', function(){
        rules.splice(idx,1);
        rerender();
      });

      refreshOps();
      return row;
    }

    function rerender(){
      listWrap.innerHTML='';
      if (!rules.length){
        listWrap.appendChild(el('div','kb-sub','まだルールがありません。「ルールを追加」から作成してください。'));
      }
      rules.forEach(function(rule, idx){
        listWrap.appendChild(renderRow(rule, idx));
      });
    }

    var actions = el('div','kb-actions');
    var add = el('button','kb-btn','ルールを追加');
    actions.style.marginTop='10px';
    actions.appendChild(add);
    container.appendChild(actions);

    add.addEventListener('click', function(){
      rules.push({ field:'', type:'text', op:'=', value:'', color:'yellow' });
      rerender();
    });

    window.__collectRules__ = function(){ return rules.filter(function(r){ return r && r.field; }); };

    rerender();
  }

  // ---- Main UI ----
  function buildUI(){
    var root=document.getElementById('kb-root');
    if(!root) return;
    root.innerHTML='';
    var cfg=readConfig();

    var wrap=el('div','kb-container');
    root.appendChild(wrap);

    var header=el('div','kb-card');
    header.appendChild(el('div','kb-title','強調表示ルール - 設定'));
    header.appendChild(el('p','kb-desc','一覧/詳細画面に、条件に一致するセルへ強調色を適用します。'));
    wrap.appendChild(header);

    var rulesCard=el('div','kb-card');
    rulesCard.appendChild(el('div','kb-label','ルール設定'));
    rulesCard.appendChild(el('div','kb-help','フィールド・条件・値・色を設定します。上から順に評価されます。'));
    wrap.appendChild(rulesCard);

    // mount editor
    mountRulesUI(rulesCard, cfg);

    // 詳細にも適用
    var optCard=el('div','kb-card');
    var row=el('label','kb-row');
    var chk=el('input',''); chk.type='checkbox'; chk.checked=!!cfg.applyToDetail; chk.id='kb-apply-detail';
    var cap=el('span','kb-label','詳細画面にも表示する');
    row.appendChild(chk); row.appendChild(cap);
    optCard.appendChild(row);
    optCard.appendChild(el('div','kb-help','チェックすると、app.record.detail.show でも一覧と同じ条件で色付けします。'));
    wrap.appendChild(optCard);

    // Actions
    var actionCard=el('div','kb-card');
    var actions=el('div','kb-actions');
    var save=el('button','kb-btn kb-primary','保存');
    var cancel=el('button','kb-btn','キャンセル');
    actions.appendChild(save); actions.appendChild(cancel);
    actionCard.appendChild(actions);
    wrap.appendChild(actionCard);

    save.addEventListener('click', function(){
      var nextRules = (typeof window!=='undefined' && typeof window.__collectRules__==='function')
        ? window.__collectRules__()
        : cfg.rules;

      var next = {
        rules: JSON.stringify(nextRules || []),
        defaultPreset: cfg.defaultPreset || 'index-on',
        theme: cfg.theme || 'light',
        applyToDetail: (document.getElementById('kb-apply-detail') && document.getElementById('kb-apply-detail').checked) ? 'true' : 'false'
      };
      writeConfig(next);
    });
    cancel.addEventListener('click', function(){ history.back(); });
  }

  // ---- boot ----
  if (document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }

})(kintone && kintone.$PLUGIN_ID ? kintone.$PLUGIN_ID : null);
