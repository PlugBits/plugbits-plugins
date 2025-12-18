(function (namespace) {
  'use strict';

  const API_LIMIT = 500;

  const requireClient = () => {
    if (!namespace.storage || typeof namespace.storage.getKintone !== 'function') {
      throw new Error('storage helper is missing');
    }
    const client = namespace.storage.getKintone();
    if (!client) {
      throw new Error('kintone API is not available in this context');
    }
    return client;
  };

  const fetchFormFields = async (appId) => {
    const client = requireClient();
    const endpoints = ['/k/v1/preview/app/form/fields.json', '/k/v1/app/form/fields.json'];
    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        const response = await client.api(client.api.url(endpoint, true), 'GET', { app: appId });
        if (response && response.properties) {
          return response.properties;
        }
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) {
      throw lastError;
    }
    return {};
  };

  const fetchAllRecords = async ({ appId, fields = [], query = '' }) => {
    const client = requireClient();
    const uniqueFields = Array.from(new Set(fields.filter(Boolean)));
    const records = [];
    let offset = 0;
    while (true) {
      const request = { app: appId, query: `${query ? `${query} ` : ''}limit ${API_LIMIT} offset ${offset}` };
      if (uniqueFields.length) {
        request.fields = uniqueFields;
      }
      const response = await client.api(client.api.url('/k/v1/records.json', true), 'GET', request);
      if (response && Array.isArray(response.records)) {
        records.push(...response.records);
        if (response.records.length < API_LIMIT) {
          break;
        }
        offset += response.records.length;
      } else {
        break;
      }
    }
    return records;
  };

  const formatArray = (valueArray) => valueArray.map((entry) => {
    if (!entry) {
      return '';
    }
    if (typeof entry.name === 'string' && entry.name) {
      return entry.name;
    }
    if (typeof entry.code === 'string' && entry.code) {
      return entry.code;
    }
    if (typeof entry.value === 'string' && entry.value) {
      return entry.value;
    }
    return '';
  }).filter(Boolean).join(', ');

  const extractFieldValue = (field) => {
    if (!field) {
      return '';
    }
    const { value } = field;
    if (value == null) {
      return '';
    }
    if (Array.isArray(value)) {
      return formatArray(value);
    }
    if (typeof value === 'object') {
      if (typeof value.label === 'string' && value.label) {
        return value.label;
      }
      if (typeof value.name === 'string' && value.name) {
        return value.name;
      }
      if (typeof value.code === 'string' && value.code) {
        return value.code;
      }
      if ('value' in value) {
        return value.value == null ? '' : String(value.value);
      }
      return JSON.stringify(value);
    }
    return String(value);
  };

  namespace.kintoneClient = {
    fetchFormFields,
    fetchAllRecords,
    extractFieldValue
  };
})(window.PlugbitsExcelJoin = window.PlugbitsExcelJoin || {});
