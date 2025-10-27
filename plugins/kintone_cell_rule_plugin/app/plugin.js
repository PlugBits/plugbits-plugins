/* src/js/plugin.js
 * 条件付き書式（一覧ビュー専用）
 * ES2019 / IIFE / DOM非破壊 / 動的innerHTMLなし
 * 対応: number / text / date / choice(RADIO/DROP_DOWN) / set(CHECK_BOX)
 */
(function (PLUGIN_ID) {
  'use strict';

  var EVENTS = ['app.record.index.show', 'app.record.detail.show']; // 一覧のみ

  // ---------- Style injection ----------
  var CSS_PLUGIN =
    "td.puchi-bg-red{background:#fde8e8!important;color:#c0392b!important;}" +
    "td.puchi-bg-green{background:#e8f7ec!important;color:#1e824c!important;}" +
    "td.puchi-bg-yellow{background:#fff7da!important;color:#8a6d3b!important;}" +
    "td.puchi-bg-blue{background:#e7f0fe!important;color:#1e3a8a!important;}" +
    "td.puchi-bg-orange{background:#fff1e6!important;color:#9a3412!important;}" +
    "td.puchi-bg-purple{background:#f3e8ff!important;color:#6b21a8!important;}" +
    "td.puchi-bg-teal{background:#e6fffb!important;color:#115e59!important;}" +
    "td.puchi-bg-gray{background:#d1d5db!important;color:#475569!important;}" +
    ".puchi-bg-layer{position:absolute;inset:0;border-radius:2px;pointer-events:none;}";
  function injectStyle(css) {
    var id = 'puchi-style';
    if (document.getElementById(id)) return;
    var el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ---------- Tiny utils ----------
  function parseNumber(x) {
    if (x == null) return NaN;
    var s = String(x).replace(/,/g, '').trim();
    return s ? Number(s) : NaN;
  }
  function parseDateFromText(s) {
    if (!s) return null;
    var m = String(s).trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  function daysBetweenUTC(a, b) {
    var AU = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    var BU = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.abs((AU - BU) / 86400000);
  }
  function todayUTC() {
    var t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }
  // 正規化（NBSP/ゼロ幅/全角SP吸収・空白畳み）
  function norm(s){
    return String(s == null ? '' : s)
      .replace(/\u00A0/g, ' ')
      .replace(/\u200B/g, '')
      .replace(/\uFEFF/g, '')
      .replace(/\u3000/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function splitChoices(txt){
    if (!txt) return [];
    var parts = String(txt).split(/(?:\r?\n|,|、|;|・|\t)\s*/);
    var out=[]; for (var i=0;i<parts.length;i++){ var v = norm(parts[i]); if (v) out.push(v); }
    return out;
  }

  // ---------- Color helpers ----------
  var COLOR_CLASS = {
    red:'puchi-bg-red', green:'puchi-bg-green', yellow:'puchi-bg-yellow',
    blue:'puchi-bg-blue', orange:'puchi-bg-orange', purple:'puchi-bg-purple',
    teal:'puchi-bg-teal', gray:'puchi-bg-gray'
  };
  var COLOR_STYLE = {
    red:    { bg: '#f8d7da', fg: '#a71d2a', shadow: '' },
    green:  { bg: '#d4edda', fg: '#146c43', shadow: '' },
    yellow: { bg: '#fff3cd', fg: '#856404', shadow: '' },
    blue:   { bg: '#d0e2ff', fg: '#003399', shadow: '' },
    orange: { bg: '#ffe5b4', fg: '#cc5500', shadow: '' },
    purple: { bg: '#e0cffe', fg: '#6f42c1', shadow: '' },
    teal:   { bg: '#b2f0e4', fg: '#0f766e', shadow: '' },
    gray:   { bg: '#cbd5e1', fg: '#334155', shadow: '' } 
  };
  // 表示面（surface）＝ .recordlist-cell-gaia があればそれ、無ければ td
  function surfaceOf(cell){
    var td = cell && cell.closest ? (cell.closest('td') || cell) : cell;
    if (!td) return cell;
    if (td.classList && td.classList.contains('recordlist-cell-gaia')) return td;
    var s = td.querySelector && td.querySelector('.recordlist-cell-gaia');
    return s || td;
  }

  // 強制塗り/クリア（!important）
  function paint(el, sty){
    if (!el) return;
    // 背景は background-color ではなく background を使い、
    // 既存の背景画像やグラデを確実に潰す
    if (sty.bg) {
      el.style.setProperty('background', sty.bg, 'important');
      el.style.setProperty('background-image', 'none', 'important');
    }
    if (sty.fg) el.style.setProperty('color', sty.fg, 'important');
    if (sty.shadow) el.style.setProperty('box-shadow', sty.shadow, 'important');
    el.setAttribute('data-puchi-applied', '1');
  }

  function clearPaint(el){
    if (!el) return;
    el.style.removeProperty('background-color');
    el.style.removeProperty('color');
    el.style.removeProperty('box-shadow');
    el.removeAttribute('data-puchi-applied');
  }

  // クリアは一元化（※二重定義禁止）
  function clearEffects() {
    var nodes = document.querySelectorAll('[data-puchi-applied="1"]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      for (var c in COLOR_CLASS) if (COLOR_CLASS.hasOwnProperty(c)) el.classList.remove(COLOR_CLASS[c]);
      // ← ここを拡張
      el.style.removeProperty('background');
      el.style.removeProperty('background-image');
      el.style.removeProperty('background-color');
      el.style.removeProperty('color');
      el.style.removeProperty('box-shadow');
      el.removeAttribute('data-puchi-applied');

      var inner = el.firstElementChild;
      if (inner) {
        inner.style.removeProperty('background');
        inner.style.removeProperty('background-image');
        inner.style.removeProperty('background-color');
        inner.style.removeProperty('color');
        inner.style.removeProperty('box-shadow');
      }
    }
  }


  // ---------- Rule evaluator ----------
  function test(rule, raw) {
    var type = rule.type || 'text';
    var op   = rule.op   || '=';
    var TD   = todayUTC();

    if (type === 'number') {
      var n = parseNumber(raw);
      if (isNaN(n)) return false;
      var v  = Array.isArray(rule.value) ? parseNumber(rule.value[0]) : parseNumber(rule.value);
      var v2 = Array.isArray(rule.value) ? parseNumber(rule.value[1]) : NaN;
      if (op === '=')  return n === v;
      if (op === '!=') return n !== v;
      if (op === '>')  return n >  v;
      if (op === '>=') return n >= v;
      if (op === '<')  return n <  v;
      if (op === '<=') return n <= v;
      if (op === 'between')    return !isNaN(v)&&!isNaN(v2) ? (n >= Math.min(v,v2) && n <= Math.max(v,v2)) : false;
      if (op === 'notBetween') return !isNaN(v)&&!isNaN(v2) ? !(n >= Math.min(v,v2) && n <= Math.max(v,v2)) : false;
      return false;
    }

    if (type === 'text') {
      var s = norm(raw);
      if (op === '=')  return s === norm(rule.value);
      if (op === '!=') return s !== norm(rule.value);
      if (op === 'contains')    return s.indexOf(norm(rule.value)) > -1;
      if (op === 'notContains') return s.indexOf(norm(rule.value)) === -1;
      if (op === 'regex') {
        try { return new RegExp(String(rule.value || '')).test(s); } catch(e){ return false; }
      }
      return false;
    }

    if (type === 'choice') {
      var cs = norm(raw);
      if (op === '=')  return cs === norm(rule.value);
      if (op === '!=') return cs !== norm(rule.value);
      if (op === 'in') {
        var arr = (Array.isArray(rule.value) ? rule.value : [rule.value]).map(norm);
        return arr.indexOf(cs) > -1;
      }
      if (op === 'notIn') {
        var arr2 = (Array.isArray(rule.value) ? rule.value : [rule.value]).map(norm);
        return arr2.indexOf(cs) === -1;
      }
      return false;
    }

    if (type === 'set') {
      
      return null;
    }

    if (type === 'date') {
      var d = raw instanceof Date ? raw : parseDateFromText(raw);
      if (!d) return false;
      var vdate = null;
      if (op === '=' || op === '!=') vdate = parseDateFromText(rule.value);
      if (op === '=')  return vdate ? daysBetweenUTC(d, vdate) === 0 : false;
      if (op === '!=') return vdate ? daysBetweenUTC(d, vdate) !== 0 : false;

      var TDZ = todayUTC();
      if (op === 'today')     return daysBetweenUTC(d, TDZ) === 0;
      if (op === 'yesterday'){ var Y=new Date(TDZ.getFullYear(),TDZ.getMonth(),TDZ.getDate()-1); return daysBetweenUTC(d,Y)===0; }
      if (op === 'tomorrow') { var T=new Date(TDZ.getFullYear(),TDZ.getMonth(),TDZ.getDate()+1); return daysBetweenUTC(d,T)===0; }
      if (op === 'past')   return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()) < Date.UTC(TDZ.getFullYear(),TDZ.getMonth(),TDZ.getDate());
      if (op === 'future') return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()) > Date.UTC(TDZ.getFullYear(),TDZ.getMonth(),TDZ.getDate());
      if (op === 'withinDays'){ var n2=parseNumber(rule.value)||0; return daysBetweenUTC(d, TDZ) <= n2; }
      if (op === 'olderThanDays'){ var n3=parseNumber(rule.value)||0; return daysBetweenUTC(d, TDZ) > n3; }
      return false;
    }

    return false;
  }

  // ---------- DOM helpers ----------
  function cellRawFromElement(el, type) {
    if (!el) return null;
    var txt = norm(el.textContent || '');
    if (type === 'set') return splitChoices(txt);
    return txt; // text / number / date / choice
  }

  // ---------- Core ----------
  function runIndex(event, rules) {
    if (!Array.isArray(rules) || rules.length === 0) return;
    clearEffects();

    for (var r = 0; r < rules.length; r++) {
      var rule = rules[r];
      if (!rule || !rule.field) continue;

      var cells = kintone.app.getFieldElements(rule.field);
      if (!cells || !cells.length) continue;

      for (var i = 0; i < cells.length; i++) {
        var raw = cellRawFromElement(cells[i], rule.type);
        if (test(rule, raw)) {
          var key = (rule.color || 'yellow').toLowerCase();
          var sty = COLOR_STYLE[key] || COLOR_STYLE.yellow;
          var td = cells[i].closest ? (cells[i].closest('td') || cells[i]) : cells[i];
          var surf = surfaceOf(cells[i]);
          // クラス（任意）
          var cls = COLOR_CLASS[key] || COLOR_CLASS.yellow;
          td.classList && td.classList.add(cls);
          surf.classList && surf.classList.add(cls);
          // 直塗り（確実に見える）
          paint(td, sty);
          if (surf && surf !== td) paint(surf, sty);

          // 直下div（例: <div class="line-cell-gaia ...">）
          var inner = surf && surf.firstElementChild ? surf.firstElementChild : null;
          if (inner) paint(inner, { bg: sty.bg, fg: sty.fg, shadow: '' });

          // さらに最内の <span> も塗る（白背景で隠すテーマ対策）
          var span = inner && inner.firstElementChild ? inner.firstElementChild : null;
          if (span && span.tagName === 'SPAN') {
            paint(span, { bg: sty.bg, fg: sty.fg, shadow: '' });
          }
        }
      }
    }
  }

  // 詳細画面用（単一レコードのフィールド要素に対して適用）
  function runDetail(event, rules){
    if (!Array.isArray(rules) || rules.length === 0) return;
    clearEffects();
    for (var r = 0; r < rules.length; r++) {
      var rule = rules[r];
      if (!rule || !rule.field) continue;
      var el = (kintone.app && kintone.app.record && kintone.app.record.getFieldElement)
        ? kintone.app.record.getFieldElement(rule.field)
        : null;
      if (!el) continue;
      var raw = cellRawFromElement(el, rule.type);
      if (!test(rule, raw)) continue;
      var key = (rule.color || 'yellow').toLowerCase();
      var sty = COLOR_STYLE[key] || COLOR_STYLE.yellow;
      // 詳細はセルが <div> 等のことが多いので、その要素自体を塗る
      var surf = surfaceOf(el) || el;
      // クラス（任意）
      var cls = COLOR_CLASS[key] || COLOR_CLASS.yellow;
      if (surf && surf.classList) surf.classList.add(cls);
      if (el && el.classList) el.classList.add(cls);
      // 直塗り
      paint(surf, sty);
      if (el && el !== surf) paint(el, sty);
      // 内側の表示テキストもなるべく読めるように薄く塗る
      var inner = surf && surf.firstElementChild ? surf.firstElementChild : null;
      if (inner) paint(inner, { bg: sty.bg, fg: sty.fg, shadow: '' });
      var span = inner && inner.firstElementChild ? inner.firstElementChild : null;
      if (span && span.tagName === 'SPAN') paint(span, { bg: sty.bg, fg: sty.fg, shadow: '' });
    }
  }

  // DOM差し替えに追随
  function observeIndexUpdates(run) {
    var container =
      document.querySelector('#recordlist-gaia') ||
      document.querySelector('.gaia-argoui-app-index') ||
      document.querySelector('.recordlist-gaia');
    if (!container || container.__puchiObserver) return;

    var timer = null;
    var obs = new MutationObserver(function () {
      if (timer) return;
      timer = setTimeout(function () {
        timer = null;
        try { run(); } catch (e) { console.error(e); }
      }, 100);
    });
    obs.observe(container, { childList: true, subtree: true });
    container.__puchiObserver = obs;
  }
  function getPluginId(){ return PLUGIN_ID; }

  // 2) 設定読取（rules を配列で返す）
  function getConfigSafe(){
    try{
      var pid = getPluginId();
      if (!pid) return { rules: [] };
      var raw = kintone.plugin.app.getConfig(pid) || {};
      return {
        rules: raw.rules ? JSON.parse(raw.rules) : [],
        applyToDetail: raw.applyToDetail === 'true'
      };
    }catch(e){
      console.error('[puchi] getConfigSafe error:', e);
      return { rules: [], applyToDetail: false };
    }
  }

  // 手動再実行フック
  window.__puchi_rerun = function(){
    try { var cfg = getConfigSafe(); runIndex(null, cfg.rules); } catch(e){ console.error(e); }
  };

  // ---------- Boot ----------
  injectStyle(CSS_PLUGIN);
  var _lastEvent = null;
  EVENTS.forEach(function (ev) {
    if (!(kintone && kintone.events && kintone.events.on)) return;
    kintone.events.on(ev, function (event) {
      _lastEvent = event;
      var cfg = getConfigSafe();
      // 詳細イベントだが設定OFFなら何もしない
      if (ev === 'app.record.detail.show' && !cfg.applyToDetail) return event;

      function later(){
        try {
          if (ev === 'app.record.index.show') {
            runIndex(event, cfg.rules);
          } else {
            runDetail(event, cfg.rules);
          }
        } catch(e){ console.error(e); }
      }
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function(){ requestAnimationFrame(later); });
      } else {
        setTimeout(later, 300);
      }

      // 一覧のDOM差し替え監視はそのまま（詳細は基本静的のため不要）
      if (ev === 'app.record.index.show') {
        observeIndexUpdates(function(){
          try { runIndex(_lastEvent || event, getConfigSafe().rules); } catch(e){ console.error(e); }
        });
      }

      return event;
    });
  });
})(kintone.$PLUGIN_ID);
