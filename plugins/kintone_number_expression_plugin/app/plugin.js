(function(PLUGIN_ID) {
  'use strict';

  var SUBMIT_EVENTS = ['app.record.create.submit', 'app.record.edit.submit'];
  var SHOW_EVENTS = ['app.record.create.show', 'app.record.edit.show'];
  var registeredCodes = new Set();
  var handlersInitialized = false;
  var cachedTargets = null;
  var cachedMaps = null;

  function normalize(str) {
    var s = String(str || '');
    s = s.replace(/[\uFF01-\uFF5E]/g, function(ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    });
    s = s
      .replace(/\u2212/g, '-')
      .replace(/\u00D7/g, '*')
      .replace(/\u00F7/g, '/');
    s = s.replace(/[\s\u00A0\u3000,]/g, '');
    return s;
  }

  function tokenize(expr) {
    var s = expr;
    if (!/^[0-9+\-*/().]*$/.test(s)) return null;

    var tokens = [];
    var i = 0;
    var prev = null;

    while (i < s.length) {
      var c = s[i];

      if (/[0-9.]/.test(c)) {
        var start = i;
        var dot = 0;
        while (i < s.length && /[0-9.]/.test(s[i])) {
          if (s[i] === '.') dot++;
          i++;
        }
        if (dot > 1) return null;
        var numStr = s.slice(start, i);
        if (numStr === '.' || numStr === '') return null;
        tokens.push({ type: 'num', value: Number(numStr) });
        prev = 'num';
        continue;
      }

      if (c === '(' || c === ')') {
        tokens.push({ type: 'paren', value: c });
        i++;
        prev = c;
        continue;
      }

      if ('+-*/'.indexOf(c) >= 0) {
        var isUnary = (prev == null || prev === 'op' || prev === '(');
        tokens.push({ type: 'op', value: isUnary && (c === '+' || c === '-') ? (c === '+' ? 'u+' : 'u-') : c });
        i++;
        prev = 'op';
        continue;
      }

      return null;
    }

    return tokens;
  }

  function toRPN(tokens) {
    var out = [];
    var ops = [];
    var prec = { 'u+': 3, 'u-': 3, '*': 2, '/': 2, '+': 1, '-': 1 };
    var rightAssoc = { 'u+': true, 'u-': true };

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];

      if (token.type === 'num') {
        out.push(token);
        continue;
      }

      if (token.type === 'op') {
        while (ops.length) {
          var top = ops[ops.length - 1];
          if (top.type !== 'op') break;
          var pTop = prec[top.value];
          var pCur = prec[token.value];
          if (pTop > pCur || (pTop === pCur && !rightAssoc[token.value])) {
            out.push(ops.pop());
          } else {
            break;
          }
        }
        ops.push(token);
        continue;
      }

      if (token.type === 'paren' && token.value === '(') {
        ops.push(token);
        continue;
      }

      if (token.type === 'paren' && token.value === ')') {
        var matched = false;
        while (ops.length) {
          var op = ops.pop();
          if (op.type === 'paren' && op.value === '(') {
            matched = true;
            break;
          }
          out.push(op);
        }
        if (!matched) return null;
      }
    }

    while (ops.length) {
      var rest = ops.pop();
      if (rest.type === 'paren') return null;
      out.push(rest);
    }

    return out;
  }

  function evalRPN(rpn) {
    var stack = [];

    for (var i = 0; i < rpn.length; i++) {
      var token = rpn[i];

      if (token.type === 'num') {
        stack.push(token.value);
        continue;
      }

      if (token.value === 'u+' || token.value === 'u-') {
        if (stack.length < 1) return NaN;
        var unary = stack.pop();
        stack.push(token.value === 'u-' ? -unary : +unary);
        continue;
      }

      if (stack.length < 2) return NaN;
      var b = stack.pop();
      var a = stack.pop();

      switch (token.value) {
        case '+':
          stack.push(a + b);
          break;
        case '-':
          stack.push(a - b);
          break;
        case '*':
          stack.push(a * b);
          break;
        case '/':
          if (b === 0) return NaN;
          stack.push(a / b);
          break;
      }
    }

    return stack.length === 1 ? stack[0] : NaN;
  }

  function safeEvalExpression(raw) {
    var s = normalize(raw);
    if (s === '') return NaN;
    var tokens = tokenize(s);
    if (!tokens) return NaN;
    var rpn = toRPN(tokens);
    if (!rpn) return NaN;
    var value = evalRPN(rpn);
    return Number.isFinite(value) ? value : NaN;
  }

  function coerceToNumberString(str) {
    var value = safeEvalExpression(str);
    return Number.isFinite(value) ? String(value) : null;
  }

  function parseJsonSafe(s, def) {
    try {
      return JSON.parse(s);
    } catch (_) {
      return def;
    }
  }

  function loadTargets() {
    try {
      var raw = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
      var targets = parseJsonSafe(raw.targets, null);
      if (!targets || typeof targets !== 'object') {
        var top = parseJsonSafe(raw.targetsTop, []);
        var sub = parseJsonSafe(raw.targetsSub, []);
        if (!Array.isArray(top)) top = [];
        if (!Array.isArray(sub)) sub = [];
        return { top: top, sub: sub };
      }
      if (!Array.isArray(targets.top)) targets.top = [];
      if (!Array.isArray(targets.sub)) targets.sub = [];
      return targets;
    } catch (_) {
      return { top: [], sub: [] };
    }
  }

  function loadMappings() {
    try {
      var raw = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
      var mapTop = parseJsonSafe(raw.mapTop, []);
      var mapSub = parseJsonSafe(raw.mapSub, []);
      if (!Array.isArray(mapTop)) mapTop = [];
      if (!Array.isArray(mapSub)) mapSub = [];
      return { mapTop: mapTop, mapSub: mapSub };
    } catch (_) {
      return { mapTop: [], mapSub: [] };
    }
  }

  function refreshCachedConfig() {
    cachedTargets = loadTargets();
    cachedMaps = loadMappings();
    return {
      targets: cachedTargets,
      maps: cachedMaps
    };
  }

  function getCachedConfig() {
    if (!cachedTargets || !cachedMaps) return refreshCachedConfig();
    return {
      targets: cachedTargets,
      maps: cachedMaps
    };
  }

  function buildEffectiveSources(targets, maps) {
    var topSet = new Set();
    var subMap = Object.create(null);

    (targets.top || []).forEach(function(code) {
      if (code) topSet.add(code);
    });
    (maps.mapTop || []).forEach(function(mapping) {
      if (mapping && mapping.from) topSet.add(mapping.from);
    });

    (targets.sub || []).forEach(function(group) {
      if (!group || !group.table) return;
      var set = subMap[group.table] || (subMap[group.table] = new Set());
      (group.fields || []).forEach(function(code) {
        if (code) set.add(code);
      });
    });

    (maps.mapSub || []).forEach(function(mapping) {
      if (!mapping || !mapping.table || !mapping.from) return;
      var set = subMap[mapping.table] || (subMap[mapping.table] = new Set());
      set.add(mapping.from);
    });

    return { topSet: topSet, subMap: subMap };
  }

  function buildIndexes(targets, maps) {
    var topTargets = new Set(targets.top || []);
    var subTargets = Object.create(null);
    var topMap = Object.create(null);
    var subMap = Object.create(null);

    (targets.sub || []).forEach(function(group) {
      if (!group || !group.table) return;
      subTargets[group.table] = new Set(Array.isArray(group.fields) ? group.fields : []);
    });

    (maps.mapTop || []).forEach(function(mapping) {
      if (!mapping || !mapping.from || !mapping.to) return;
      (topMap[mapping.from] || (topMap[mapping.from] = [])).push(mapping.to);
    });

    (maps.mapSub || []).forEach(function(mapping) {
      if (!mapping || !mapping.table || !mapping.from || !mapping.to) return;
      var tableMap = subMap[mapping.table] || (subMap[mapping.table] = Object.create(null));
      (tableMap[mapping.from] || (tableMap[mapping.from] = [])).push(mapping.to);
    });

    return {
      topTargets: topTargets,
      subTargets: subTargets,
      topMap: topMap,
      subMap: subMap,
      effective: buildEffectiveSources(targets, maps)
    };
  }

  function isStringField(field) {
    return field && field.type === 'SINGLE_LINE_TEXT';
  }

  function startsWithExpression(val) {
    var s = String(val == null ? '' : val).trim();
    return s.startsWith('=') || s.startsWith('+') || s.startsWith('\uFF1D') || s.startsWith('\uFF0B');
  }

  function stripExpressionPrefix(val) {
    var s = String(val == null ? '' : val).trim();
    return startsWithExpression(s) ? s.slice(1) : s;
  }

  function applyResult(container, value, destinationCodes) {
    var changed = 0;

    destinationCodes.forEach(function(to) {
      var dest = container[to];
      if (!dest || dest.type !== 'NUMBER') return;
      if (dest.value !== value) {
        dest.value = value;
        changed++;
      }
    });

    return changed;
  }

  function applySourceField(container, code, shouldConvertSource, destinationCodes) {
    var field = container[code];
    if (!isStringField(field)) return 0;

    var raw = field.value == null ? '' : String(field.value);
    if (!startsWithExpression(raw)) return 0;

    var nextValue = coerceToNumberString(stripExpressionPrefix(raw));
    if (nextValue == null) return 0;

    var changed = 0;
    if (shouldConvertSource && field.value !== nextValue) {
      field.value = nextValue;
      changed++;
    }

    return changed + applyResult(container, nextValue, destinationCodes);
  }

  function transformRecord(record, options) {
    if (!record) return 0;

    var config = options || getCachedConfig();
    var indexes = config.indexes || buildIndexes(config.targets, config.maps);
    var changed = 0;

    Array.from(indexes.effective.topSet).forEach(function(code) {
      changed += applySourceField(record, code, indexes.topTargets.has(code), indexes.topMap[code] || []);
    });

    Object.keys(indexes.effective.subMap).forEach(function(tableCode) {
      var table = record[tableCode];
      if (!table || table.type !== 'SUBTABLE' || !Array.isArray(table.value)) return;

      var sourceCodes = indexes.effective.subMap[tableCode];
      table.value.forEach(function(row) {
        var cells = (row && row.value) || {};
        sourceCodes.forEach(function(code) {
          var isTarget = !!(indexes.subTargets[tableCode] && indexes.subTargets[tableCode].has(code));
          var destinations = (indexes.subMap[tableCode] && indexes.subMap[tableCode][code]) || [];
          changed += applySourceField(cells, code, isTarget, destinations);
        });
      });
    });

    return changed;
  }

  function applyByCode(record, code) {
    if (!record || !code) return 0;

    var config = getCachedConfig();
    var indexes = buildIndexes(config.targets, config.maps);
    var changed = 0;

    if (indexes.effective.topSet.has(code)) {
      changed += applySourceField(record, code, indexes.topTargets.has(code), indexes.topMap[code] || []);
    }

    Object.keys(indexes.effective.subMap).forEach(function(tableCode) {
      var sourceCodes = indexes.effective.subMap[tableCode];
      if (!sourceCodes.has(code)) return;

      var table = record[tableCode];
      if (!table || table.type !== 'SUBTABLE' || !Array.isArray(table.value)) return;

      table.value.forEach(function(row) {
        var cells = (row && row.value) || {};
        var isTarget = !!(indexes.subTargets[tableCode] && indexes.subTargets[tableCode].has(code));
        var destinations = (indexes.subMap[tableCode] && indexes.subMap[tableCode][code]) || [];
        changed += applySourceField(cells, code, isTarget, destinations);
      });
    });

    return changed;
  }

  function registerChangeHandlersOnce() {
    if (handlersInitialized) return;
    handlersInitialized = true;

    var config = getCachedConfig();
    var effective = buildEffectiveSources(config.targets, config.maps);
    var codes = new Set(effective.topSet);

    Object.keys(effective.subMap).forEach(function(tableCode) {
      effective.subMap[tableCode].forEach(function(code) {
        codes.add(code);
      });
    });

    Array.from(codes).forEach(function(code) {
      if (registeredCodes.has(code)) return;
      registeredCodes.add(code);

      ['app.record.create.change.' + code, 'app.record.edit.change.' + code].forEach(function(eventType) {
        kintone.events.on(eventType, function(event) {
          try {
            refreshCachedConfig();
            applyByCode(event.record, code);
          } catch (_) {
          }
          return event;
        });
      });
    });
  }

  SUBMIT_EVENTS.forEach(function(eventType) {
    kintone.events.on(eventType, function(event) {
      try {
        var config = refreshCachedConfig();
        var indexes = buildIndexes(config.targets, config.maps);
        transformRecord(event.record, {
          targets: config.targets,
          maps: config.maps,
          indexes: indexes
        });
      } catch (_) {
      }
      return event;
    });
  });

  SHOW_EVENTS.forEach(function(eventType) {
    kintone.events.on(eventType, function(event) {
      try {
        refreshCachedConfig();
        registerChangeHandlersOnce();
      } catch (_) {
      }
      return event;
    });
  });
})(kintone.$PLUGIN_ID);
