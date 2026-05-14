(() => {
  'use strict';

  const PLUGIN_ID = kintone.$PLUGIN_ID;
  if (!PLUGIN_ID) {
    return;
  }

  const parseViewIds = (value) => {
    if (!value) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      /* ignore */
    }
    return String(value)
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  };

  const CONFIG = (() => {
    const stored = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
    const normalize = (value) => (typeof value === 'string') ? value.trim() : '';
    return {
      toField: normalize(stored.toField),
      subjectField: normalize(stored.subjectField),
      bodyField: normalize(stored.bodyField),
      templateField: normalize(stored.templateField),
      buttonLabel: normalize(stored.buttonLabel),
      viewIds: parseViewIds(stored.viewIds || '')
    };
  })();

  if (!CONFIG.toField || !CONFIG.subjectField || !CONFIG.bodyField || !CONFIG.templateField) {
    console.warn('[outlook-compose] Plugin is not configured.');
    return;
  }

  const VIEW_ID_SET = new Set(CONFIG.viewIds);
  const hasViewLimit = VIEW_ID_SET.size > 0;

  const TEXT = {
    ja: {
      buttonLabelDefault: 'Outlook作成',
      alertMissingTo: '宛先が空です。レコードの値を確認してください。',
      alertMissingSubject: '件名が空です。レコードの値を確認してください。',
      alertMissingBody: '本文が空です。レコードの値を確認してください。',
      popupBlocked: 'Outlook を開けませんでした。ブラウザのポップアップ設定をご確認ください。',
      modalTitle: 'メールテンプレートを選択',
      modalDescription: '複数選択で連続起動できます。右端ボタンで単体作成も可能です。',
      modalSearchPlaceholder: 'テンプレート名で絞り込み',
      modalEmpty: '現在の一覧にはテンプレートがありません。',
      modalCompose: '選択したテンプレで作成',
      modalComposeSingle: 'このテンプレで作成',
      modalClose: '閉じる',
      modalNoSelection: 'テンプレートが選択されていません。'
    },
    en: {
      buttonLabelDefault: 'Compose Outlook',
      alertMissingTo: 'The To field is empty. Please check the record values.',
      alertMissingSubject: 'The subject is empty. Please check the record values.',
      alertMissingBody: 'The body is empty. Please check the record values.',
      popupBlocked: 'Unable to open Outlook. Please allow pop-ups in your browser.',
      modalTitle: 'Select mail templates',
      modalDescription: 'You can open multiple templates in sequence. Use the button on the right for single compose.',
      modalSearchPlaceholder: 'Filter by template name',
      modalEmpty: 'No templates are available in this view.',
      modalCompose: 'Compose with selected',
      modalComposeSingle: 'Compose this template',
      modalClose: 'Close',
      modalNoSelection: 'No templates selected.'
    }
  };

  const getLang = () => {
    try {
      const lang = window.kintone?.getLoginUser?.().language;
      if (lang && TEXT[lang]) {
        return lang;
      }
    } catch {
      /* ignore */
    }
    return 'ja';
  };

  const lang = getLang();
  const STRINGS = TEXT[lang];
  const BUTTON_LABEL = CONFIG.buttonLabel || STRINGS.buttonLabelDefault;

  const showToast = (message, type = 'info') => {
    const old = document.querySelector('.kb-root.kb-toast[data-kb-plugin="outlook-compose"]');
    if (old) {
      old.remove();
    }

    const toast = document.createElement('div');
    toast.className = `kb-root kb-toast kb-toast-${type}`;
    toast.setAttribute('data-kb-plugin', 'outlook-compose');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = message;

    document.body.appendChild(toast);

    window.setTimeout(() => {
      toast.classList.add('is-hide');
      window.setTimeout(() => toast.remove(), 180);
    }, 2200);
  };

  const normalizeLineBreaks = (text) => text.replace(/\r\n?/g, '\n');

  const parseRecipients = (value) => {
    if (!value) {
      return [];
    }
    const normalized = normalizeLineBreaks(value).replace(/[\u3001\uff0c]/gu, ',');
    return normalized
      .split(/[\s,;]+/u)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.replace(/^mailto:/iu, ''))
      .map((entry) => entry.replace(/[<>]/g, ''));
  };

  const extractText = (field) => {
    if (!field) {
      return '';
    }
    const { value } = field;
    if (typeof value === 'string') {
      return value;
    }
    if (value == null) {
      return '';
    }
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }
          if (item && typeof item === 'object') {
            return item.code || item.name || '';
          }
          return '';
        })
        .filter(Boolean)
        .join(', ');
    }
    return String(value);
  };

  const buildComposeUrl = (mail) => {
    const params = [];
    const add = (key, val) => {
      if (!val) {
        return;
      }
      params.push(`${key}=${encodeURIComponent(val)}`);
    };

    if (mail.to.length) {
      add('to', mail.to.join(';'));
    }
    if (mail.subject) {
      add('subject', mail.subject);
    }
    if (mail.body) {
      const normalized = normalizeLineBreaks(mail.body).replace(/\n/g, '\r\n');
      add('body', normalized);
    }

    const base = 'https://outlook.office.com/mail/deeplink/compose';
    if (!params.length) {
      return base;
    }
    return `${base}?${params.join('&')}`;
  };

  const openDraft = (record) => {
    const to = parseRecipients(extractText(record[CONFIG.toField]));
    if (!to.length) {
      showToast(STRINGS.alertMissingTo, 'warn');
      return;
    }

    const subject = extractText(record[CONFIG.subjectField]).trim();
    if (!subject) {
      showToast(STRINGS.alertMissingSubject, 'warn');
      return;
    }

    const body = extractText(record[CONFIG.bodyField]);
    if (!body.trim()) {
      showToast(STRINGS.alertMissingBody, 'warn');
      return;
    }

    const url = buildComposeUrl({ to, subject, body });
    const win = window.open(url, '_blank');
    if (win) {
      try {
        win.opener = null;
      } catch {
        /* ignore */
      }
    } else {
      showToast(STRINGS.popupBlocked, 'warn');
    }
  };

  const findOrCreateHeaderButton = (host) => {
    if (!host) {
      return null;
    }

    let root = host.querySelector('.kb-root[data-kb-plugin="outlook-compose"]');
    if (!root) {
      root = document.createElement('div');
      root.className = 'kb-root kb-head';
      root.setAttribute('data-kb-plugin', 'outlook-compose');

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'kb-btn kb-launch-btn';
      button.setAttribute('aria-label', BUTTON_LABEL);
      button.setAttribute('title', BUTTON_LABEL);

      const icon = document.createElement('span');
      icon.className = 'kb-launch-btn-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = `
      <svg viewBox="0 0 24 24" class="kb-ico" focusable="false" aria-hidden="true">
        <path d="M3 6.75A1.75 1.75 0 0 1 4.75 5h14.5A1.75 1.75 0 0 1 21 6.75v10.5A1.75 1.75 0 0 1 19.25 19H4.75A1.75 1.75 0 0 1 3 17.25V6.75zm1.5.16v.18l7.1 5.12a.7.7 0 0 0 .82 0l7.08-5.1v-.2a.25.25 0 0 0-.25-.25H4.75a.25.25 0 0 0-.25.25zm15 1.99-6.2 4.47a2.2 2.2 0 0 1-2.6 0L4.5 8.9v8.35c0 .14.11.25.25.25h14.5a.25.25 0 0 0 .25-.25V8.9z"></path>
      </svg>
    `;

      const text = document.createElement('span');
      text.className = 'kb-launch-btn-text';
      text.textContent = BUTTON_LABEL;

      button.append(icon, text);
      root.appendChild(button);
      host.appendChild(root);
      return button;
    }

    const text = root.querySelector('.kb-launch-btn-text');
    if (text && text.textContent !== BUTTON_LABEL) {
      text.textContent = BUTTON_LABEL;
    }

    const button = root.querySelector('button');
    if (button) {
      button.setAttribute('aria-label', BUTTON_LABEL);
      button.setAttribute('title', BUTTON_LABEL);
    }

    return button;
  };

  const removeHeaderButton = (host) => {
    if (!host) {
      return;
    }
    const root = host.querySelector('.kb-root[data-kb-plugin="outlook-compose"]');
    if (root) {
      root.remove();
    }
  };

  const buildModal = (records) => {
    if (document.querySelector('.kb-root.kb-backdrop[data-kb-plugin="outlook-compose"]')) {
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'kb-root kb-backdrop';
    backdrop.setAttribute('data-kb-plugin', 'outlook-compose');

    const modal = document.createElement('div');
    modal.className = 'kb-root kb-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', STRINGS.modalTitle);

    const card = document.createElement('div');
    card.className = 'kb-card kb-modal-card';

    const header = document.createElement('div');
    header.className = 'kb-modal-header';

    const title = document.createElement('div');
    title.className = 'kb-modal-title';
    title.textContent = STRINGS.modalTitle;

    const description = document.createElement('div');
    description.className = 'kb-modal-description';
    description.textContent = STRINGS.modalDescription;

    header.append(title, description);

    const searchWrap = document.createElement('div');
    searchWrap.className = 'kb-input kb-search-wrap';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = STRINGS.modalSearchPlaceholder;
    searchInput.setAttribute('aria-label', STRINGS.modalSearchPlaceholder);

    const resultCount = document.createElement('div');
    resultCount.className = 'kb-result-count';

    searchWrap.append(searchInput, resultCount);

    const list = document.createElement('ul');
    list.className = 'kb-template-list';

    const footer = document.createElement('div');
    footer.className = 'kb-modal-footer';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'kb-btn';
    closeBtn.textContent = STRINGS.modalClose;

    const composeManyBtn = document.createElement('button');
    composeManyBtn.type = 'button';
    composeManyBtn.className = 'kb-btn kb-primary';
    composeManyBtn.disabled = true;

    footer.append(closeBtn, composeManyBtn);
    card.append(header, searchWrap, list, footer);
    modal.appendChild(card);

    const removeModal = () => {
      modal.remove();
      backdrop.remove();
      window.removeEventListener('keydown', handleKeydown);
    };

    const updateComposeButton = () => {
      const checked = list.querySelectorAll('input[type="checkbox"]:checked').length;
      composeManyBtn.disabled = checked === 0;
      composeManyBtn.textContent = checked > 0
        ? (lang === 'ja' ? `${checked}件をOutlookで開く` : `Open ${checked} in Outlook`)
        : STRINGS.modalCompose;
    };

    const updateResultCount = () => {
      const visibleCount = Array.from(list.querySelectorAll('.kb-template-item'))
        .filter((li) => li.style.display !== 'none').length;
      resultCount.textContent = lang === 'ja'
        ? `${visibleCount}件`
        : `${visibleCount} items`;
    };

    const syncRowState = (li, checkbox) => {
      if (checkbox.checked) {
        li.classList.add('is-selected');
      } else {
        li.classList.remove('is-selected');
      }
    };

    const items = records.map((record, index) => {
      const templateLabel = extractText(record[CONFIG.templateField]).trim();
      const name = templateLabel || `#${record.$id?.value || index + 1}`;

      const li = document.createElement('li');
      li.className = 'kb-template-item';
      li.dataset.templateName = name.toLowerCase();

      const rowMain = document.createElement('button');
      rowMain.type = 'button';
      rowMain.className = 'kb-template-main';
      rowMain.setAttribute('aria-label', name);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = index.toString();
      checkbox.className = 'kb-template-check';
      checkbox.tabIndex = -1;

      const textWrap = document.createElement('div');
      textWrap.className = 'kb-template-text';

      const nameSpan = document.createElement('div');
      nameSpan.className = 'kb-template-name';
      nameSpan.textContent = name;

      textWrap.appendChild(nameSpan);
      rowMain.append(checkbox, textWrap);

      const composeSingleBtn = document.createElement('button');
      composeSingleBtn.type = 'button';
      composeSingleBtn.className = 'kb-btn kb-inline-btn kb-template-compose';
      composeSingleBtn.textContent = lang === 'ja' ? '作成' : 'Compose';
      composeSingleBtn.title = STRINGS.modalComposeSingle;

      rowMain.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
        syncRowState(li, checkbox);
        updateComposeButton();
      });

      checkbox.addEventListener('change', () => {
        syncRowState(li, checkbox);
        updateComposeButton();
      });

      composeSingleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        openDraft(record);
        removeModal();
      });

      li.append(rowMain, composeSingleBtn);
      list.appendChild(li);
      syncRowState(li, checkbox);
      return li;
    });

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'kb-empty';
      empty.textContent = STRINGS.modalEmpty;
      list.appendChild(empty);
    }

    const filterList = () => {
      const keyword = searchInput.value.trim().toLowerCase();
      items.forEach((li) => {
        const match = !keyword || li.dataset.templateName?.includes(keyword);
        li.style.display = match ? 'flex' : 'none';
      });
      updateResultCount();
    };

    const composeSelected = () => {
      const selectedIndexes = Array.from(list.querySelectorAll('input[type="checkbox"]:checked'))
        .map((input) => Number(input.value))
        .filter((idx) => Number.isInteger(idx));

      if (!selectedIndexes.length) {
        showToast(STRINGS.modalNoSelection, 'warn');
        return;
      }

      selectedIndexes.forEach((idx, order) => {
        const record = records[idx];
        if (!record) {
          return;
        }
        const delay = order * 250;
        window.setTimeout(() => openDraft(record), delay);
      });

      removeModal();
    };

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        removeModal();
        return;
      }
      if (event.key === 'Enter' && document.activeElement === searchInput) {
        event.preventDefault();
        if (!composeManyBtn.disabled) {
          composeSelected();
        }
      }
    };

    searchInput.addEventListener('input', filterList);
    closeBtn.addEventListener('click', removeModal);
    composeManyBtn.addEventListener('click', composeSelected);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        removeModal();
      }
    });
    window.addEventListener('keydown', handleKeydown);

    document.body.append(backdrop, modal);
    updateComposeButton();
    updateResultCount();
    searchInput.focus();
    filterList();
  };

  const getViewKey = (event) => {
    if (event.viewId != null) {
      return String(event.viewId);
    }
    if (event.viewName) {
      return `name:${event.viewName}`;
    }
    return '';
  };

  kintone.events.on('app.record.detail.show', (event) => {
    const host = kintone.app?.record?.getHeaderMenuSpaceElement?.() || kintone.app?.getHeaderMenuSpaceElement?.();
    const button = findOrCreateHeaderButton(host);
    if (button) {
      button.onclick = () => openDraft(event.record);
    }
    return event;
  });

  kintone.events.on('app.record.index.show', (event) => {
    const host = kintone.app?.getHeaderMenuSpaceElement?.();
    const records = Array.isArray(event.records) ? event.records : [];
    if (!records.length) {
      removeHeaderButton(host);
      return event;
    }

    if (hasViewLimit) {
      const viewKey = getViewKey(event);
      if (!VIEW_ID_SET.has(viewKey)) {
        removeHeaderButton(host);
        return event;
      }
    }

    const button = findOrCreateHeaderButton(host);
    if (button) {
      button.onclick = () => buildModal(records);
    }
    return event;
  });
})();
