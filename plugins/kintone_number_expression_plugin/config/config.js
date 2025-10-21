// 設定画面: 対象フィールド（トップ/サブ）を選択
(function(PLUGIN_ID){
  'use strict';

  // --- utils ---
  var $ = function(s, r){ return (r||document).querySelector(s); };
  var el = function(tag, attrs, children){
    var n = document.createElement(tag);
    (attrs||{});
    Object.keys(attrs||{}).forEach(function(k){
      var v = attrs[k];
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'checked') n.checked = !!v; // boolean attr as property
      else n.setAttribute(k, v);
    });
    (children||[]).forEach(function(c){ n.appendChild(typeof c==='string' ? document.createTextNode(c) : c); });
    return n;
  };
  function t(key){
    var L = (function(){ try{ return (kintone.getLoginUser()||{}).language || 'ja'; }catch(_){ return 'ja'; } })();
    var JA = {
      titleTop: '対象フィールド',
      titleSub: '対象フィールド（サブテーブル）',
      save: '保存', cancel: 'キャンセル',
      loading: 'フィールドを取得中…',
      none: '該当する文字列フィールドが見つかりません。',
      mapTop: '出力マッピング',
      mapSub: '出力マッピング（サブテーブル）'
    };
    var EN = {
      titleTop: 'Target Fields',
      titleSub: 'Target Fields (Subtable)',
      save: 'Save', cancel: 'Cancel',
      loading: 'Loading fields…',
      none: 'No string fields found.',
      mapTop: 'Output Mapping',
      mapSub: 'Output Mapping (Subtable)'
    };
    var M = L==='ja'?JA:EN; return M[key]||key;
  }

  function getAppId(){
    var qs = new URLSearchParams(location.search);
    if (qs.get('app')) return qs.get('app');
    var m = location.pathname.match(/\/k\/admin\/app\/(\d+)\/plugin/);
    return m ? m[1] : '';
  }

  async function fetchForm(){
    var app = getAppId(); if (!app) return null;
    var eps = ['/k/v1/preview/app/form/fields.json','/k/v1/app/form/fields.json'];
    var res = null;
    for (var i=0;i<eps.length;i++){
      try{ res = await kintone.api(kintone.api.url(eps[i], true), 'GET', { app: app }); if (res) break; }catch(_){ }
    }
    return res;
  }

  function normalizeForm(res){
    var topStr = [], topNum = []; var subsMap = {};
    (function walk(map, parent){
      Object.values(map||{}).forEach(function(f){
        if (!f) return;
        if (f.type === 'SUBTABLE'){
          subsMap[f.code] = subsMap[f.code] || { table: f.code, tableLabel: f.label, strings: [], numbers: [] };
          walk(f.fields, f.code);
          return;
        }
        if (!parent){
          if (f.type === 'SINGLE_LINE_TEXT') topStr.push({ code:f.code, label:f.label });
          if (f.type === 'NUMBER') topNum.push({ code:f.code, label:f.label });
        } else {
          subsMap[parent] = subsMap[parent] || { table: parent, tableLabel: parent, strings: [], numbers: [] };
          if (f.type === 'SINGLE_LINE_TEXT') subsMap[parent].strings.push({ code:f.code, label:f.label });
          if (f.type === 'NUMBER') subsMap[parent].numbers.push({ code:f.code, label:f.label });
        }
      });
    })(res && res.properties, null);
    var subs = Object.values(subsMap);
    return { topStr: topStr, topNum: topNum, subs: subs };
  }

  function parseJsonSafe(s, def){ try{ return JSON.parse(s); }catch(_){ return def; } }
  function loadConfig(){
    var raw = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
    var targets = parseJsonSafe(raw.targets, null);
    if (targets && typeof targets === 'object'){
      if (!Array.isArray(targets.top)) targets.top = [];
      if (!Array.isArray(targets.sub)) targets.sub = [];
      return targets;
    }
    // 互換: top/sub 別キー保存の読み込み
    var top = parseJsonSafe(raw.targetsTop, []);
    var sub = parseJsonSafe(raw.targetsSub, []);
    if (!Array.isArray(top)) top = [];
    if (!Array.isArray(sub)) sub = [];
    return { top: top, sub: sub };
  }

  function saveConfig(targets, mappings, cb){
    try{
      kintone.plugin.app.setConfig({
        version: '1',
        targets: JSON.stringify(targets),
        targetsTop: JSON.stringify(targets.top || []),
        targetsSub: JSON.stringify(targets.sub || []),
        mapTop: JSON.stringify(mappings.mapTop || []),
        mapSub: JSON.stringify(mappings.mapSub || [])
      }, cb);
    }
    catch(e){ alert('保存に失敗しました: ' + e.message); }
  }

  function render(list){
    var tbody = $('#conf-body');
    tbody.innerHTML = '';
    var targets = loadConfig();
    var mapsTop = [];
    var mapsSub = [];
    try{
      var raw = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
      mapsTop = JSON.parse(raw.mapTop || '[]');
      mapsSub = JSON.parse(raw.mapSub || '[]');
    }catch(_){ mapsTop=[]; mapsSub=[]; }

    function row(title, contentNode){
      var tr = el('tr', {}, [ el('th', {text:title}), el('td', {}, [contentNode]) ]);
      tbody.appendChild(tr);
    }

    // top-level (string targets)
    var topWrap = el('div', {});
    if (list.topStr.length === 0) topWrap.appendChild(el('div', {text: t('none')}));
    list.topStr.forEach(function(f){
      var id = 't-'+f.code;
      var inp = el('input', { type:'checkbox', id:id, 'data-code':f.code });
      inp.checked = !!targets.top.includes(f.code);
      var label = el('label', { for:id, style:'display:block; margin:6px 0;' }, [ inp, document.createTextNode(' ' + f.label + ' (' + f.code + ')') ]);
      topWrap.appendChild(label);
    });
    row(t('titleTop'), topWrap);

    // subtables (string targets)
    var subWrap = el('div', {});
    if (list.subs.length === 0) subWrap.appendChild(el('div', {text: t('none')}));
    list.subs.forEach(function(s){
      var box = el('div', { class:'kp-card', style:'margin:8px 0; padding:8px;' }, [ el('div', {text: s.tableLabel + ' ('+s.table+')'}) ]);
      s.strings.forEach(function(f){
        var id = 's-'+s.table+'-'+f.code;
        var isChecked = (targets.sub || []).some(function(g){ return g.table===s.table && Array.isArray(g.fields) && g.fields.includes(f.code); });
        var inp = el('input', { type:'checkbox', id:id, 'data-table':s.table, 'data-code':f.code });
        inp.checked = !!isChecked;
        var label = el('label', { for:id, style:'display:block; margin:6px 0;' }, [ inp, document.createTextNode(' ' + f.label + ' (' + f.code + ')') ]);
        box.appendChild(label);
      });
      subWrap.appendChild(box);
    });
    row(t('titleSub'), subWrap);

    // --- Mapping UI (optional A+) ---
    function select(options, value){
      var s = el('select');
      options.forEach(function(opt){
        var o = el('option', { value: opt.code, text: opt.label + ' ('+opt.code+')' });
        s.appendChild(o);
      });
      if (value) s.value = value;
      return s;
    }

    // Top-level mapping rows
    var mapTopWrap = el('div');
    function addMapTopRow(from, to){
      var rowDiv = el('div', { style:'display:flex; gap:8px; align-items:center; margin:6px 0;' });
      var sFrom = select(list.topStr, from);
      var sTo   = select(list.topNum, to);
      var delBt = el('button', { type:'button', text:'削除' });
      delBt.onclick = function(){ rowDiv.remove(); };
      rowDiv.appendChild(el('span', { text:'式(文字列):' })); rowDiv.appendChild(sFrom);
      rowDiv.appendChild(el('span', { text:'→ 結果(数値):' })); rowDiv.appendChild(sTo);
      rowDiv.appendChild(delBt);
      mapTopWrap.appendChild(rowDiv);
    }
    (mapsTop||[]).forEach(function(m){ addMapTopRow(m.from, m.to); });
    var addTopBtn = el('button', { type:'button', text:'行を追加' });
    addTopBtn.onclick = function(){ addMapTopRow('', ''); };
    var mapTopBlock = el('div', {}, [ mapTopWrap, el('div', { style:'margin-top:6px;' }, [addTopBtn]) ]);
    row(t('mapTop'), mapTopBlock);

    // Subtable mapping
    var mapSubBlock = el('div');
    list.subs.forEach(function(s){
      var box = el('div', { class:'kp-card', style:'margin:8px 0; padding:8px;' }, [ el('div', {text: s.tableLabel + ' ('+s.table+')'}) ]);
      var wrap = el('div');
      function addRow(from, to){
        var r = el('div', { style:'display:flex; gap:8px; align-items:center; margin:6px 0;' });
        var sf = select(s.strings, from);
        var st = select(s.numbers, to);
        var del = el('button', { type:'button', text:'削除' });
        del.onclick = function(){ r.remove(); };
        r.appendChild(el('span', { text:'式(文字列):' })); r.appendChild(sf);
        r.appendChild(el('span', { text:'→ 結果(数値):' })); r.appendChild(st);
        r.appendChild(del);
        wrap.appendChild(r);
      }
      (mapsSub||[]).filter(function(m){ return m.table===s.table; }).forEach(function(m){ addRow(m.from, m.to); });
      var addBtn = el('button', { type:'button', text:'行を追加' });
      addBtn.onclick = function(){ addRow('', ''); };
      box.appendChild(wrap);
      box.appendChild(el('div', { style:'margin-top:6px;' }, [addBtn]));
      mapSubBlock.appendChild(box);
    });
    row(t('mapSub'), mapSubBlock);

    $('#save').textContent = t('save');
    $('#cancel').textContent = t('cancel');

    $('#save').onclick = function(){
      var selTop = Array.from(topWrap.querySelectorAll('input[type="checkbox"]:checked')).map(function(i){ return i.getAttribute('data-code'); });
      var map = {};
      Array.from(subWrap.querySelectorAll('input[type="checkbox"]')).forEach(function(i){
        var tbl = i.getAttribute('data-table'); var cd = i.getAttribute('data-code');
        if (!i.checked) return;
        map[tbl] = map[tbl] || []; map[tbl].push(cd);
      });
      var selSub = Object.keys(map).map(function(t){ return { table:t, fields: map[t] }; });
      // collect mapTop (dedupe)
      var newMapTop = [];
      Array.from(mapTopWrap.children).forEach(function(rowDiv){
        var sels = rowDiv.querySelectorAll('select'); if (sels.length<2) return;
        var from = sels[0].value || ''; var to = sels[1].value || '';
        if (from && to) newMapTop.push({ from: from, to: to });
      });
      // unique by from|to
      (function(){
        var seen = new Set();
        newMapTop = newMapTop.filter(function(m){
          var key = m.from + '|' + m.to;
          if (seen.has(key)) return false; seen.add(key); return true;
        });
      })();

      // collect mapSub (dedupe)
      var newMapSub = [];
      Array.from(mapSubBlock.querySelectorAll('.kp-card')).forEach(function(card){
        var title = card.querySelector('div');
        var m = title && title.textContent && title.textContent.match(/\(([^)]+)\)/); // (...)
        var table = m ? m[1] : '';
        Array.from(card.querySelectorAll('div > div')).forEach(function(row){
          var sels = row.querySelectorAll('select'); if (sels.length<2) return;
          var from = sels[0].value || ''; var to = sels[1].value || '';
          if (table && from && to) newMapSub.push({ table: table, from: from, to: to });
        });
      });
      // unique by table|from|to
      (function(){
        var seen = new Set();
        newMapSub = newMapSub.filter(function(m){
          var key = m.table + '|' + m.from + '|' + m.to;
          if (seen.has(key)) return false; seen.add(key); return true;
        });
      })();
      saveConfig({ top: selTop, sub: selSub }, { mapTop: newMapTop, mapSub: newMapSub }, function(){
        var app = getAppId(); location.href = '/k/admin/app/' + app + '/plugin/#/';
      });
    };
    $('#cancel').onclick = function(){ var app = getAppId(); location.href = '/k/admin/app/' + app + '/plugin/#/'; };

    // 現在の設定のサマリ
    var summary = el('div', { style:'margin-top:8px; font-size:12px; color:#6b7280;' }, [
      document.createTextNode('現在の設定: top=' + String((targets.top||[]).join(',')) + ' / sub=' + JSON.stringify(targets.sub||[]))
    ]);
    var trSummary = el('tr', {}, [ el('td', { colspan:'2' }, [summary]) ]);
    tbody.appendChild(trSummary);
  }

  async function init(){
    var tbody = $('#conf-body');
    tbody.innerHTML = '';
    var tr = el('tr', {}, [ el('td', { colspan:'2', text: t('loading') }) ]);
    tbody.appendChild(tr);
    var form = await fetchForm();
    render(normalizeForm(form || {}));
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(init,0);
  else window.addEventListener('load', init, { once:true });

})(kintone.$PLUGIN_ID);
