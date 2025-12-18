(function (global) {
  'use strict';

  const namespace = global.PlugbitsExcelJoin = global.PlugbitsExcelJoin || {};
  const STORAGE_KEY = 'masters';
  const SESSION_KEY = 'plugbits_excel_join_session';

  const safeJsonParse = (value, fallback) => {
    if (!value) {
      return fallback;
    }
    try {
      return JSON.parse(value);
    } catch (_error) {
      return fallback;
    }
  };

  const resolveWindow = () => {
    if (global.kintone) {
      return global;
    }
    try {
      if (global.opener && global.opener.kintone) {
        return global.opener;
      }
    } catch (_err) {
      /* ignore cross-origin */
    }
    try {
      if (global.parent && global.parent !== global && global.parent.kintone) {
        return global.parent;
      }
    } catch (_err) {
      /* ignore */
    }
    return null;
  };

  const getKintone = () => {
    const ctx = resolveWindow();
    return ctx ? ctx.kintone : null;
  };

  const getMasters = (pluginId) => {
    if (!pluginId) {
      return [];
    }
    const client = getKintone();
    if (!client || !client.plugin || !client.plugin.app) {
      return [];
    }
    const raw = client.plugin.app.getConfig(pluginId) || {};
    const masters = safeJsonParse(raw[STORAGE_KEY], []);
    return Array.isArray(masters) ? masters : [];
  };

  const saveMasters = (pluginId, masters) => {
    const client = getKintone();
    if (!client || !client.plugin || !client.plugin.app || !pluginId) {
      return Promise.reject(new Error('kintone API is unavailable'));
    }
    return new Promise((resolve, reject) => {
      try {
        client.plugin.app.setConfig({ [STORAGE_KEY]: JSON.stringify(masters || []) }, () => resolve());
      } catch (error) {
        reject(error);
      }
    });
  };

  const rememberSession = (payload) => {
    if (!global.sessionStorage) {
      return;
    }
    try {
      global.sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch (_error) {
      /* ignore */
    }
  };

  const readSession = () => {
    if (!global.sessionStorage) {
      return {};
    }
    try {
      return safeJsonParse(global.sessionStorage.getItem(SESSION_KEY), {}) || {};
    } catch (_error) {
      return {};
    }
  };

  namespace.storage = {
    getMasters,
    saveMasters,
    rememberSession,
    readSession,
    getKintone
  };
})(window);
