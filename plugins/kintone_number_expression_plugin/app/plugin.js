(function(PLUGIN_ID){
  'use strict';

  var SUBMIT_EVENTS = ['app.record.create.submit','app.record.edit.submit'];
  var SHOW_EVENTS = ['app.record.create.show','app.record.edit.show'];
  var HIDE_EVENTS = ['app.record.detail.show','app.record.index.show'];
  var registeredCodes = new Set();
  var handlersInitialized = false;
  var globalsBound = false;
  var activeEdit = false;
  var cachedTargets = null;
  var cachedMaps = null;

  function normalize(str){
    var s = String(str || '');
    s = s.replace(/[０-９]/g, function(ch){ return String.fromCharCode(ch.charCodeAt(0)-0xFEE0); });
    s = s
      .replace(/[＋]/g, '+')
      .replace(/[－−﹣–—―]/g, '-')
      .replace(/[＊×✕✖]/g, '*')
      .replace(/[／⁄∕]/g, '/')
      .replace(/[÷]/g, '/')
      .replace(/[（]/g, '(')
      .replace(/[）]/g, ')')
      .replace(/[．]/g, '.')
      .replace(/[，、]/g, ',');
    s = s.replace(/[\s\u00A0\u3000,]/g, '');
    return s;
  }

  function tokenize(expr){
    var s = expr;
    if (!/^[0-9+\-*/().]*$/.test(s)) return null;
    var tokens = [];
    var i = 0, prev = null;
    while (i < s.length){
      var c = s[i];
      if (/[0-9.]/.test(c)){
        var start = i, dot = 0;
        while (i < s.length && /[0-9.]/.test(s[i])) { if (s[i]==='.') dot++; i++; }
        if (dot > 1) return null;
        var numStr = s.slice(start, i);
        if (numStr === '.' || numStr === '') return null;
        tokens.push({ type:'num', value: Number(numStr) });
        prev = 'num';
        continue;
      }
      if (c === '(' || c === ')'){
        tokens.push({ type:'paren', value:c });
        i++; prev = c; continue;
      }
      if ('+-*/'.indexOf(c) >= 0){
        var isUnary = (prev == null || prev === 'op' || prev === '(');
        if (isUnary && (c === '+' || c === '-')){
          tokens.push({ type:'op', value: (c === '+' ? 'u+' : 'u-') });
        }else{
          tokens.push({ type:'op', value:c });
        }
        i++; prev = 'op'; continue;
      }
      return null;
    }
    return tokens;
  }

  function toRPN(tokens){
    var out = [], ops = [];
    var prec = { 'u+':3, 'u-':3, '*':2, '/':2, '+':1, '-':1 };
    var rightAssoc = { 'u+':true, 'u-':true };
    for (var i=0;i<tokens.length;i++){
      var t = tokens[i];
      if (t.type === 'num'){ out.push(t); continue; }
      if (t.type === 'op'){
        while (ops.length){
          var top = ops[ops.length-1];
          if (top.type !== 'op') break;
          var pTop = prec[top.value], pCur = prec[t.value];
          if (pTop > pCur || (pTop === pCur && !rightAssoc[t.value])){
            out.push(ops.pop());
          }else break;
        }
        ops.push(t); continue;
      }
      if (t.type === 'paren' && t.value === '('){ ops.push(t); continue; }
      if (t.type === 'paren' && t.value === ')'){
        var matched = false;
        while (ops.length){
          var op = ops.pop();
          if (op.type === 'paren' && op.value === '('){ matched = true; break; }
          out.push(op);
        }
        if (!matched) return null;
        continue;
      }
    }
    while (ops.length){
      var r = ops.pop();
      if (r.type === 'paren') return null;
      out.push(r);
    }
    return out;
  }

  function evalRPN(rpn){
    var st = [];
    for (var i=0;i<rpn.length;i++){
      var t = rpn[i];
      if (t.type === 'num'){ st.push(t.value); continue; }
      if (t.type === 'op'){
        if (t.value === 'u+' || t.value === 'u-'){
          if (st.length < 1) return NaN;
          var a = st.pop();
          st.push(t.value === 'u-' ? -a : +a);
          continue;
        }
        if (st.length < 2) return NaN;
        var b = st.pop(), a2 = st.pop();
        switch (t.value){
          case '+': st.push(a2 + b); break;
          case '-': st.push(a2 - b); break;
          case '*': st.push(a2 * b); break;
          case '/': if (b === 0) return NaN; st.push(a2 / b); break;
        }
      }
    }
    if (st.length !== 1) return NaN;
    return st[0];
  }

  function safeEvalExpression(raw){
    var s = normalize(raw);
    if (s === '') return NaN;
    var tokens = tokenize(s); if (!tokens) return NaN;
    var rpn = toRPN(tokens); if (!rpn) return NaN;
    var v = evalRPN(rpn);
    return Number.isFinite(v) ? v : NaN;
  }

  function coerceToNumberString(str){
    var n = safeEvalExpression(str);
    return Number.isFinite(n) ? String(n) : null;
  }

  function parseJsonSafe(s, def){ try{ return JSON.parse(s); }catch(_){ return def; } }
  function loadTargets(){
    try{
      var raw = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
      var t = parseJsonSafe(raw.targets, null);
      if (!t || typeof t !== 'object'){
        var top = parseJsonSafe(raw.targetsTop, []);
        var sub = parseJsonSafe(raw.targetsSub, []);
        if (!Array.isArray(top)) top = [];
        if (!Array.isArray(sub)) sub = [];
        return { top: top, sub: sub };
      }
      if (!Array.isArray(t.top)) t.top = [];
      if (!Array.isArray(t.sub)) t.sub = [];
      return t;
    }catch(_){ return { top: [], sub: [] }; }
  }
  function loadMappings(){
    try{
      var raw = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
      var mapTop = parseJsonSafe(raw.mapTop, []);
      var mapSub = parseJsonSafe(raw.mapSub, []);
      if (!Array.isArray(mapTop)) mapTop = [];
      if (!Array.isArray(mapSub)) mapSub = [];
      return { mapTop: mapTop, mapSub: mapSub };
    }catch(_){ return { mapTop: [], mapSub: [] }; }
  }

  function buildEffectiveSources(targets, maps){
    targets = targets || cachedTargets || loadTargets();
    maps = maps || cachedMaps || loadMappings();
    var topSet = new Set();
    (targets.top||[]).forEach(function(c){ if (c) topSet.add(c); });
    (maps.mapTop||[]).forEach(function(m){ if (m && m.from) topSet.add(m.from); });

    var subMap = Object.create(null); // table -> Set(codes)
    (targets.sub||[]).forEach(function(gr){
      var set = subMap[gr.table] || (subMap[gr.table] = new Set());
      (gr.fields||[]).forEach(function(c){ if (c) set.add(c); });
    });
    (maps.mapSub||[]).forEach(function(m){
      if (!m || !m.table || !m.from) return;
      var set = subMap[m.table] || (subMap[m.table] = new Set());
      set.add(m.from);
    });
    return { topSet: topSet, subMap: subMap };
  }

  function transformWithTargets(rec, targets, maps){
    var changed = 0; if (!rec) return 0;
    targets = targets || cachedTargets || loadTargets();
    maps = maps || cachedMaps || loadMappings();
    var eff = buildEffectiveSources(targets, maps);
    var topMap = Object.create(null);
    (maps.mapTop||[]).forEach(function(m){ if (m && m.from && m.to){ (topMap[m.from]||(topMap[m.from]=[])).push(m.to); } });
    var subMap = Object.create(null); // subMap[table][from] = [to]
    (maps.mapSub||[]).forEach(function(m){
      if (!m || !m.table || !m.from || !m.to) return;
      var t = subMap[m.table] || (subMap[m.table] = Object.create(null));
      (t[m.from]||(t[m.from]=[])).push(m.to);
    });

    function applyTop(code){
      var f = rec[code]; if (!f || !isStringField(f)) return;
      var raw = f.value == null ? '' : String(f.value);
      if (!startsWithEq(raw)) return;
      var nv = coerceToNumberString(stripEq(raw));
      if (nv == null) return;
      // Do NOT overwrite the source string field; only mirror to mapped numbers
      var dests = topMap[code] || [];
      dests.forEach(function(to){ var g = rec[to]; if (g && g.type==='NUMBER'){ g.value = nv; changed++; } });
    }
    function applySub(tableCode, row, fromCode){
      var cells = row && row.value || {};
      var cell = cells[fromCode]; if (!cell || !isStringField(cell)) return;
      var raw = cell.value == null ? '' : String(cell.value);
      if (!startsWithEq(raw)) return;
      var nv = coerceToNumberString(stripEq(raw));
      if (nv == null) return;
      // Do NOT overwrite source; only mirror to mapped numbers
      var dests = (subMap[tableCode] && subMap[tableCode][fromCode]) || [];
      dests.forEach(function(to){ var g = cells[to]; if (g && g.type==='NUMBER'){ g.value = nv; changed++; } });
    }

    Array.from(eff.topSet).forEach(applyTop);
    Object.keys(eff.subMap).forEach(function(tableCode){
      var table = rec[tableCode]; if (!table || table.type!=='SUBTABLE' || !Array.isArray(table.value)) return;
      var set = eff.subMap[tableCode];
      table.value.forEach(function(row){ set.forEach(function(cd){ applySub(tableCode, row, cd); }); });
    });
    return changed;
  }

  function commitActiveInput(){
    try{
      var el = document.activeElement;
      if (!el) return;
      var tag = (el.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable){ el.blur(); }
    }catch(_){ }
  }

  function isStringField(f){ return f && (f.type === 'SINGLE_LINE_TEXT' /*|| f.type==='MULTI_LINE_TEXT'*/); }
  function startsWithEq(val){
    var s = String(val == null ? '' : val).trim();
    return s.startsWith('=') || s.startsWith('＝') || s.startsWith('+') || s.startsWith('＋');
  }
  function stripEq(val){
    var s = String(val == null ? '' : val).trim();
    if (s.startsWith('＝') || s.startsWith('=') || s.startsWith('＋') || s.startsWith('+')) return s.slice(1);
    return s;
  }
  function tryApplyStringField(field){
    if (!isStringField(field)) return;
    var v = field.value; if (v == null) return;
    if (!startsWithEq(v)) return;
    var expr = stripEq(v);
    var n = safeEvalExpression(expr);
    if (Number.isFinite(n)) field.value = String(n);
  }

  // ----- Runtime helpers for live conversion -----
  function applyByCode(rec, code){
    if (!rec || !code) return;
    // top-level
    if (rec[code] && isStringField(rec[code])){
      var cur = String(rec[code].value == null ? '' : rec[code].value);
      if (startsWithEq(cur)){
        var nv = coerceToNumberString(stripEq(cur));
        if (nv != null){
          // Convert source if configured as a target
          try{
            var tTop = (cachedTargets || loadTargets()).top || [];
            if (tTop.indexOf(code) >= 0){ rec[code].value = nv; }
          }catch(_){ }
          // Mirror to mapped number fields
          var maps = cachedMaps || loadMappings();
          (maps.mapTop||[]).forEach(function(m){ if (m.from===code){ var g = rec[m.to]; if (g && g.type==='NUMBER'){ g.value = nv; } } });
        }
      }
    }
    // subtables
    for (var k in rec){
      if (!Object.prototype.hasOwnProperty.call(rec, k)) continue;
      var f = rec[k];
      if (!f || f.type !== 'SUBTABLE' || !Array.isArray(f.value)) continue;
      f.value.forEach(function(row){
        var cells = row && row.value || {};
        var cell = cells[code];
        if (cell && isStringField(cell)){
          var cur2 = String(cell.value == null ? '' : cell.value);
          if (startsWithEq(cur2)){
            var nv2 = coerceToNumberString(stripEq(cur2));
            if (nv2 != null){
              // Convert source cell if configured as a target for this table
              try{
                var tSub = (cachedTargets || loadTargets()).sub || [];
                var isTarget = tSub.some(function(gr){ return gr && gr.table===k && Array.isArray(gr.fields) && gr.fields.indexOf(code) >= 0; });
                if (isTarget){ cell.value = nv2; }
              }catch(_){ }
              // Mirror to mapped numbers
              var maps = cachedMaps || loadMappings();
              (maps.mapSub||[]).forEach(function(m){ if (m.table===k && m.from===code){ var g = cells[m.to]; if (g && g.type==='NUMBER'){ g.value = nv2; } } });
            }
          }
        }
      });
    }
  }

  function registerChangeHandlersOnce(){
    if (handlersInitialized) return;
    handlersInitialized = true;
    // Bind to union of targets and mapping sources (string)
    var t = loadTargets(); var m = loadMappings();
    var eff = buildEffectiveSources(t, m);
    var codes = new Set(eff.topSet);
    Object.keys(eff.subMap).forEach(function(table){ eff.subMap[table].forEach(function(cd){ codes.add(cd); }); });
    Array.from(codes).forEach(function(code){
      if (registeredCodes.has(code)) return;
      registeredCodes.add(code);
      ['app.record.create.change.'+code, 'app.record.edit.change.'+code].forEach(function(ev){
        kintone.events.on(ev, function(event){ try{ applyByCode(event.record, code); }catch(_){ } return event; });
      });
    });
  }

  function attachBlurHandlers(e){
    var rec = e && e.record || {};
    var eff = buildEffectiveSources(cachedTargets || loadTargets(), cachedMaps || loadMappings());
    Array.from(eff.topSet).forEach(function(code){
      var f = rec[code]; if (!f || !isStringField(f)) return;
      var host = kintone.app.record.getFieldElement(code);
      if (!host) return;
      var input = host.querySelector('input, textarea');
      if (!input || input.dataset.nexpBound === '1') return;
      input.dataset.nexpBound = '1';
      input.addEventListener('blur', function(){
        try{
          var raw = input.value;
          if (!startsWithEq(raw)) return;
          var nv = coerceToNumberString(stripEq(raw));
          if (nv != null){
            var cur = kintone.app.record.get();
            if (cur && cur.record){
              // If configured, convert the source text field too
              try{
                var tTop = (cachedTargets || loadTargets()).top || [];
                if (tTop.indexOf(code) >= 0){ cur.record[code].value = nv; }
              }catch(_){ }
              // Mirror to mapped numbers
              var maps = cachedMaps || loadMappings();
              (maps.mapTop||[]).forEach(function(m){ if (m.from===code){ var g = cur.record[m.to]; if (g && g.type==='NUMBER'){ g.value = nv; } } });
              kintone.app.record.set(cur);
            }
          }
        }catch(_){ }
      });
      // IME composition guard
      input.addEventListener('compositionstart', function(){ input.dataset.nexpIme = '1'; });
      input.addEventListener('compositionend', function(){ delete input.dataset.nexpIme; });
      // Enter key: force convert immediately
      input.addEventListener('keydown', function(ev){
        try{
          if ((ev.key === 'Enter' || ev.keyCode === 13) && input.dataset.nexpIme !== '1' && !ev.isComposing){
            var rawK = input.value;
            if (!startsWithEq(rawK)) return;
            var nvK = coerceToNumberString(stripEq(rawK));
            if (nvK != null){
              ev.preventDefault();
              ev.stopPropagation();
              var curK = kintone.app.record.get();
              if (curK && curK.record){
                // Convert source if configured
                try{
                  var tTop2 = (cachedTargets || loadTargets()).top || [];
                  if (tTop2.indexOf(code) >= 0){ curK.record[code].value = nvK; }
                }catch(_){ }
                var maps = cachedMaps || loadMappings();
                (maps.mapTop||[]).forEach(function(m){ if (m.from===code){ var g = curK.record[m.to]; if (g && g.type==='NUMBER'){ g.value = nvK; } } });
                kintone.app.record.set(curK);
              }
              // notify downstream listeners (keep source text as-is)
              try{ input.dispatchEvent(new Event('change', { bubbles:true })); }catch(_){ }
            }
          }
        }catch(_){ }
      });
      // input 中の自動換算は行わない（誤変換防止）。blur/Enter/submitで換算。
    });
  }

  function bindTopLevelInputsWithRetry(e){
    var eff = buildEffectiveSources(cachedTargets || loadTargets(), cachedMaps || loadMappings());
    var codes = Array.from(eff.topSet);
    var tries = 20;
    (function tick(){
      var pending = 0;
      codes.forEach(function(code){
        var host = kintone.app.record.getFieldElement(code);
        if (!host){ pending++; return; }
        var input = host.querySelector('input, textarea');
        if (!input){ pending++; return; }
        if (input.dataset.nexpBound === '1') return;
        // Attach now via existing helper
        attachBlurHandlers({ record: (e && e.record) || {} });
      });
      if (pending > 0 && --tries > 0){ setTimeout(tick, 150); }
    })();
  }

  function lang(){
    try{ return (kintone.getLoginUser() || {}).language || 'ja'; }catch(_){ return 'ja'; }
  }
  function t(key, value){
    var ja = {
      calc: '換算',
      done: function(n){ return '換算しました（' + n + ' 件）'; },
      none: '換算対象なし（設定で対象フィールドを選択してください）'
    };
    var en = {
      calc: 'Calculate',
      done: function(n){ return 'Converted (' + n + ' fields)'; },
      none: 'No targets (select fields in settings)'
    };
    var L = lang() === 'ja' ? ja : en;
    var v = L[key];
    return typeof v === 'function' ? v(value) : v;
  }


  function preSubmitTransform(){
    try{
      commitActiveInput();
      var cur = kintone.app.record.get();
      if (!cur || !cur.record) return;
      cachedTargets = loadTargets(); cachedMaps = loadMappings();
      var cnt = transformWithTargets(cur.record, cachedTargets, cachedMaps);
      // Also convert source text fields for selected targets (top and sub)
      try{
        var t = cachedTargets || { top: [], sub: [] };
        // Top-level targets
        (t.top||[]).forEach(function(code){
          var f = cur.record[code];
          if (f && isStringField(f)){
            var raw = f.value == null ? '' : String(f.value);
            if (startsWithEq(raw)){
              var nv = coerceToNumberString(stripEq(raw));
              if (nv != null && f.value !== nv){ f.value = nv; cnt++; }
            }
          }
        });
        // Subtable targets
        (t.sub||[]).forEach(function(gr){
          var table = cur.record[gr.table];
          if (!table || table.type !== 'SUBTABLE' || !Array.isArray(table.value)) return;
          table.value.forEach(function(row){
            var cells = row && row.value || {};
            (gr.fields||[]).forEach(function(cd){
              var cell = cells[cd];
              if (cell && isStringField(cell)){
                var raw2 = cell.value == null ? '' : String(cell.value);
                if (startsWithEq(raw2)){
                  var nv2 = coerceToNumberString(stripEq(raw2));
                  if (nv2 != null && cell.value !== nv2){ cell.value = nv2; cnt++; }
                }
              }
            });
          });
        });
      }catch(_){ }
      if (cnt > 0){ kintone.app.record.set(cur); }
    }catch(_){ }
  }

  function installGlobalGuardsOnce(){
    if (globalsBound) return; globalsBound = true;
    // Form submit capture (before default processing)
    document.addEventListener('submit', function(ev){ if (!activeEdit) return; preSubmitTransform(); }, true);
    // Click capture: try to detect Save/Update buttons by roles, automation ids, or text
    document.addEventListener('click', function(ev){
      if (!activeEdit) return;
      var el = ev.target;
      for (var i=0;i<6 && el; i++, el=el.parentElement){
        var id = (el.getAttribute && (el.getAttribute('data-gaia-automation-id')||'')) || '';
        var txt = (el.innerText || el.textContent || '').trim();
        var role = el.getAttribute && el.getAttribute('role');
        if (
          id.includes('record-save') || id.includes('toolbar-save') ||
          /^(保存|Save|Update)$/i.test(txt) ||
          (role === 'button' && /保存|Save|Update/i.test(txt))
        ){
          preSubmitTransform();
          break;
        }
      }
    }, true);
    // Ctrl/Cmd+S
    document.addEventListener('keydown', function(ev){
      if (!activeEdit) return;
      var isMac = navigator.platform && /Mac/.test(navigator.platform);
      if ((isMac ? ev.metaKey : ev.ctrlKey) && (ev.key === 's' || ev.key === 'S')){
        preSubmitTransform();
      }
    }, true);
    // Focusout: convert the field being edited
    document.addEventListener('focusout', function(ev){
      if (!activeEdit) return;
      try{
        var cur = kintone.app.record.get();
        if (!cur || !cur.record) return;
        cachedTargets = loadTargets(); cachedMaps = loadMappings();
        var cnt = transformWithTargets(cur.record, cachedTargets, cachedMaps);
        // Convert sources for selected targets as user moves focus away
        try{
          var t = cachedTargets || { top: [], sub: [] };
          (t.top||[]).forEach(function(code){
            var f = cur.record[code];
            if (f && isStringField(f)){
              var raw = f.value == null ? '' : String(f.value);
              if (startsWithEq(raw)){
                var nv = coerceToNumberString(stripEq(raw));
                if (nv != null && f.value !== nv){ f.value = nv; cnt++; }
              }
            }
          });
          (t.sub||[]).forEach(function(gr){
            var table = cur.record[gr.table];
            if (!table || table.type !== 'SUBTABLE' || !Array.isArray(table.value)) return;
            table.value.forEach(function(row){
              var cells = row && row.value || {};
              (gr.fields||[]).forEach(function(cd){
                var cell = cells[cd];
                if (cell && isStringField(cell)){
                  var raw2 = cell.value == null ? '' : String(cell.value);
                  if (startsWithEq(raw2)){
                    var nv2 = coerceToNumberString(stripEq(raw2));
                    if (nv2 != null && cell.value !== nv2){ cell.value = nv2; cnt++; }
                  }
                }
              });
            });
          });
        }catch(_){ }
        if (cnt > 0){ kintone.app.record.set(cur); }
      }catch(_){ }
    }, true);
  }

  SUBMIT_EVENTS.forEach(function(ev){
    kintone.events.on(ev, function(event){
      try{
        cachedTargets = loadTargets(); cachedMaps = loadMappings();
        transformWithTargets(event.record, cachedTargets, cachedMaps);
        // Also convert selected source text fields on submit
        try{
          var t = cachedTargets || { top: [], sub: [] };
          (t.top||[]).forEach(function(code){
            var f = event.record[code];
            if (f && isStringField(f)){
              var raw = f.value == null ? '' : String(f.value);
              if (startsWithEq(raw)){
                var nv = coerceToNumberString(stripEq(raw));
                if (nv != null){ f.value = nv; }
              }
            }
          });
          (t.sub||[]).forEach(function(gr){
            var table = event.record[gr.table];
            if (!table || table.type !== 'SUBTABLE' || !Array.isArray(table.value)) return;
            table.value.forEach(function(row){
              var cells = row && row.value || {};
              (gr.fields||[]).forEach(function(cd){
                var cell = cells[cd];
                if (cell && isStringField(cell)){
                  var raw2 = cell.value == null ? '' : String(cell.value);
                  if (startsWithEq(raw2)){
                    var nv2 = coerceToNumberString(stripEq(raw2));
                    if (nv2 != null){ cell.value = nv2; }
                  }
                }
              });
            });
          });
        }catch(_){ }
      }catch(_){ }
      return event;
    });
  });

  SHOW_EVENTS.forEach(function(ev){
    kintone.events.on(ev, function(event){
      try{
        activeEdit = true;
        cachedTargets = loadTargets(); cachedMaps = loadMappings();
        registerChangeHandlersOnce();
        // rAFでDOMが安定してからバインド
        requestAnimationFrame(function(){
          attachBlurHandlers(event);
          bindTopLevelInputsWithRetry(event);
          installGlobalGuardsOnce();
        });
      }catch(_){ }
      return event;
    });
  });

  HIDE_EVENTS.forEach(function(ev){
    kintone.events.on(ev, function(event){ activeEdit = false; return event; });
  });

})(kintone.$PLUGIN_ID);
