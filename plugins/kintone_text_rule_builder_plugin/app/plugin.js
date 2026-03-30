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

  function normalizeCondition(condition) {
    var normalized = condition && typeof condition === 'object' ? condition : {};
    return {
      id: normalized.id || '',
      field: normalized.field || '',
      type: normalized.type || 'text',
      op: normalized.op || '=',
      value: normalized.value
    };
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

  function matchesCondition(condition, record) {
    if (!condition || !condition.field) return false;
    var field = record[condition.field];
    var rawValue = field ? field.value : '';
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
      var compareNumber = parseNumber(condition.value);
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
      if (op === '=') return currentChoice === normalizeText(condition.value);
      if (op === '!=') return currentChoice !== normalizeText(condition.value);
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

      var compareDate = parseDayValue(condition.value);
      if (!compareDate) return false;
      if (op === '=') return dayDiff(dateValue, compareDate) === 0;
      if (op === '!=') return dayDiff(dateValue, compareDate) !== 0;
      if (op === 'before') return dayDiff(dateValue, compareDate) < 0;
      if (op === 'after') return dayDiff(dateValue, compareDate) > 0;
      return false;
    }

    var textValue = normalizeText(rawValue);
    var compareText = normalizeText(condition.value);
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
          if (condition && condition.field && !outputFields.has(condition.field)) dependencyCodes.add(condition.field);
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
