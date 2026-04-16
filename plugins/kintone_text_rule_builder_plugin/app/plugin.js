(function(PLUGIN_ID) {
  'use strict';

  var SHOW_EVENTS = ['app.record.create.show', 'app.record.edit.show'];
  var SUBMIT_EVENTS = ['app.record.create.submit', 'app.record.edit.submit'];
  var handlersInitialized = false;
  var registeredCodes = new Set();
  var cachedConfig = null;

  function parseJsonSafe(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function usesRangeValue(op) {
    return op === 'between' || op === 'notBetween';
  }

  function usesListValue(op) {
    return op === 'in' || op === 'notIn';
  }

  function isValueLessOperator(op) {
    return op === 'isEmpty' || op === 'isNotEmpty' || op === 'today' || op === 'yesterday' || op === 'tomorrow';
  }

  function supportsFieldReference(type, op) {
    if (isValueLessOperator(op) || usesRangeValue(op) || usesListValue(op)) return false;
    if (type === 'number') return ['=', '!=', '>', '>=', '<', '<='].indexOf(op) >= 0;
    if (type === 'choice') return ['=', '!='].indexOf(op) >= 0;
    if (type === 'date' || type === 'datetime') return ['=', '!=', 'before', 'after'].indexOf(op) >= 0;
    return ['=', '!=', 'contains', 'notContains', 'startsWith', 'endsWith'].indexOf(op) >= 0;
  }

  function supportsExpressionReference(type, op) {
    return type === 'number' && ['=', '!=', '>', '>=', '<', '<='].indexOf(op) >= 0;
  }

  function getAvailableValueModes(condition) {
    var current = condition || {};
    var modes = ['literal'];
    var type = current.type || 'text';
    var op = current.op || '=';
    if (supportsFieldReference(type, op)) modes.push('field');
    if (supportsExpressionReference(type, op)) modes.push('expression');
    return modes;
  }

  function getNormalizedValueMode(condition) {
    var mode = condition && condition.valueMode ? condition.valueMode : 'literal';
    return getAvailableValueModes(condition).indexOf(mode) >= 0 ? mode : 'literal';
  }

  function normalizeCondition(condition) {
    var normalized = condition && typeof condition === 'object' ? condition : {};
    var next = {
      id: normalized.id || '',
      field: normalized.field || '',
      type: normalized.type || 'text',
      op: normalized.op || '=',
      value: normalized.value,
      valueMode: normalized.valueMode || 'literal',
      valueField: normalized.valueField || '',
      valueExpression: normalized.valueExpression == null ? '' : String(normalized.valueExpression)
    };
    next.valueMode = getNormalizedValueMode(next);
    return next;
  }

  function normalizeBranch(branch) {
    var normalized = branch && typeof branch === 'object' ? branch : {};
    return {
      id: normalized.id || '',
      name: normalized.name || '',
      join: normalized.join === 'OR' ? 'OR' : 'AND',
      output: normalized.output == null ? '' : String(normalized.output),
      conditions: Array.isArray(normalized.conditions) ? normalized.conditions.map(normalizeCondition) : []
    };
  }

  function normalizeRuleSet(ruleSet) {
    var normalized = ruleSet && typeof ruleSet === 'object' ? ruleSet : {};
    return {
      id: normalized.id || '',
      name: normalized.name || '',
      elseOutput: normalized.elseOutput == null ? '' : String(normalized.elseOutput),
      collapsed: !!normalized.collapsed,
      rules: Array.isArray(normalized.rules) ? normalized.rules.map(normalizeBranch) : []
    };
  }

  function normalizeTarget(target) {
    var normalized = target && typeof target === 'object' ? target : {};
    return {
      id: normalized.id || '',
      field: normalized.field || '',
      ruleSetId: normalized.ruleSetId || '',
      lockOutputField: normalized.lockOutputField !== false
    };
  }

  function buildLegacyConfig(raw) {
    var legacyRules = parseJsonSafe(raw.rules, []);
    var ruleSetId = 'legacy_rule_set';
    return {
      ruleSets: [{
        id: ruleSetId,
        name: 'Legacy Rule Set',
        elseOutput: raw.elseOutput == null ? '' : String(raw.elseOutput),
        collapsed: false,
        rules: Array.isArray(legacyRules) ? legacyRules.map(normalizeBranch) : []
      }],
      targets: raw.outputField ? [{
        id: 'legacy_target',
        field: raw.outputField,
        ruleSetId: ruleSetId,
        lockOutputField: raw.lockOutputField !== 'false'
      }] : []
    };
  }

  function loadConfig() {
    var raw = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
    var ruleSets = parseJsonSafe(raw.ruleSets, null);
    var targets = parseJsonSafe(raw.targets, null);

    if (!Array.isArray(ruleSets) || !Array.isArray(targets)) {
      cachedConfig = buildLegacyConfig(raw);
      return cachedConfig;
    }

    cachedConfig = {
      ruleSets: ruleSets.map(normalizeRuleSet),
      targets: targets.map(normalizeTarget)
    };
    return cachedConfig;
  }

  function getConfig() {
    return cachedConfig || loadConfig();
  }

  function normalizeText(value) {
    return String(value == null ? '' : value)
      .replace(/\u00A0/g, ' ')
      .replace(/\u200B/g, '')
      .replace(/\uFEFF/g, '')
      .replace(/\u3000/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseNumber(value) {
    if (value == null || value === '') return NaN;
    var text = String(value).replace(/,/g, '').trim();
    return text ? Number(text) : NaN;
  }

  function tokenizeNumericExpression(expression) {
    var source = String(expression == null ? '' : expression);
    var tokens = [];
    var index = 0;

    while (index < source.length) {
      var char = source.charAt(index);
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      if ('+-*/()'.indexOf(char) >= 0) {
        tokens.push({ type: char, value: char });
        index += 1;
        continue;
      }
      if (char === '[') {
        var endIndex = source.indexOf(']', index + 1);
        if (endIndex < 0) throw new Error('Invalid expression');
        var code = source.slice(index + 1, endIndex).trim();
        if (!code) throw new Error('Invalid expression');
        tokens.push({ type: 'field', value: code });
        index = endIndex + 1;
        continue;
      }
      if ((char >= '0' && char <= '9') || char === '.') {
        var cursor = index + 1;
        while (cursor < source.length && /[\d,.]/.test(source.charAt(cursor))) cursor += 1;
        var numberToken = source.slice(index, cursor);
        if (isNaN(parseNumber(numberToken))) throw new Error('Invalid expression');
        tokens.push({ type: 'number', value: numberToken });
        index = cursor;
        continue;
      }
      throw new Error('Invalid expression');
    }

    return tokens;
  }

  function runNumericExpression(expression, resolveField) {
    try {
      var tokens = tokenizeNumericExpression(expression);
      var index = 0;

      function peek() {
        return tokens[index] || null;
      }

      function consume(expectedType) {
        var token = peek();
        if (!token || (expectedType && token.type !== expectedType)) throw new Error('Unexpected token');
        index += 1;
        return token;
      }

      function parsePrimary() {
        var token = peek();
        if (!token) throw new Error('Unexpected end');
        if (token.type === 'number') return parseNumber(consume('number').value);
        if (token.type === 'field') {
          var resolved = resolveField ? resolveField(consume('field').value) : NaN;
          if (isNaN(resolved)) throw new Error('Invalid field value');
          return resolved;
        }
        if (token.type === '(') {
          consume('(');
          var value = parseExpression();
          consume(')');
          return value;
        }
        throw new Error('Unexpected token');
      }

      function parseUnary() {
        var token = peek();
        if (token && (token.type === '+' || token.type === '-')) {
          consume(token.type);
          var value = parseUnary();
          return token.type === '-' ? -value : value;
        }
        return parsePrimary();
      }

      function parseMulDiv() {
        var value = parseUnary();
        while (true) {
          var token = peek();
          if (!token || (token.type !== '*' && token.type !== '/')) return value;
          consume(token.type);
          var right = parseUnary();
          value = token.type === '*' ? value * right : value / right;
          if (!isFinite(value)) throw new Error('Non-finite result');
        }
      }

      function parseExpression() {
        var value = parseMulDiv();
        while (true) {
          var token = peek();
          if (!token || (token.type !== '+' && token.type !== '-')) return value;
          consume(token.type);
          var right = parseMulDiv();
          value = token.type === '+' ? value + right : value - right;
          if (!isFinite(value)) throw new Error('Non-finite result');
        }
      }

      if (!tokens.length) return NaN;
      var result = parseExpression();
      if (index !== tokens.length || !isFinite(result)) return NaN;
      return result;
    } catch (_) {
      return NaN;
    }
  }

  function getExpressionFieldCodes(expression) {
    try {
      var seen = Object.create(null);
      var codes = [];
      tokenizeNumericExpression(expression).forEach(function(token) {
        if (token.type !== 'field' || seen[token.value]) return;
        seen[token.value] = true;
        codes.push(token.value);
      });
      return codes;
    } catch (_) {
      return [];
    }
  }

  function getRecordFieldValue(record, code) {
    var field = record[code];
    return field ? field.value : '';
  }

  function evaluateNumericExpression(expression, record) {
    return runNumericExpression(expression, function(code) {
      return parseNumber(getRecordFieldValue(record, code));
    });
  }

  function parseDayValue(value) {
    if (!value) return null;
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());

    var text = String(value).trim();
    var match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

    var fallback = new Date(text);
    if (isNaN(fallback.getTime())) return null;
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
  }

  function today() {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function dayDiff(left, right) {
    var leftUtc = Date.UTC(left.getFullYear(), left.getMonth(), left.getDate());
    var rightUtc = Date.UTC(right.getFullYear(), right.getMonth(), right.getDate());
    return Math.round((leftUtc - rightUtc) / 86400000);
  }

  function isEmptyValue(value) {
    if (Array.isArray(value)) return value.length === 0;
    return value == null || String(value) === '';
  }

  function resolveNumberComparisonValue(condition, record) {
    var mode = getNormalizedValueMode(condition);
    if (mode === 'field') {
      if (!condition.valueField) return NaN;
      return parseNumber(getRecordFieldValue(record, condition.valueField));
    }
    if (mode === 'expression') return evaluateNumericExpression(condition.valueExpression, record);
    return parseNumber(condition.value);
  }

  function resolveTextComparisonValue(condition, record) {
    var mode = getNormalizedValueMode(condition);
    if (mode === 'field') {
      if (!condition.valueField) return null;
      return normalizeText(getRecordFieldValue(record, condition.valueField));
    }
    return normalizeText(condition.value);
  }

  function resolveDateComparisonValue(condition, record) {
    var mode = getNormalizedValueMode(condition);
    if (mode === 'field') {
      if (!condition.valueField) return null;
      return parseDayValue(getRecordFieldValue(record, condition.valueField));
    }
    return parseDayValue(condition.value);
  }

  function getConditionReferencedFieldCodes(condition) {
    var seen = Object.create(null);
    var codes = [];

    function add(code) {
      if (!code || seen[code]) return;
      seen[code] = true;
      codes.push(code);
    }

    if (!condition) return codes;

    add(condition.field);
    if (getNormalizedValueMode(condition) === 'field') add(condition.valueField);
    if (getNormalizedValueMode(condition) === 'expression') {
      getExpressionFieldCodes(condition.valueExpression).forEach(add);
    }

    return codes;
  }

  function matchesCondition(condition, record) {
    if (!condition || !condition.field) return false;
    var rawValue = getRecordFieldValue(record, condition.field);
    var op = condition.op || '=';
    var type = condition.type || 'text';

    if (op === 'isEmpty') return isEmptyValue(rawValue);
    if (op === 'isNotEmpty') return !isEmptyValue(rawValue);

    if (type === 'number') {
      var numberValue = parseNumber(rawValue);
      if (isNaN(numberValue)) return false;
      if (usesRangeValue(op)) {
        var pair = Array.isArray(condition.value) ? condition.value : ['', ''];
        var from = parseNumber(pair[0]);
        var to = parseNumber(pair[1]);
        if (isNaN(from) || isNaN(to)) return false;
        var inRange = numberValue >= Math.min(from, to) && numberValue <= Math.max(from, to);
        return op === 'between' ? inRange : !inRange;
      }
      var compareNumber = resolveNumberComparisonValue(condition, record);
      if (isNaN(compareNumber)) return false;
      if (op === '=') return numberValue === compareNumber;
      if (op === '!=') return numberValue !== compareNumber;
      if (op === '>') return numberValue > compareNumber;
      if (op === '>=') return numberValue >= compareNumber;
      if (op === '<') return numberValue < compareNumber;
      if (op === '<=') return numberValue <= compareNumber;
      return false;
    }

    if (type === 'choice') {
      var currentChoice = normalizeText(rawValue);
      var compareChoice = resolveTextComparisonValue(condition, record);
      if (compareChoice == null) return false;
      if (op === '=') return currentChoice === compareChoice;
      if (op === '!=') return currentChoice !== compareChoice;
      var list = Array.isArray(condition.value) ? condition.value : [condition.value];
      var normalizedList = list.map(normalizeText);
      if (op === 'in') return normalizedList.indexOf(currentChoice) >= 0;
      if (op === 'notIn') return normalizedList.indexOf(currentChoice) < 0;
      return false;
    }

    if (type === 'date' || type === 'datetime') {
      var dateValue = parseDayValue(rawValue);
      if (!dateValue) return false;
      var currentDay = today();

      if (op === 'today') return dayDiff(dateValue, currentDay) === 0;
      if (op === 'yesterday') return dayDiff(dateValue, currentDay) === -1;
      if (op === 'tomorrow') return dayDiff(dateValue, currentDay) === 1;
      if (op === 'withinDays') return Math.abs(dayDiff(dateValue, currentDay)) <= (parseNumber(condition.value) || 0);
      if (op === 'olderThanDays') return dayDiff(currentDay, dateValue) > (parseNumber(condition.value) || 0);

      var compareDate = resolveDateComparisonValue(condition, record);
      if (!compareDate) return false;
      if (op === '=') return dayDiff(dateValue, compareDate) === 0;
      if (op === '!=') return dayDiff(dateValue, compareDate) !== 0;
      if (op === 'before') return dayDiff(dateValue, compareDate) < 0;
      if (op === 'after') return dayDiff(dateValue, compareDate) > 0;
      return false;
    }

    var textValue = normalizeText(rawValue);
    var compareText = resolveTextComparisonValue(condition, record);
    if (compareText == null) return false;
    if (op === '=') return textValue === compareText;
    if (op === '!=') return textValue !== compareText;
    if (op === 'contains') return textValue.indexOf(compareText) >= 0;
    if (op === 'notContains') return textValue.indexOf(compareText) < 0;
    if (op === 'startsWith') return textValue.indexOf(compareText) === 0;
    if (op === 'endsWith') return compareText !== '' && textValue.slice(-compareText.length) === compareText;
    return false;
  }

  function matchesBranch(branch, record) {
    if (!branch || !Array.isArray(branch.conditions) || !branch.conditions.length) return false;
    if (branch.join === 'OR') {
      return branch.conditions.some(function(condition) {
        return matchesCondition(condition, record);
      });
    }
    return branch.conditions.every(function(condition) {
      return matchesCondition(condition, record);
    });
  }

  function evaluateRuleSet(record, ruleSet) {
    if (!ruleSet) return '';
    for (var i = 0; i < ruleSet.rules.length; i++) {
      if (matchesBranch(ruleSet.rules[i], record)) {
        return ruleSet.rules[i].output == null ? '' : String(ruleSet.rules[i].output);
      }
    }
    return ruleSet.elseOutput || '';
  }

  function buildRuleSetMap(config) {
    var map = Object.create(null);
    config.ruleSets.forEach(function(ruleSet) {
      if (ruleSet && ruleSet.id) map[ruleSet.id] = ruleSet;
    });
    return map;
  }

  function applyOutputs(record, config) {
    if (!record) return;
    var ruleSetMap = buildRuleSetMap(config);
    config.targets.forEach(function(targetConfig) {
      if (!targetConfig || !targetConfig.field) return;
      var targetField = record[targetConfig.field];
      if (!targetField) return;
      var ruleSet = ruleSetMap[targetConfig.ruleSetId];
      targetField.value = ruleSet ? evaluateRuleSet(record, ruleSet) : '';
      targetField.disabled = !!targetConfig.lockOutputField;
    });
  }

  function registerChangeHandlersOnce() {
    if (handlersInitialized) return;
    handlersInitialized = true;

    var config = getConfig();
    var outputFields = new Set(config.targets.map(function(target) { return target.field; }));
    var dependencyCodes = new Set();

    config.ruleSets.forEach(function(ruleSet) {
      (ruleSet.rules || []).forEach(function(branch) {
        (branch.conditions || []).forEach(function(condition) {
          getConditionReferencedFieldCodes(condition).forEach(function(code) {
            if (!outputFields.has(code)) dependencyCodes.add(code);
          });
        });
      });
    });

    Array.from(dependencyCodes).forEach(function(code) {
      if (registeredCodes.has(code)) return;
      registeredCodes.add(code);
      ['app.record.create.change.' + code, 'app.record.edit.change.' + code].forEach(function(eventType) {
        kintone.events.on(eventType, function(event) {
          try {
            applyOutputs(event.record, getConfig());
          } catch (_) {
          }
          return event;
        });
      });
    });
  }

  SHOW_EVENTS.forEach(function(eventType) {
    kintone.events.on(eventType, function(event) {
      try {
        loadConfig();
        registerChangeHandlersOnce();
        applyOutputs(event.record, getConfig());
      } catch (_) {
      }
      return event;
    });
  });

  SUBMIT_EVENTS.forEach(function(eventType) {
    kintone.events.on(eventType, function(event) {
      try {
        loadConfig();
        applyOutputs(event.record, getConfig());
      } catch (_) {
      }
      return event;
    });
  });
})(kintone.$PLUGIN_ID);
