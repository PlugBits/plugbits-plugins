((PLUGIN_ID) => {
  'use strict';

  if (!PLUGIN_ID) {
    return;
  }

  const TEXTS = {
    ja: {
      button: 'Excel JOIN',
      needsConfig: 'マスター設定が未登録です。プラグイン設定を確認してください。',
      popupBlocked: 'ポップアップがブロックされました。ブラウザーの設定を確認してください。',
      resourceError: 'プラグインファイルを特定できませんでした。'
    },
    en: {
      button: 'Excel JOIN',
      needsConfig: 'No master definitions found. Please configure the plugin first.',
      popupBlocked: 'Popup was blocked. Please allow popups for this site.',
      resourceError: 'Could not resolve plugin resources.'
    }
  };

  const getLang = () => {
    try {
      return kintone.getLoginUser().language === 'ja' ? 'ja' : 'en';
    } catch (_error) {
      return 'en';
    }
  };

  const LANG = getLang();
  const t = (key) => (TEXTS[LANG] && TEXTS[LANG][key]) || TEXTS.en[key] || key;

  const safeJsonParse = (value) => {
    if (!value) {
      return [];
    }
    try {
      return JSON.parse(value);
    } catch (_error) {
      return [];
    }
  };

  const inferPluginBaseUrl = () => {
    const fromScript = (node) => {
      if (!node || !node.src) {
        return '';
      }
      try {
        const url = new URL(node.src, window.location.href);
        return url.href.replace(/plugin\.js(?:\?.*)?$/, '');
      } catch (_error) {
        return '';
      }
    };
    const current = fromScript(document.currentScript);
    if (current) {
      return current;
    }
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i += 1) {
      const script = scripts[i];
      if (script && script.src && script.src.indexOf(PLUGIN_ID) !== -1) {
        const guessed = fromScript(script);
        if (guessed) {
          return guessed;
        }
      }
    }
    const origin = window.location.origin || (`${window.location.protocol}//${window.location.host}`);
    return `${origin}/k/plugins/${PLUGIN_ID}/app/`;
  };

  const getJoinResourceUrl = () => {
    try {
      if (kintone.plugin && kintone.plugin.app && typeof kintone.plugin.app.getPluginResourceUrl === 'function') {
        const resource = kintone.plugin.app.getPluginResourceUrl(PLUGIN_ID, 'app/excel-join.html');
        if (resource) {
          return { url: resource, fromApi: true };
        }
      }
    } catch (_error) {
      /* ignore */
    }
    return { url: `${inferPluginBaseUrl()}excel-join.html`, fromApi: false };
  };

  const buildJoinUrl = () => {
    const result = getJoinResourceUrl();
    if (!result.url) {
      return { url: '', fromApi: result.fromApi };
    }
    if (result.fromApi) {
      return result;
    }
    const separator = result.url.indexOf('?') === -1 ? '?' : '&';
    return { url: `${result.url}${separator}pluginId=${encodeURIComponent(PLUGIN_ID)}`, fromApi: false };
  };

  const buildButton = (label) => {
    const root = document.createElement('div');
    root.className = 'kb-root kb-head';
    root.setAttribute('data-kb-plugin', 'excel-join');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kb-btn kb-primary';
    button.textContent = label;
    root.appendChild(button);
    return { root, button };
  };

  const openJoinWindow = (hasConfig) => {
    if (!hasConfig) {
      window.alert(t('needsConfig'));
      return;
    }
    const { url } = buildJoinUrl();
    if (!url) {
      window.alert(t('resourceError'));
      return;
    }
    try {
      window.sessionStorage.setItem('plugbitsExcelJoinPluginId', PLUGIN_ID);
    } catch (_error) {
      /* ignore session issues */
    }
    const win = window.open(url, 'plugbits-excel-join', 'width=1200,height=780,resizable=yes');
    if (!win) {
      window.alert(t('popupBlocked'));
    }
  };

  const rawConfig = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  const masterConfigs = safeJsonParse(rawConfig.masters);
  const hasMasters = Array.isArray(masterConfigs) && masterConfigs.length > 0;

  kintone.events.on('app.record.index.show', (event) => {
    const host = kintone.app.getHeaderMenuSpaceElement();
    if (!host) {
      return event;
    }
    let wrapper = host.querySelector('.kb-root[data-kb-plugin="excel-join"]');
    let button;
    if (!wrapper) {
      const built = buildButton(t('button'));
      wrapper = built.root;
      button = built.button;
      host.appendChild(wrapper);
    } else {
      button = wrapper.querySelector('button');
      if (button) {
        button.textContent = t('button');
      }
    }
    if (button && !button.dataset.bound) {
      button.dataset.bound = 'true';
      button.addEventListener('click', () => openJoinWindow(hasMasters));
    }
    if (button) {
      button.disabled = !hasMasters;
      if (!hasMasters) {
        button.setAttribute('title', t('needsConfig'));
      } else {
        button.removeAttribute('title');
      }
    }
    return event;
  });
})(kintone.$PLUGIN_ID);
