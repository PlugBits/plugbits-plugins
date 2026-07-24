(() => {
  'use strict';

  const PLUGIN_ID = kintone.$PLUGIN_ID;

  // 既定のAPIサーバー。全テナント共通のため通常はユーザー入力不要
  //（開発・検証時のみ「詳細設定」から上書きできる）。
  const DEFAULT_API_BASE_URL = 'https://drawing-similarity-api-939943665629.asia-northeast1.run.app';

  const editableTextFields = ['apiBaseUrl', 'apiKey', 'tagSpaceId', 'processOptions', 'resultDetailFields'];
  const textFields = [...editableTextFields, 'tenantId'];
  const selectFields = ['drawingNoField', 'productNameField', 'pdfFileField', 'materialField', 'dimensionField', 'tagField', 'shapeTagField', 'processField'];
  const fields = [...textFields, ...selectFields];

  const LAYOUT_ONLY_TYPES = new Set(['SUBTABLE', 'GROUP', 'REFERENCE_TABLE', 'LABEL', 'SPACER', 'HR', 'RECORD_NUMBER', 'CATEGORY', 'STATUS', 'STATUS_ASSIGNEE']);

  // kintoneのサブドメインをテナントIDとして使う。手入力にすると環境間でズレるため常にドメインから再計算する。
  const deriveTenantId = () => (window.location.hostname || '').split('.')[0] || 'default';

  const getElement = (id) => document.getElementById(id);

  const config = kintone.plugin.app.getConfig(PLUGIN_ID);

  const populateSelect = (selectEl, fieldCode, properties) => {
    selectEl.innerHTML = '';

    const blankOption = document.createElement('option');
    blankOption.value = '';
    blankOption.textContent = '（未選択）';
    selectEl.appendChild(blankOption);

    const isFileField = selectEl.id === 'pdfFileField';
    const codes = Object.keys(properties)
      .filter((code) => {
        const type = properties[code].type;
        if (isFileField) return type === 'FILE';
        return !LAYOUT_ONLY_TYPES.has(type);
      })
      .sort((a, b) => a.localeCompare(b, 'ja'));

    codes.forEach((code) => {
      const option = document.createElement('option');
      option.value = code;
      const label = properties[code].label;
      option.textContent = label && label !== code ? code + '（' + label + '）' : code;
      selectEl.appendChild(option);
    });

    if (fieldCode && !codes.includes(fieldCode)) {
      const missingOption = document.createElement('option');
      missingOption.value = fieldCode;
      missingOption.textContent = fieldCode + '（現在の設定 / フィールド未検出）';
      selectEl.appendChild(missingOption);
    }

    selectEl.value = fieldCode || '';
  };

  editableTextFields.forEach((field) => {
    const element = getElement(field);
    if (element) {
      element.value = config[field] || '';
    }
  });

  // API Base URL: 既定値と同じ、または未設定の場合は入力欄を空のまま表示する
  //（placeholderで既定URLを見せる）。既定と異なる値が保存されている場合のみ
  // その値を表示し、詳細設定を開いた状態にして上書き中であることを示す。
  const apiBaseUrlEl = getElement('apiBaseUrl');
  if (apiBaseUrlEl) {
    const savedApiBaseUrl = (config.apiBaseUrl || '').trim();
    if (savedApiBaseUrl && savedApiBaseUrl !== DEFAULT_API_BASE_URL) {
      apiBaseUrlEl.value = savedApiBaseUrl;
      const advancedDetails = getElement('advancedSettings');
      if (advancedDetails) {
        advancedDetails.open = true;
      }
    } else {
      apiBaseUrlEl.value = '';
    }
  }

  getElement('tenantId').value = deriveTenantId();

  // 一括登録ボタンの表示トグル（既定: 表示）
  const bulkToggle = getElement('showBulkButton');
  if (bulkToggle) {
    bulkToggle.checked = config.showBulkButton !== 'false';
  }

  // デバッグ情報の表示トグル（既定: 非表示）
  const debugToggle = getElement('showDebugInfo');
  if (debugToggle) {
    debugToggle.checked = config.showDebugInfo === 'true';
  }

  // 過去図面アーカイブ取り込みメニューの表示トグル（既定: 表示）
  const archiveToggle = getElement('showArchiveButton');
  if (archiveToggle) {
    archiveToggle.checked = config.showArchiveButton !== 'false';
  }

  // 高速サムネイル（暗号化保存）の表示トグル（既定: オフ / オプトイン）。
  const fastThumbsToggle = getElement('fastThumbs');
  if (fastThumbsToggle) {
    fastThumbsToggle.checked = config.fastThumbs === 'true';
  }

  // 接続テスト: /health で疎通、/tags（認証対象）でAPIキーを検証する
  const testBtn = getElement('testConnection');
  const testStatus = getElement('testStatus');
  const setTestStatus = (state, message) => {
    testStatus.hidden = false;
    testStatus.className = 'pb-test-status ' + state;
    testStatus.textContent = message;
  };
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      const baseUrl = ((getElement('apiBaseUrl').value || '').trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
      const apiKey = (getElement('apiKey').value || '').trim();
      testBtn.disabled = true;
      setTestStatus('pending', '接続しています...（サーバー起動中は1分ほどかかることがあります）');
      try {
        // 認証有効時、runtime 詳細は有効なキーを送った場合のみ返る
        const authHeaders = apiKey ? { 'X-API-Key': apiKey } : {};
        const healthRes = await fetch(baseUrl + '/health', { headers: authHeaders });
        if (!healthRes.ok) {
          setTestStatus('err', '✗ サーバーに接続できません（HTTP ' + healthRes.status + '）');
          return;
        }
        const health = await healthRes.json();
        const engine = health.runtime ? (health.runtime.embeddingProvider || '') : '';
        const qdrant = health.runtime && health.runtime.qdrantConfigured;
        const tagsRes = await fetch(
          baseUrl + '/tags?tenantId=' + encodeURIComponent(deriveTenantId()),
          { headers: authHeaders }
        );
        if (tagsRes.status === 401) {
          setTestStatus('err', '✗ サーバーは稼働していますが、APIキーが無効です');
          return;
        }
        if (!tagsRes.ok) {
          setTestStatus('err', '✗ 認証確認に失敗しました（HTTP ' + tagsRes.status + '）');
          return;
        }
        setTestStatus('ok',
          '✓ 接続OK（' + [engine, qdrant ? 'Qdrant接続済み' : 'Qdrant未設定'].filter(Boolean).join(' / ') + '）'
        );
      } catch (e) {
        setTestStatus('err', '✗ 接続できません: ' + e.message);
      } finally {
        testBtn.disabled = false;
      }
    });
  }

  kintone.api(kintone.api.url('/k/v1/app/form/fields', true), 'GET', { app: kintone.app.getId() })
    .then((resp) => {
      const properties = resp.properties || {};
      selectFields.forEach((field) => {
        const element = getElement(field);
        if (element) {
          populateSelect(element, config[field] || '', properties);
        }
      });
    })
    .catch(() => {
      selectFields.forEach((field) => {
        const element = getElement(field);
        if (!element) return;
        element.innerHTML = '';
        const fallbackOption = document.createElement('option');
        fallbackOption.value = config[field] || '';
        fallbackOption.textContent = (config[field] || '') + '（フィールド一覧の取得に失敗しました）';
        element.appendChild(fallbackOption);
        element.value = config[field] || '';
      });
      window.alert('フィールド一覧の取得に失敗しました。アプリの設定を確認してください。');
    });

  // 図面ギャラリー: 一覧のカスタマイズビュー（表示形式「カスタマイズ」＝type === 'CUSTOM'）
  // を取得し、ドロップダウンに列挙する。ここで選ばれたビューは、plugin.js側で
  // app.record.index.show の event.viewId と照合して自動でギャラリーを描画する
  //（ビューのHTML編集は不要）。
  const galleryViewSelectEl = getElement('galleryViewId');
  if (galleryViewSelectEl) {
    kintone.api(kintone.api.url('/k/v1/app/views', true), 'GET', { app: kintone.app.getId() })
      .then((resp) => {
        const views = resp.views || {};
        const customViews = Object.keys(views)
          .map((key) => views[key])
          .filter((view) => view.type === 'CUSTOM')
          .sort((a, b) => Number(a.index) - Number(b.index));

        galleryViewSelectEl.innerHTML = '';

        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = '使用しない';
        galleryViewSelectEl.appendChild(noneOption);

        customViews.forEach((view) => {
          const option = document.createElement('option');
          option.value = view.id;
          option.textContent = view.name;
          galleryViewSelectEl.appendChild(option);
        });

        // 保存済みのビューが一覧に無い（削除された等）場合は、選択状態を保てるよう
        // 無効な項目として追加しておく（勝手に空選択へ戻して意図せず設定を失わせない）。
        const savedGalleryViewId = config.galleryViewId || '';
        const savedExists = customViews.some((view) => String(view.id) === String(savedGalleryViewId));
        if (savedGalleryViewId && !savedExists) {
          const missingOption = document.createElement('option');
          missingOption.value = savedGalleryViewId;
          missingOption.textContent = '（削除されたビュー: ' + savedGalleryViewId + '）';
          galleryViewSelectEl.appendChild(missingOption);
        }

        galleryViewSelectEl.value = savedGalleryViewId;
        galleryViewSelectEl.disabled = customViews.length === 0;
      })
      .catch(() => {
        galleryViewSelectEl.innerHTML = '';
        const errOption = document.createElement('option');
        errOption.value = config.galleryViewId || '';
        errOption.textContent = 'ビュー一覧を取得できませんでした';
        galleryViewSelectEl.appendChild(errOption);
        galleryViewSelectEl.disabled = true;
      });
  }

  getElement('save').addEventListener('click', () => {
    const nextConfig = fields.reduce((acc, field) => {
      const element = getElement(field);
      acc[field] = (element.value || '').trim();
      return acc;
    }, {});

    nextConfig.showBulkButton = getElement('showBulkButton') && getElement('showBulkButton').checked ? 'true' : 'false';
    nextConfig.showDebugInfo = getElement('showDebugInfo') && getElement('showDebugInfo').checked ? 'true' : 'false';
    nextConfig.showArchiveButton = getElement('showArchiveButton') && getElement('showArchiveButton').checked ? 'true' : 'false';

    nextConfig.fastThumbs = getElement('fastThumbs') && getElement('fastThumbs').checked ? 'true' : 'false';

    // 図面ギャラリーに使うビューID。取得失敗時はエラーオプションの値（＝既存設定を維持）が入る。
    nextConfig.galleryViewId = getElement('galleryViewId') ? (getElement('galleryViewId').value || '') : (config.galleryViewId || '');
    // 復号鍵は既存の値をまず引き継ぐ（fields配列に含めていないため、明示的にコピーしないと
    // 保存のたびに失われてしまう）。チェックONで、かつ未生成の場合のみ新規生成する。
    // 一度生成した鍵はチェックOFFにしても削除しない
    //（そうしないと過去に保存した暗号化サムネイルが復号できなくなる）。
    nextConfig.thumbEncKey = config.thumbEncKey || '';
    if (nextConfig.fastThumbs === 'true' && !nextConfig.thumbEncKey) {
      const keyBytes = crypto.getRandomValues(new Uint8Array(32));
      nextConfig.thumbEncKey = btoa(String.fromCharCode(...keyBytes));
    }

    // 未入力の場合は既定URLを実効値として保存する（プラグイン本体は常にURLが
    // 入っている前提で動作するため、plugin.js側の変更は不要）。
    nextConfig.apiBaseUrl = nextConfig.apiBaseUrl || DEFAULT_API_BASE_URL;

    kintone.plugin.app.setConfig(nextConfig);
  });

  getElement('cancel').addEventListener('click', () => {
    window.location.href = '../../' + kintone.app.getId() + '/plugin/';
  });
})();
