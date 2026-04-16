(function(PLUGIN_ID) {
  'use strict';

  var SUPPORTED_FIELD_TYPES = {
    NUMBER: 'number',
    CALC: 'number',
    SINGLE_LINE_TEXT: 'text',
    RADIO_BUTTON: 'choice',
    DROP_DOWN: 'choice',
    DATE: 'date',
    DATETIME: 'datetime'
  };

  var OPERATOR_MAP = {
    number: ['=', '!=', '>', '>=', '<', '<=', 'between', 'notBetween', 'isEmpty', 'isNotEmpty'],
    text: ['=', '!=', 'contains', 'notContains', 'startsWith', 'endsWith', 'isEmpty', 'isNotEmpty'],
    choice: ['=', '!=', 'in', 'notIn', 'isEmpty', 'isNotEmpty'],
    date: ['=', '!=', 'before', 'after', 'today', 'yesterday', 'tomorrow', 'withinDays', 'olderThanDays', 'isEmpty', 'isNotEmpty'],
    datetime: ['=', '!=', 'before', 'after', 'today', 'yesterday', 'tomorrow', 'withinDays', 'olderThanDays', 'isEmpty', 'isNotEmpty']
  };

  var OPERATOR_LABELS = {
    '=': '次と同じ',
    '!=': '次と違う',
    '>': '次より大きい',
    '>=': '次以上',
    '<': '次より小さい',
    '<=': '次以下',
    between: 'この範囲',
    notBetween: 'この範囲以外',
    contains: '次を含む',
    notContains: '次を含まない',
    startsWith: '次で始まる',
    endsWith: '次で終わる',
    in: '次のどれか',
    notIn: '次のどれでもない',
    before: '次より前',
    after: '次より後',
    today: '今日',
    yesterday: '昨日',
    tomorrow: '明日',
    withinDays: '前後の日数内',
    olderThanDays: '指定日数より前',
    isEmpty: '空欄',
    isNotEmpty: '空欄ではない'
  };

  var JOIN_OPTIONS = [
    { value: 'AND', label: 'すべて当てはまる' },
    { value: 'OR', label: 'どれか1つ当てはまる' }
  ];

  var state = {
    form: { outputFields: [], conditionFields: [] },
    config: { ruleSets: [], targets: [] },
    tests: Object.create(null),
    collapsedRules: Object.create(null),
    selectedRuleSetId: '',
    testResult: null
  };

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function clearNode(node) {
    if (node) node.textContent = '';
  }

  function createElement(tag, attrs, children) {
    var node = document.createElement(tag);
    var config = attrs || {};
    Object.keys(config).forEach(function(key) {
      if (key === 'class') node.className = config[key];
      else if (key === 'text') node.textContent = config[key];
      else if (key === 'checked') node.checked = !!config[key];
      else if (key === 'value') node.value = config[key];
      else if (key === 'type') node.type = config[key];
      else node.setAttribute(key, config[key]);
    });
    (children || []).forEach(function(child) {
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function parseJsonSafe(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function newId(prefix) {
    return prefix + '_' + Math.random().toString(36).slice(2, 10);
  }

  function cloneValue(value) {
    return Array.isArray(value) ? value.slice() : value;
  }

  function usesRangeValue(op) {
    return op === 'between' || op === 'notBetween';
  }

  function usesListValue(op) {
    return op === 'in' || op === 'notIn';
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

  function resetConditionValueInputs(condition) {
    condition.valueMode = 'literal';
    condition.valueField = '';
    condition.valueExpression = '';
    if (usesRangeValue(condition.op)) {
      condition.value = ['', ''];
      return;
    }
    if (condition.type === 'choice' && usesListValue(condition.op)) {
      condition.value = [];
      return;
    }
    condition.value = '';
  }

  function normalizeCondition(condition) {
    var normalized = condition && typeof condition === 'object' ? condition : {};
    var next = {
      id: normalized.id || newId('cond'),
      field: normalized.field || '',
      type: normalized.type || 'text',
      op: normalized.op || '=',
      value: cloneValue(normalized.value),
      valueMode: normalized.valueMode || 'literal',
      valueField: normalized.valueField || '',
      valueExpression: normalized.valueExpression == null ? '' : String(normalized.valueExpression)
    };
    next.valueMode = getNormalizedValueMode(next);
    return next;
  }

  function createDefaultCondition(fieldMeta) {
    var meta = fieldMeta || null;
    var type = meta ? meta.conditionType : 'text';
    return normalizeCondition({
      field: meta ? meta.code : '',
      type: type,
      op: (OPERATOR_MAP[type] || ['='])[0],
      value: type === 'choice' ? [] : ''
    });
  }

  function normalizeBranch(branch) {
    var normalized = branch && typeof branch === 'object' ? branch : {};
    var conditions = Array.isArray(normalized.conditions) ? normalized.conditions.map(normalizeCondition) : [];
    return {
      id: normalized.id || newId('rule'),
      name: normalized.name || '',
      join: normalized.join === 'OR' ? 'OR' : 'AND',
      output: normalized.output == null ? '' : String(normalized.output),
      conditions: conditions.length ? conditions : [createDefaultCondition()]
    };
  }

  function normalizeRuleSet(ruleSet) {
    var normalized = ruleSet && typeof ruleSet === 'object' ? ruleSet : {};
    var rules = Array.isArray(normalized.rules) ? normalized.rules.map(normalizeBranch) : [];
    return {
      id: normalized.id || newId('ruleset'),
      name: normalized.name || '',
      elseOutput: normalized.elseOutput == null ? '' : String(normalized.elseOutput),
      collapsed: !!normalized.collapsed,
      rules: rules.length ? rules : [normalizeBranch({})]
    };
  }

  function normalizeTarget(target) {
    var normalized = target && typeof target === 'object' ? target : {};
    return {
      id: normalized.id || newId('target'),
      field: normalized.field || '',
      ruleSetId: normalized.ruleSetId || '',
      lockOutputField: normalized.lockOutputField !== false
    };
  }

  function buildLegacyConfig(raw) {
    var legacyRuleSetId = 'legacy_rule_set';
    var legacyRules = parseJsonSafe(raw.rules, []);
    return {
      ruleSets: [normalizeRuleSet({
        id: legacyRuleSetId,
        name: '以前の設定',
        elseOutput: raw.elseOutput == null ? '' : String(raw.elseOutput),
        collapsed: false,
        rules: Array.isArray(legacyRules) ? legacyRules : []
      })],
      targets: raw.outputField ? [normalizeTarget({
        id: 'legacy_target',
        field: raw.outputField,
        ruleSetId: legacyRuleSetId,
        lockOutputField: raw.lockOutputField !== 'false'
      })] : []
    };
  }

  function deserializeConfig() {
    var raw = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
    var ruleSets = parseJsonSafe(raw.ruleSets, null);
    var targets = parseJsonSafe(raw.targets, null);
    if (!Array.isArray(ruleSets) || !Array.isArray(targets)) return buildLegacyConfig(raw);
    return {
      ruleSets: ruleSets.map(normalizeRuleSet),
      targets: targets.map(normalizeTarget)
    };
  }

  function serializeConfig(config) {
    return {
      ruleSets: JSON.stringify(config.ruleSets.map(function(ruleSet) {
        return {
          id: ruleSet.id,
          name: ruleSet.name,
          elseOutput: ruleSet.elseOutput,
          collapsed: !!ruleSet.collapsed,
          rules: ruleSet.rules.map(function(branch) {
            return {
              id: branch.id,
              name: branch.name,
              join: branch.join,
              output: branch.output,
              conditions: branch.conditions.map(function(condition) {
                return {
                  id: condition.id,
                  field: condition.field,
                  type: condition.type,
                  op: condition.op,
                  value: cloneValue(condition.value),
                  valueMode: getNormalizedValueMode(condition),
                  valueField: condition.valueField || '',
                  valueExpression: condition.valueExpression == null ? '' : String(condition.valueExpression)
                };
              })
            };
          })
        };
      })),
      targets: JSON.stringify(config.targets.map(function(target) {
        return {
          id: target.id,
          field: target.field,
          ruleSetId: target.ruleSetId,
          lockOutputField: !!target.lockOutputField
        };
      })),
      outputField: '',
      elseOutput: '',
      lockOutputField: 'true',
      rules: '[]'
    };
  }

  function getAppIdFromUrl(urlLike) {
    if (!urlLike) return '';
    try {
      var url = new URL(urlLike, location.origin);
      var app = url.searchParams.get('app');
      if (app) return app;
      var parts = url.pathname.split('/').filter(Boolean);
      for (var i = 0; i < parts.length - 1; i++) {
        if (parts[i] === 'app' && /^\d+$/.test(parts[i + 1])) return parts[i + 1];
      }
    } catch (_) {
    }
    return '';
  }

  function getAppId() {
    return getAppIdFromUrl(location.href) || getAppIdFromUrl(document.referrer);
  }

  function getPluginListUrl() {
    try {
      var url = new URL(location.href);
      var index = url.pathname.indexOf('/plugin');
      if (index >= 0) return url.origin + url.pathname.slice(0, index + '/plugin'.length) + '/#/';
    } catch (_) {
    }
    return document.referrer || '';
  }

  function navigateToPluginList() {
    var url = getPluginListUrl();
    if (url) {
      location.href = url;
      return;
    }
    if (history.length > 1) history.back();
  }

  async function fetchForm() {
    var appId = getAppId();
    if (!appId) return null;
    var endpoints = ['/k/v1/preview/app/form/fields.json', '/k/v1/app/form/fields.json'];
    for (var i = 0; i < endpoints.length; i++) {
      try {
        var response = await kintone.api(kintone.api.url(endpoints[i], true), 'GET', { app: appId });
        if (response) return response;
      } catch (_) {
      }
    }
    return null;
  }

  function normalizeForm(response) {
    var outputFields = [];
    var conditionFields = [];
    var properties = (response && response.properties) || {};

    Object.keys(properties).forEach(function(code) {
      var field = properties[code];
      if (!field || field.type === 'SUBTABLE') return;

      if (field.type === 'SINGLE_LINE_TEXT') {
        outputFields.push({
          code: field.code,
          label: field.label || field.code,
          type: field.type,
          conditionType: 'text',
          options: []
        });
      }

      if (!SUPPORTED_FIELD_TYPES[field.type]) return;

      var options = [];
      if (field.options) {
        Object.keys(field.options).forEach(function(key) {
          var option = field.options[key];
          options.push(option && option.label ? option.label : key);
        });
      }

      conditionFields.push({
        code: field.code,
        label: field.label || field.code,
        type: field.type,
        conditionType: SUPPORTED_FIELD_TYPES[field.type],
        options: options
      });
    });

    return {
      outputFields: outputFields,
      conditionFields: conditionFields
    };
  }

  function fieldByCode(fields, code) {
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].code === code) return fields[i];
    }
    return null;
  }

  function getConditionFieldMeta(code) {
    return fieldByCode(state.form.conditionFields, code);
  }

  function getFieldLabel(code) {
    var field = fieldByCode(state.form.conditionFields, code) || fieldByCode(state.form.outputFields, code);
    return field ? field.label : code;
  }

  function isComparableFieldType(leftType, rightType) {
    if (leftType === 'date' || leftType === 'datetime') {
      return rightType === 'date' || rightType === 'datetime';
    }
    return leftType === rightType;
  }

  function getComparableFieldOptions(condition) {
    var expectedType = condition && condition.type ? condition.type : 'text';
    return state.form.conditionFields.filter(function(field) {
      return isComparableFieldType(expectedType, field.conditionType);
    }).map(function(field) {
      return {
        value: field.code,
        label: field.label || field.code
      };
    });
  }

  function getRuleSetById(ruleSetId) {
    for (var i = 0; i < state.config.ruleSets.length; i++) {
      if (state.config.ruleSets[i].id === ruleSetId) return state.config.ruleSets[i];
    }
    return null;
  }

  function getOutputFieldOptions() {
    return state.form.outputFields.map(function(field) {
      return { value: field.code, label: field.label || field.code };
    });
  }

  function getRuleSetDisplayName(ruleSet, index) {
    return ruleSet.name || ('判定ルールセット ' + (index + 1));
  }

  function getRuleSetOptions() {
    return state.config.ruleSets.map(function(ruleSet, index) {
      return {
        value: ruleSet.id,
        label: getRuleSetDisplayName(ruleSet, index)
      };
    });
  }

  function renderSelectOptions(select, options, selected, placeholder) {
    clearNode(select);
    if (placeholder) select.appendChild(createElement('option', { value: '', text: placeholder }));
    options.forEach(function(option) {
      var node = createElement('option', { value: option.value, text: option.label });
      if (String(option.value) === String(selected)) node.selected = true;
      select.appendChild(node);
    });
  }

  function pickFirstRuleSetId() {
    if (state.config.targets.length && state.config.targets[0].ruleSetId) return state.config.targets[0].ruleSetId;
    if (state.config.ruleSets.length) return state.config.ruleSets[0].id;
    return '';
  }

  function syncSelectedRuleSet() {
    if (state.selectedRuleSetId === '__none__') return;
    if (state.selectedRuleSetId && getRuleSetById(state.selectedRuleSetId)) return;
    state.selectedRuleSetId = pickFirstRuleSetId();
  }

  function selectRuleSet(ruleSetId) {
    state.selectedRuleSetId = ruleSetId;
    syncSelectedRuleSet();
    state.testResult = null;
  }

  function addRuleSet() {
    var ruleSet = normalizeRuleSet({
      id: newId('ruleset'),
      name: '',
      elseOutput: '',
      collapsed: false,
      rules: [normalizeBranch({})]
    });
    state.config.ruleSets.push(ruleSet);
    selectRuleSet(ruleSet.id);
    return ruleSet;
  }

  function addTarget(ruleSetId) {
    var fallback = ruleSetId || pickFirstRuleSetId();
    if (!fallback) fallback = addRuleSet().id;
    state.config.targets.push(normalizeTarget({
      id: newId('target'),
      field: '',
      ruleSetId: fallback,
      lockOutputField: true
    }));
    selectRuleSet(fallback);
  }

  function addBranch(ruleSet) {
    ruleSet.rules.push(normalizeBranch({}));
  }

  function addCondition(branch) {
    branch.conditions.push(createDefaultCondition());
  }

  function deleteRuleSet(ruleSetId) {
    var isUsed = state.config.targets.some(function(target) {
      return target.ruleSetId === ruleSetId;
    });
    if (isUsed) {
      alert('この判定ルールは項目で使われています。先に左側の設定を変更してください。');
      return;
    }
    state.config.ruleSets = state.config.ruleSets.filter(function(ruleSet) {
      return ruleSet.id !== ruleSetId;
    });
    delete state.tests[ruleSetId];
    state.testResult = null;
    syncSelectedRuleSet();
  }

  function isRuleCollapsed(ruleSetId, branchId) {
    return !!(state.collapsedRules[ruleSetId] && state.collapsedRules[ruleSetId][branchId]);
  }

  function setRuleCollapsed(ruleSetId, branchId, collapsed) {
    if (!state.collapsedRules[ruleSetId]) state.collapsedRules[ruleSetId] = Object.create(null);
    state.collapsedRules[ruleSetId][branchId] = !!collapsed;
  }

  function toggleRuleCollapsed(ruleIndex) {
    var ruleSet = getRuleSetById(state.selectedRuleSetId);
    if (!ruleSet || !ruleSet.rules[ruleIndex]) return;
    var branch = ruleSet.rules[ruleIndex];
    setRuleCollapsed(ruleSet.id, branch.id, !isRuleCollapsed(ruleSet.id, branch.id));
    renderRuleEditor();
  }

  function insertConditionAfter(ruleIndex, conditionIndex) {
    var ruleSet = getRuleSetById(state.selectedRuleSetId);
    if (!ruleSet || !ruleSet.rules[ruleIndex]) return;
    var branch = ruleSet.rules[ruleIndex];
    branch.conditions.splice(conditionIndex + 1, 0, createDefaultCondition());
    invalidateTestResult();
    renderRuleEditor();
  }

  function removeCondition(ruleIndex, conditionIndex) {
    var ruleSet = getRuleSetById(state.selectedRuleSetId);
    if (!ruleSet || !ruleSet.rules[ruleIndex]) return;
    var branch = ruleSet.rules[ruleIndex];
    branch.conditions.splice(conditionIndex, 1);
    if (!branch.conditions.length) branch.conditions.push(createDefaultCondition());
    invalidateTestResult();
    renderRuleEditor();
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

  function isValidNumericExpression(expression) {
    return !isNaN(runNumericExpression(expression, function() { return 0; }));
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

  function isValueLessOperator(op) {
    return op === 'isEmpty' || op === 'isNotEmpty' || op === 'today' || op === 'yesterday' || op === 'tomorrow';
  }

  function setConditionField(condition, code) {
    var meta = getConditionFieldMeta(code);
    condition.field = code;
    condition.type = meta ? meta.conditionType : 'text';
    condition.op = (OPERATOR_MAP[condition.type] || ['='])[0];
    resetConditionValueInputs(condition);
  }

  function createRecordFromValues(values) {
    var record = {};
    Object.keys(values).forEach(function(code) {
      record[code] = { value: cloneValue(values[code]) };
    });
    return record;
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
      if (op === 'between' || op === 'notBetween') {
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

  function evaluateBranch(branch, record) {
    var matchedConditions = [];
    if (!branch || !Array.isArray(branch.conditions) || !branch.conditions.length) {
      return { matched: false, matchedConditions: matchedConditions };
    }

    if (branch.join === 'OR') {
      branch.conditions.forEach(function(condition) {
        if (matchesCondition(condition, record)) matchedConditions.push(condition);
      });
      return {
        matched: matchedConditions.length > 0,
        matchedConditions: matchedConditions
      };
    }

    for (var i = 0; i < branch.conditions.length; i++) {
      if (!matchesCondition(branch.conditions[i], record)) {
        return { matched: false, matchedConditions: [] };
      }
      matchedConditions.push(branch.conditions[i]);
    }
    return {
      matched: true,
      matchedConditions: matchedConditions
    };
  }

  function displayValue(value) {
    return value == null || value === '' ? '空欄' : String(value);
  }

  function formatExpressionDisplay(expression) {
    if (!expression) return '';
    return String(expression).replace(/\[([^\]]+)\]/g, function(_, code) {
      var trimmed = code.trim();
      return '[' + getFieldLabel(trimmed) + ']';
    });
  }

  function formatConditionValue(condition) {
    var mode = getNormalizedValueMode(condition);
    if (mode === 'field') return displayValue(getFieldLabel(condition.valueField));
    if (mode === 'expression') return displayValue(formatExpressionDisplay(condition.valueExpression));
    if (condition.op === 'between' || condition.op === 'notBetween') {
      var pair = Array.isArray(condition.value) ? condition.value : ['', ''];
      return displayValue(pair[0]) + ' から ' + displayValue(pair[1]);
    }
    if (condition.op === 'in' || condition.op === 'notIn') {
      var list = Array.isArray(condition.value) ? condition.value : [condition.value];
      return list.filter(function(value) { return value !== ''; }).map(displayValue).join(' / ');
    }
    return displayValue(condition.value);
  }

  function buildConditionClause(condition) {
    var label = getFieldLabel(condition.field);
    var value = formatConditionValue(condition);
    if (condition.op === '=') return label + ' が ' + value;
    if (condition.op === '!=') return label + ' が ' + value + ' 以外';
    if (condition.op === '>') return label + ' が ' + value + ' より大きい';
    if (condition.op === '>=') return label + ' が ' + value + ' 以上';
    if (condition.op === '<') return label + ' が ' + value + ' より小さい';
    if (condition.op === '<=') return label + ' が ' + value + ' 以下';
    if (condition.op === 'between') return label + ' が ' + value;
    if (condition.op === 'notBetween') return label + ' が ' + value + ' 以外';
    if (condition.op === 'contains') return label + ' に ' + value + ' を含む';
    if (condition.op === 'notContains') return label + ' に ' + value + ' を含まない';
    if (condition.op === 'startsWith') return label + ' が ' + value + ' で始まる';
    if (condition.op === 'endsWith') return label + ' が ' + value + ' で終わる';
    if (condition.op === 'in') return label + ' が ' + value + ' のどれか';
    if (condition.op === 'notIn') return label + ' が ' + value + ' のどれでもない';
    if (condition.op === 'before') return label + ' が ' + value + ' より前';
    if (condition.op === 'after') return label + ' が ' + value + ' より後';
    if (condition.op === 'today') return label + ' が 今日';
    if (condition.op === 'yesterday') return label + ' が 昨日';
    if (condition.op === 'tomorrow') return label + ' が 明日';
    if (condition.op === 'withinDays') return label + ' が 今日から ' + displayValue(condition.value) + ' 日以内';
    if (condition.op === 'olderThanDays') return label + ' が ' + displayValue(condition.value) + ' 日より前';
    if (condition.op === 'isEmpty') return label + ' が 空欄';
    if (condition.op === 'isNotEmpty') return label + ' が 空欄ではない';
    return label;
  }

  function buildRuleSummary(branch) {
    var parts = (branch.conditions || []).map(buildConditionClause).filter(Boolean);
    if (!parts.length) return '条件がまだありません。';
    var joinText = branch.join === 'OR' ? ' または ' : ' と ';
    return parts.join(joinText) + ' のとき → ' + displayValue(branch.output);
  }

  function buildReadablePreview(ruleSet) {
    var lines = (ruleSet.rules || []).map(function(branch) {
      var parts = (branch.conditions || []).map(buildConditionClause).filter(Boolean);
      if (!parts.length) return 'まだ条件がありません。';
      var joinText = branch.join === 'OR' ? ' または ' : ' かつ ';
      return 'もし ' + parts.join(joinText) + ' なら、「' + displayValue(branch.output) + '」を入れる';
    });
    lines.push('どの条件にも合わなければ、「' + displayValue(ruleSet.elseOutput) + '」を入れる');
    return lines;
  }

  function buildReason(branch, matchedConditions) {
    var parts = matchedConditions.map(buildConditionClause).filter(Boolean);
    if (!parts.length) return '条件に合ったため';
    var joinText = branch.join === 'OR' ? '、または ' : '、かつ ';
    return parts.join(joinText) + ' だったため';
  }

  function evaluateRules(ruleSet, testValues) {
    var record = createRecordFromValues(testValues);
    for (var i = 0; i < ruleSet.rules.length; i++) {
      var branch = ruleSet.rules[i];
      var branchResult = evaluateBranch(branch, record);
      if (branchResult.matched) {
        return {
          matched: true,
          matchedRuleIndex: i,
          matchedRuleLabel: '判定ルール ' + (i + 1),
          output: branch.output == null ? '' : String(branch.output),
          reason: buildReason(branch, branchResult.matchedConditions)
        };
      }
    }
    return {
      matched: false,
      matchedRuleIndex: -1,
      matchedRuleLabel: 'なし',
      output: ruleSet.elseOutput || '',
      reason: 'どの条件にも合わなかったため、既定値を使用'
    };
  }

  function collectReferencedFieldCodes(ruleSet) {
    var seen = Object.create(null);
    var codes = [];
    (ruleSet.rules || []).forEach(function(branch) {
      (branch.conditions || []).forEach(function(condition) {
        getConditionReferencedFieldCodes(condition).forEach(function(code) {
          if (seen[code]) return;
          seen[code] = true;
          codes.push(code);
        });
      });
    });
    return codes;
  }

  function collectConfigFromView() {
    return state.config;
  }

  function collectTestValuesFromView(ruleSetId) {
    return state.tests[ruleSetId] || {};
  }

  function runRuleTest(ruleSet) {
    return evaluateRules(ruleSet, collectTestValuesFromView(ruleSet.id));
  }

  function validateConfig() {
    if (!state.config.targets.length) return '文字を入れる項目を1つ以上追加してください。';
    if (!state.config.ruleSets.length) return '判定ルールを1つ以上追加してください。';

    var seenOutputs = Object.create(null);
    var targetFieldCodes = state.config.targets.map(function(target) { return target.field; }).filter(Boolean);
    var validRuleSetIds = state.config.ruleSets.map(function(ruleSet) { return ruleSet.id; });

    for (var i = 0; i < state.config.targets.length; i++) {
      var target = state.config.targets[i];
      if (!target.field) return '文字を入れる項目を選んでください。';
      if (seenOutputs[target.field]) return '同じ項目は1回だけ設定してください。';
      seenOutputs[target.field] = true;
      if (validRuleSetIds.indexOf(target.ruleSetId) < 0) return '使用する判定ルールを選び直してください。';
    }

    for (var r = 0; r < state.config.ruleSets.length; r++) {
      var ruleSet = state.config.ruleSets[r];
      if (!ruleSet.rules.length) return '判定ルールを1つ以上追加してください。';
      for (var b = 0; b < ruleSet.rules.length; b++) {
        var branch = ruleSet.rules[b];
        if (!branch.conditions.length) return '条件を1つ以上追加してください。';
        for (var c = 0; c < branch.conditions.length; c++) {
          var condition = branch.conditions[c];
          if (!condition.field) return '見る項目を選んでください。';
          var referencedCodes = getConditionReferencedFieldCodes(condition);
          if (referencedCodes.some(function(code) { return targetFieldCodes.indexOf(code) >= 0; })) {
            return '文字を入れる項目そのものは条件や比較式に使えません。';
          }
          if (isValueLessOperator(condition.op)) continue;
          if (usesRangeValue(condition.op)) {
            if (!Array.isArray(condition.value) || condition.value.length < 2 || condition.value[0] === '' || condition.value[1] === '') {
              return '比較する値を2つ入れてください。';
            }
            continue;
          }
          if (usesListValue(condition.op) && (!Array.isArray(condition.value) || !condition.value.length)) {
            return '比較する値を1つ以上選んでください。';
          }
          var valueMode = getNormalizedValueMode(condition);
          if (valueMode === 'field') {
            if (!condition.valueField) return '比較先の項目を選んでください。';
            if (!getComparableFieldOptions(condition).some(function(option) { return option.value === condition.valueField; })) {
              return '比較先の項目の型が合っていません。';
            }
            continue;
          }
          if (valueMode === 'expression') {
            if (condition.valueExpression == null || normalizeText(condition.valueExpression) === '') return '数式を入れてください。';
            if (!isValidNumericExpression(condition.valueExpression)) return '数式の書き方が正しくありません。';
            var expressionCodes = getExpressionFieldCodes(condition.valueExpression);
            for (var e = 0; e < expressionCodes.length; e++) {
              var expressionMeta = getConditionFieldMeta(expressionCodes[e]);
              if (!expressionMeta || expressionMeta.conditionType !== 'number') {
                return '数式では数値項目だけを参照できます。';
              }
            }
            continue;
          }
          if (condition.value == null || condition.value === '') return '比較する値を入れてください。';
        }
      }
    }
    return '';
  }

  function updateTestValue(ruleSetId, fieldCode, value) {
    if (!state.tests[ruleSetId]) state.tests[ruleSetId] = {};
    state.tests[ruleSetId][fieldCode] = cloneValue(value);
  }

  function getTestValue(ruleSetId, fieldCode, defaultValue) {
    if (!state.tests[ruleSetId]) state.tests[ruleSetId] = {};
    if (!Object.prototype.hasOwnProperty.call(state.tests[ruleSetId], fieldCode)) {
      state.tests[ruleSetId][fieldCode] = defaultValue == null ? '' : defaultValue;
    }
    return state.tests[ruleSetId][fieldCode];
  }

  function invalidateTestResult() {
    state.testResult = null;
    var resultBox = byId('ktrb-test-result-box');
    if (resultBox) renderTestResult(resultBox, null);
  }

  function createValueInput(condition, onChange) {
    var type = condition.type || 'text';
    var op = condition.op || '=';
    var fieldMeta = getConditionFieldMeta(condition.field);
    var valueMode = getNormalizedValueMode(condition);

    if (isValueLessOperator(op)) {
      return createElement('div', { class: 'ktrb-help', text: 'この比較方法では値は不要です。' });
    }

    if (type === 'number' && usesRangeValue(op)) {
      var pair = Array.isArray(condition.value) ? condition.value : ['', ''];
      var wrap = createElement('div', { class: 'ktrb-inline' });
      ['ここから', 'ここまで'].forEach(function(label, index) {
        var input = createElement('input', {
          class: 'ktrb-input',
          type: 'number',
          value: pair[index] == null ? '' : pair[index],
          placeholder: label
        });
        input.addEventListener('input', function() {
          var next = Array.isArray(condition.value) ? condition.value.slice() : ['', ''];
          next[index] = input.value;
          onChange(next);
        });
        wrap.appendChild(input);
      });
      return wrap;
    }

    if (valueMode === 'field') {
      var valueFieldSelect = createElement('select', { class: 'ktrb-select' });
      renderSelectOptions(valueFieldSelect, getComparableFieldOptions(condition), condition.valueField, '比較先の項目を選んでください');
      valueFieldSelect.addEventListener('change', function() {
        onChange({
          valueMode: 'field',
          valueField: valueFieldSelect.value,
          value: '',
          valueExpression: ''
        });
      });
      return valueFieldSelect;
    }

    if (valueMode === 'expression') {
      var expressionWrap = createElement('div', { class: 'ktrb-stack' });
      var expressionInput = createElement('input', {
        class: 'ktrb-input',
        type: 'text',
        value: condition.valueExpression == null ? '' : condition.valueExpression,
        placeholder: '例: [unit_price] * [quantity]'
      });
      expressionInput.addEventListener('input', function() {
        onChange({
          valueMode: 'expression',
          valueExpression: expressionInput.value,
          valueField: '',
          value: ''
        });
      });
      expressionWrap.appendChild(expressionInput);
      expressionWrap.appendChild(createElement('div', {
        class: 'ktrb-help',
        text: '数式では [項目コード] を使えます。利用できるのは数値項目のみです。'
      }));
      return expressionWrap;
    }

    if (type === 'choice') {
      if (usesListValue(op)) {
        var choiceWrap = createElement('div', { class: 'ktrb-choice-group' });
        var selected = Array.isArray(condition.value) ? condition.value : [];
        (fieldMeta && fieldMeta.options || []).forEach(function(option) {
          var id = newId('choice');
          var input = createElement('input', { type: 'checkbox', id: id, value: option });
          input.checked = selected.indexOf(option) >= 0;
          input.addEventListener('change', function() {
            var next = Array.isArray(condition.value) ? condition.value.slice() : [];
            if (input.checked && next.indexOf(option) < 0) next.push(option);
            if (!input.checked) next = next.filter(function(value) { return value !== option; });
            onChange(next);
          });
          choiceWrap.appendChild(createElement('label', { class: 'ktrb-choice-item', for: id }, [
            input,
            createElement('span', { text: option })
          ]));
        });
        if (!choiceWrap.childNodes.length) {
          choiceWrap.appendChild(createElement('div', { class: 'ktrb-help', text: '選べる内容を読み込めませんでした。' }));
        }
        return choiceWrap;
      }
      var select = createElement('select', { class: 'ktrb-select' });
      renderSelectOptions(select, (fieldMeta && fieldMeta.options || []).map(function(option) {
        return { value: option, label: option };
      }), condition.value, '選んでください');
      select.addEventListener('change', function() {
        onChange(select.value);
      });
      return select;
    }

    var inputType = (type === 'date' || type === 'datetime')
      ? ((op === 'withinDays' || op === 'olderThanDays') ? 'number' : 'date')
      : (type === 'number' ? 'number' : 'text');
    var input = createElement('input', {
      class: 'ktrb-input',
      type: inputType,
      value: condition.value == null ? '' : condition.value
    });
    input.addEventListener('input', function() {
      onChange(input.value);
    });
    return input;
  }

  function renderRuleEditorPreview(ruleSet) {
    var container = byId('ktrb-readable-preview');
    if (!container) return;
    clearNode(container);
    buildReadablePreview(ruleSet).forEach(function(line, index, list) {
      container.appendChild(createElement('div', {
        class: 'ktrb-preview-line' + (index === list.length - 1 ? ' muted' : ''),
        text: line
      }));
    });
  }

  function renderConditionRow(ruleSet, branch, ruleIndex, conditionIndex, condition, onUpdatePreview) {
    var row = createElement('div', { class: 'ktrb-condition-row' });

    var fieldSelect = createElement('select', { class: 'ktrb-select' });
    renderSelectOptions(fieldSelect, state.form.conditionFields.map(function(field) {
      return { value: field.code, label: field.label || field.code };
    }), condition.field, '項目を選んでください');
    fieldSelect.addEventListener('change', function() {
      setConditionField(condition, fieldSelect.value);
      invalidateTestResult();
      renderRuleEditor();
    });

    var operatorSelect = createElement('select', { class: 'ktrb-select' });
    renderSelectOptions(operatorSelect, (OPERATOR_MAP[condition.type] || ['=']).map(function(op) {
      return { value: op, label: OPERATOR_LABELS[op] || op };
    }), condition.op, '');
    operatorSelect.addEventListener('change', function() {
      condition.op = operatorSelect.value;
      resetConditionValueInputs(condition);
      invalidateTestResult();
      renderRuleEditor();
    });

    var valueModeInput = createElement('div', { class: 'ktrb-help', text: '固定値' });
    var valueModes = getAvailableValueModes(condition);
    if (valueModes.length > 1) {
      var valueModeSelect = createElement('select', { class: 'ktrb-select' });
      renderSelectOptions(valueModeSelect, valueModes.map(function(mode) {
        return {
          value: mode,
          label: mode === 'field' ? '他の項目' : (mode === 'expression' ? '数式' : '固定値')
        };
      }), getNormalizedValueMode(condition), '');
      valueModeSelect.addEventListener('change', function() {
        condition.valueMode = valueModeSelect.value;
        condition.valueField = '';
        condition.valueExpression = '';
        condition.value = '';
        invalidateTestResult();
        renderRuleEditor();
      });
      valueModeInput = valueModeSelect;
    } else if (isValueLessOperator(condition.op)) {
      valueModeInput = createElement('div', { class: 'ktrb-help', text: '不要' });
    }

    var valueInput = createValueInput(condition, function(value) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        condition.valueMode = value.valueMode || condition.valueMode;
        condition.valueField = value.valueField || '';
        condition.valueExpression = value.valueExpression || '';
        condition.value = Object.prototype.hasOwnProperty.call(value, 'value') ? value.value : '';
      } else {
        condition.value = value;
        if (getNormalizedValueMode(condition) === 'literal') {
          condition.valueField = '';
          condition.valueExpression = '';
        }
      }
      invalidateTestResult();
      if (onUpdatePreview) onUpdatePreview();
    });

    var actionCell = createElement('div', { class: 'ktrb-row-actions' });
    var addButton = createElement('button', { type: 'button', class: 'ktrb-btn small', text: '+' });
    addButton.addEventListener('click', function() {
      insertConditionAfter(ruleIndex, conditionIndex);
    });
    var deleteButton = createElement('button', { type: 'button', class: 'ktrb-btn danger small', text: '削除' });
    deleteButton.addEventListener('click', function() {
      removeCondition(ruleIndex, conditionIndex);
    });
    actionCell.appendChild(addButton);
    actionCell.appendChild(deleteButton);

    row.appendChild(fieldSelect);
    row.appendChild(operatorSelect);
    row.appendChild(valueModeInput);
    row.appendChild(valueInput);
    row.appendChild(actionCell);
    return row;
  }

  function createJoinToggle(branch) {
    var wrap = createElement('div', { class: 'ktrb-toggle' });
    JOIN_OPTIONS.forEach(function(option) {
      var button = createElement('button', {
        type: 'button',
        class: 'ktrb-toggle-btn' + (branch.join === option.value ? ' is-active' : ''),
        text: option.label
      });
      button.addEventListener('click', function() {
        branch.join = option.value;
        state.testResult = null;
        renderRuleEditor();
      });
      wrap.appendChild(button);
    });
    return wrap;
  }

  function renderConditionTable(ruleSet, branch, ruleIndex, onUpdatePreview) {
    var conditionTable = createElement('div', { class: 'ktrb-condition-table' });
    var conditionHead = createElement('div', { class: 'ktrb-condition-head' }, [
      createElement('span', { text: '見る項目' }),
      createElement('span', { text: '比較方法' }),
      createElement('span', { text: '比較する値' }),
      createElement('span', { text: '操作' })
    ]);

    conditionHead = createElement('div', { class: 'ktrb-condition-head' }, [
      createElement('span', { text: '見る項目' }),
      createElement('span', { text: '比較のしかた' }),
      createElement('span', { text: '比較先' }),
      createElement('span', { text: '比較する値' }),
      createElement('span', { text: '操作' })
    ]);

    var conditionList = createElement('div', { class: 'ktrb-condition-list' });
    branch.conditions.forEach(function(condition, conditionIndex) {
      conditionList.appendChild(renderConditionRow(ruleSet, branch, ruleIndex, conditionIndex, condition, onUpdatePreview));
    });

    conditionTable.appendChild(conditionHead);
    conditionTable.appendChild(conditionList);
    return conditionTable;
  }

  function renderRuleBlock(ruleSet, branch, index) {
    var block = createElement('section', { class: 'ktrb-rule-block' });
    var collapsed = isRuleCollapsed(ruleSet.id, branch.id);

    var head = createElement('div', { class: 'ktrb-rule-head' });
    var headMeta = createElement('div', { class: 'ktrb-rule-head-main' });
    headMeta.appendChild(createElement('strong', { text: '判定ルール ' + (index + 1) }));
    var summary = createElement('div', { class: 'ktrb-rule-summary-text', text: buildRuleSummary(branch) });
    headMeta.appendChild(summary);
    head.appendChild(headMeta);

    var headButtons = createElement('div', { class: 'ktrb-btns' });
    var toggleButton = createElement('button', { type: 'button', class: 'ktrb-btn small', text: collapsed ? '開く' : '閉じる' });
    toggleButton.addEventListener('click', function() {
      toggleRuleCollapsed(index);
    });
    var deleteButton = createElement('button', { type: 'button', class: 'ktrb-btn danger small', text: '削除' });
    deleteButton.addEventListener('click', function() {
      ruleSet.rules = ruleSet.rules.filter(function(item) {
        return item.id !== branch.id;
      });
      if (!ruleSet.rules.length) addBranch(ruleSet);
      state.testResult = null;
      renderRuleEditor();
    });
    headButtons.appendChild(toggleButton);
    headButtons.appendChild(deleteButton);
    head.appendChild(headButtons);

    var refreshSummary = function() {
      summary.textContent = buildRuleSummary(branch);
      renderRuleEditorPreview(ruleSet);
    };

    var body = createElement('div', { class: 'ktrb-rule-body' + (collapsed ? ' is-hidden' : '') });
    var summaryForm = createElement('div', { class: 'ktrb-rule-summary' });
    var joinField = createElement('div', { class: 'ktrb-field' }, [
      createElement('div', { class: 'ktrb-label', text: '条件のまとまり方' }),
      createJoinToggle(branch)
    ]);
    var outputField = createElement('div', { class: 'ktrb-field' }, [
      createElement('div', { class: 'ktrb-label', text: 'この条件に合ったら' }),
      createElement('input', { class: 'ktrb-input', type: 'text', value: branch.output, placeholder: '入れる文字' })
    ]);
    $('input', outputField).addEventListener('input', function(event) {
      branch.output = event.target.value;
      invalidateTestResult();
      refreshSummary();
    });
    summaryForm.appendChild(joinField);
    summaryForm.appendChild(outputField);

    var conditionTable = renderConditionTable(ruleSet, branch, index, refreshSummary);

    block.appendChild(head);
    body.appendChild(summaryForm);
    body.appendChild(conditionTable);
    block.appendChild(body);
    return block;
  }

  function renderTestResult(container, result) {
    clearNode(container);
    if (!result) {
      container.className = 'ktrb-test-result pending';
      container.appendChild(createElement('div', { text: 'まだ判定していません。' }));
      return;
    }

    container.className = 'ktrb-test-result ' + (result.matched ? 'success' : 'fallback');
    container.appendChild(createElement('div', {}, [
      createElement('strong', { text: '結果: ' }),
      createElement('span', { text: displayValue(result.output) })
    ]));
    container.appendChild(createElement('div', {}, [
      createElement('strong', { text: '一致したルール: ' }),
      createElement('span', { text: result.matchedRuleLabel })
    ]));
    container.appendChild(createElement('div', {}, [
      createElement('strong', { text: '理由: ' }),
      createElement('span', { text: result.reason })
    ]));
  }

  function renderFallbackSection(ruleSet) {
    var section = createElement('section', { class: 'ktrb-default-block' });
    section.appendChild(createElement('div', { class: 'ktrb-card-title', text: 'どの条件にも合わなかったとき' }));
    section.appendChild(createElement('div', {
      class: 'ktrb-help',
      text: '上のどの判定にも合わない場合に入れる文字です。'
    }));
    var input = createElement('input', {
      class: 'ktrb-input',
      type: 'text',
      value: ruleSet.elseOutput,
      placeholder: '入れる文字'
    });
    input.addEventListener('input', function(event) {
      ruleSet.elseOutput = event.target.value;
      invalidateTestResult();
      renderRuleEditorPreview(ruleSet);
    });
    section.appendChild(input);
    return section;
  }

  function renderTestPanel(ruleSet) {
    var panel = createElement('section', { class: 'ktrb-test-panel' });
    panel.appendChild(createElement('h3', { class: 'ktrb-card-title', text: '判定テスト' }));
    panel.appendChild(createElement('div', {
      class: 'ktrb-help',
      text: '実際の値を入れて、この設定でどの文字が入るか確認できます。'
    }));

    var codes = collectReferencedFieldCodes(ruleSet);
    if (!codes.length) {
      panel.appendChild(createElement('div', { class: 'ktrb-empty', text: '条件に使う項目を追加すると、ここで試せます。' }));
      return panel;
    }

    var grid = createElement('div', { class: 'ktrb-test-grid' });
    codes.forEach(function(code) {
      var meta = getConditionFieldMeta(code);
      var field = createElement('div', { class: 'ktrb-field' });
      field.appendChild(createElement('div', { class: 'ktrb-label', text: meta ? meta.label : code }));

      if (meta && meta.conditionType === 'choice') {
        var select = createElement('select', { class: 'ktrb-select' });
        renderSelectOptions(select, (meta.options || []).map(function(option) {
          return { value: option, label: option };
        }), getTestValue(ruleSet.id, code, ''), '選んでください');
        select.addEventListener('change', function() {
          updateTestValue(ruleSet.id, code, select.value);
        });
        field.appendChild(select);
      } else {
        var inputType = meta && meta.conditionType === 'number'
          ? 'number'
          : (meta && (meta.conditionType === 'date' || meta.conditionType === 'datetime') ? 'date' : 'text');
        var input = createElement('input', {
          class: 'ktrb-input',
          type: inputType,
          value: getTestValue(ruleSet.id, code, '')
        });
        input.addEventListener('input', function() {
          updateTestValue(ruleSet.id, code, input.value);
        });
        field.appendChild(input);
      }

      grid.appendChild(field);
    });

    var actions = createElement('div', { class: 'ktrb-test-actions' });
    var runButton = createElement('button', { type: 'button', class: 'ktrb-btn primary', text: '判定する' });
    runButton.addEventListener('click', function() {
      state.testResult = runRuleTest(ruleSet);
      renderRuleEditor();
    });
    actions.appendChild(runButton);

    var resultBox = createElement('div', { class: 'ktrb-test-result pending', id: 'ktrb-test-result-box' });
    renderTestResult(resultBox, state.testResult);

    panel.appendChild(grid);
    panel.appendChild(actions);
    panel.appendChild(resultBox);
    return panel;
  }

  function renderTestSection(ruleSet) {
    return renderTestPanel(ruleSet);
  }

  function renderTargetSettings() {
    var mount = byId('target-settings');
    clearNode(mount);

    var section = createElement('section', { class: 'ktrb-pane' });
    section.appendChild(createElement('h2', { class: 'ktrb-card-title', text: '文字を入れる場所' }));
    section.appendChild(createElement('div', { class: 'ktrb-help', text: '左で項目を選び、右で使う判定ルールを編集します。' }));

    var list = createElement('div', { class: 'ktrb-target-list' });
    if (!state.config.targets.length) {
      list.appendChild(createElement('div', { class: 'ktrb-empty', text: 'まだ項目がありません。' }));
    } else {
      state.config.targets.forEach(function(target, index) {
        var item = createElement('div', {
          class: 'ktrb-target-item' + (target.ruleSetId === state.selectedRuleSetId ? ' is-selected' : '')
        });
        item.addEventListener('click', function() {
          selectRuleSet(target.ruleSetId);
          renderAll();
        });

        var head = createElement('div', { class: 'ktrb-target-item-head' }, [
          createElement('strong', { text: '項目 ' + (index + 1) })
        ]);
        var deleteButton = createElement('button', { type: 'button', class: 'ktrb-btn danger small', text: '削除' });
        deleteButton.addEventListener('click', function(event) {
          event.stopPropagation();
          state.config.targets = state.config.targets.filter(function(item) {
            return item.id !== target.id;
          });
          syncSelectedRuleSet();
          state.testResult = null;
          renderAll();
        });
        head.appendChild(deleteButton);

        var fieldSelect = createElement('select', { class: 'ktrb-select' });
        renderSelectOptions(fieldSelect, getOutputFieldOptions(), target.field, '文字を入れる項目を選んでください');
        fieldSelect.addEventListener('click', function(event) { event.stopPropagation(); });
        fieldSelect.addEventListener('change', function(event) {
          event.stopPropagation();
          target.field = fieldSelect.value;
        });

        var ruleSetSelect = createElement('select', { class: 'ktrb-select' });
        var ruleOptions = getRuleSetOptions();
        ruleOptions.push({ value: '__new__', label: '新しい判定ルールを作る' });
        renderSelectOptions(ruleSetSelect, ruleOptions, target.ruleSetId, '使用する判定ルールを選んでください');
        ruleSetSelect.addEventListener('click', function(event) { event.stopPropagation(); });
        ruleSetSelect.addEventListener('change', function(event) {
          event.stopPropagation();
          if (ruleSetSelect.value === '__new__') {
            var created = addRuleSet();
            target.ruleSetId = created.id;
          } else {
            target.ruleSetId = ruleSetSelect.value;
            selectRuleSet(target.ruleSetId);
          }
          renderAll();
        });

        var lockCheck = createElement('label', { class: 'ktrb-check' }, [
          createElement('input', { type: 'checkbox', checked: target.lockOutputField }),
          createElement('span', { text: '入力画面で直接変更できないようにする' })
        ]);
        lockCheck.addEventListener('click', function(event) { event.stopPropagation(); });
        $('input', lockCheck).addEventListener('change', function(event) {
          event.stopPropagation();
          target.lockOutputField = event.target.checked;
        });

        item.appendChild(head);
        item.appendChild(createElement('div', { class: 'ktrb-field' }, [
          createElement('div', { class: 'ktrb-label', text: '文字を入れる項目' }),
          fieldSelect
        ]));
        item.appendChild(createElement('div', { class: 'ktrb-field' }, [
          createElement('div', { class: 'ktrb-label', text: '使用する判定ルール' }),
          ruleSetSelect
        ]));
        item.appendChild(lockCheck);
        list.appendChild(item);
      });
    }

    var addButton = createElement('button', { type: 'button', class: 'ktrb-btn', text: '項目を追加' });
    addButton.addEventListener('click', function() {
      addTarget();
      renderAll();
    });

    section.appendChild(list);
    section.appendChild(addButton);
    mount.appendChild(section);
  }

  function renderRuleEditor() {
    var mount = byId('rule-editor');
    clearNode(mount);
    syncSelectedRuleSet();

    var section = createElement('section', { class: 'ktrb-pane' });
    section.appendChild(createElement('h2', { class: 'ktrb-card-title', text: '判定ルール' }));

    var ruleSet = getRuleSetById(state.selectedRuleSetId);
    if (!ruleSet) {
      section.appendChild(createElement('div', { class: 'ktrb-empty', text: '左側で項目を選ぶと、ここに判定ルールが表示されます。' }));
      mount.appendChild(section);
      return;
    }

    var head = createElement('div', { class: 'ktrb-editor-head' });
    var nameField = createElement('div', { class: 'ktrb-field' }, [
      createElement('div', { class: 'ktrb-label', text: 'ルール名' }),
      createElement('input', { class: 'ktrb-input', type: 'text', value: ruleSet.name, placeholder: '例: 入金確認' })
    ]);
    $('input', nameField).addEventListener('input', function(event) {
      ruleSet.name = event.target.value;
      renderTargetSettings();
      renderRuleEditorPreview(ruleSet);
    });

    var headButtons = createElement('div', { class: 'ktrb-btns' });
    var closeButton = createElement('button', { type: 'button', class: 'ktrb-btn', text: '閉じる' });
    closeButton.addEventListener('click', function() {
      state.selectedRuleSetId = '__none__';
      state.testResult = null;
      renderRuleEditor();
      renderTargetSettings();
    });
    var deleteButton = createElement('button', { type: 'button', class: 'ktrb-btn danger', text: '削除' });
    deleteButton.addEventListener('click', function() {
      deleteRuleSet(ruleSet.id);
      renderAll();
    });
    headButtons.appendChild(closeButton);
    headButtons.appendChild(deleteButton);
    head.appendChild(nameField);
    head.appendChild(headButtons);

    var preview = createElement('div', { class: 'ktrb-preview', id: 'ktrb-readable-preview' });
    buildReadablePreview(ruleSet).forEach(function(line, index, list) {
      preview.appendChild(createElement('div', {
        class: 'ktrb-preview-line' + (index === list.length - 1 ? ' muted' : ''),
        text: line
      }));
    });

    var ruleList = createElement('div', { class: 'ktrb-rule-list' });
    ruleSet.rules.forEach(function(branch, index) {
      ruleList.appendChild(renderRuleBlock(ruleSet, branch, index));
    });

    var addRuleButton = createElement('button', { type: 'button', class: 'ktrb-btn primary', text: '判定ルールを追加' });
    addRuleButton.addEventListener('click', function() {
      addBranch(ruleSet);
      state.testResult = null;
      renderRuleEditor();
    });

    section.appendChild(head);
    section.appendChild(preview);
    section.appendChild(ruleList);
    section.appendChild(addRuleButton);
    section.appendChild(renderFallbackSection(ruleSet));
    section.appendChild(renderTestSection(ruleSet));
    mount.appendChild(section);
  }

  function renderFooterActions() {
    var mount = byId('footer-actions');
    clearNode(mount);

    mount.appendChild(createElement('div', {
      class: 'ktrb-help',
      text: '保存すると、現在の入力画面でこの判定ルールが使われます。'
    }));

    var buttons = createElement('div', { class: 'ktrb-btns' });
    var cancelButton = createElement('button', { type: 'button', class: 'ktrb-btn', text: '戻る' });
    cancelButton.addEventListener('click', function() {
      navigateToPluginList();
    });
    var saveButton = createElement('button', { type: 'button', class: 'ktrb-btn primary', text: '保存する' });
    saveButton.addEventListener('click', function() {
      var error = validateConfig();
      if (error) {
        alert(error);
        return;
      }
      kintone.plugin.app.setConfig(serializeConfig(collectConfigFromView()), function() {
        navigateToPluginList();
      });
    });
    buttons.appendChild(cancelButton);
    buttons.appendChild(saveButton);
    mount.appendChild(buttons);
  }

  function renderAll() {
    renderTargetSettings();
    renderRuleEditor();
    renderFooterActions();
  }

  async function init() {
    var formResponse = await fetchForm();
    state.form = normalizeForm(formResponse);
    state.config = deserializeConfig();

    if (!state.config.ruleSets.length) addRuleSet();
    if (!state.config.targets.length) addTarget(state.config.ruleSets[0].id);

    state.config.targets.forEach(function(target) {
      if (!getRuleSetById(target.ruleSetId) && state.config.ruleSets[0]) {
        target.ruleSetId = state.config.ruleSets[0].id;
      }
    });

    syncSelectedRuleSet();
    renderAll();
  }

  init().catch(function(error) {
    var mount = byId('rule-editor') || document.body;
    clearNode(mount);
    mount.appendChild(createElement('div', {
      class: 'ktrb-empty',
      text: '設定画面の初期化に失敗しました: ' + (error && error.message ? error.message : 'Unknown error')
    }));
  });
})(kintone.$PLUGIN_ID);
