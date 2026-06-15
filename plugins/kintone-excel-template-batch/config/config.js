(() => {
  'use strict';

  const PLUGIN_ID = kintone.$PLUGIN_ID;
  const APP_ID = kintone.app.getId();
  if (!PLUGIN_ID || !APP_ID) {
    return;
  }

  const BUILT_INS = [
    { value: 'recordId', label: 'レコード番号' },
    { value: 'seqNo', label: 'ラベル番号' },
    { value: 'seqTotal', label: 'ラベル総数' },
    { value: 'pageNo', label: 'ページ番号' },
    { value: 'pageTotal', label: 'ページ総数' },
    { value: 'detailStartNo', label: '明細開始番号' },
    { value: 'detailEndNo', label: '明細終了番号' },
    { value: 'labelQty', label: 'このラベルの数量' },
    { value: 'splitIndex', label: '分割番号' },
    { value: 'splitKey', label: '分割キー' },
    { value: 'ticketId', label: 'チケットID' },
    { value: 'qrText', label: 'QR文字列' },
    { value: 'ticketQr', label: 'Ticket QR文字列' },
    { value: 'partQr', label: 'Part QR文字列' },
    { value: 'today', label: '今日の日付' },
    { value: 'now', label: '現在日時' }
  ];

  const TEXT = {
    ja: {
      title: 'Excel帳票一括生成',
      description: 'Excelテンプレートに入力したタグへ、kintoneの値を差し込んでxlsxを出力します。',
      usageTitle: '使い方',
      usageStep1: 'Excelテンプレートに {{partNumber}} のようなタグを入れます。',
      usageStep2: 'この画面でタグとkintoneフィールドを対応付けます。',
      usageStep3: '一覧画面でレコードを選び、「ラベルを生成」を押すとExcelが出力されます。',
      templateSectionTitle: 'テンプレート設定',
      templateSectionHelp: 'Excelテンプレートをどこから取得するかを設定します。通常は「帳票テンプレートアプリから取得」を選択してください。',
      templateSourceLabel: 'テンプレートの取得方法',
      templateSourceAttachment: 'このアプリの添付ファイルから取得',
      templateSourceUrl: '固定URLから取得',
      templateSourceTemplateApp: '帳票テンプレートアプリから取得',
      templateFileFieldLabel: 'テンプレート添付ファイル',
      templateFileFieldHint: 'このアプリのレコードにテンプレートを添付する場合に選びます。',
      templateUrlLabel: 'テンプレートURL',
      templateUrlHint: '固定のxlsxファイルURLを指定します。',
      templateAppIdLabel: '帳票テンプレートアプリID',
      templateAppIdHint: '例: 255',
      templateCodeFieldLabel: 'テンプレートコードのフィールドコード',
      templateCodeFieldHint: '通常は templateCode のままでOKです。',
      templateAppFileFieldLabel: 'テンプレート添付ファイルのフィールドコード',
      templateAppFileFieldHint: '通常は templateFile のままでOKです。',
      templateCodeLabel: '使用するテンプレートコード',
      templateCodeHint: '例: WI_LABEL, QC_COMPLETED_LABEL',
      templateStatusFieldLabel: 'ステータスのフィールドコード',
      templateStatusFieldHint: '通常は status のままでOKです。',
      templateActiveValueLabel: '有効ステータス値',
      templateActiveValueHint: '通常は ACTIVE のままでOKです。',
      quantitySectionTitle: 'ラベル枚数設定',
      quantitySectionHelp: '1つのレコードから複数枚のラベルを作る場合に設定します。例: 100個を25個入りラベルで分ける場合、4枚のラベルを作成します。',
      quantitySplitLabel: '複数ラベル作成',
      enableQuantitySplitLabel: '数量に応じてラベルを複数枚作成する',
      quantityExample1: '出力例: 100 ÷ 25 = 4枚',
      quantityExample2: '端数例: 110 ÷ 25 = 5枚、最後のラベルは10個',
      quantityFieldLabel: '全体数量のフィールド',
      quantityFieldHint: '例: Plan: 100 のような文字列でも数値部分を読み取ります。',
      packQtyFieldLabel: '1ラベルあたりの数量フィールド',
      packQtyFieldHint: '例: 25',
      outputQtyTagLabel: 'ラベル数量タグ名',
      outputQtyTagHint: '通常は labelQty のままでOKです。Excelでは {{labelQty}} と入力します。',
      qrSectionLabel: 'QR画像',
      enableQrImageLabel: 'QR画像を出力する',
      qrImageHelp: '使い方: 1. QRを置きたいセル範囲を結合します。2. 左上セルへ {{QR:ticketQr}} を入力します。3. 出力時に結合セル範囲へQRが自動配置されます。',
      qrPaddingLabel: 'QR余白(px)',
      qrPaddingHint: '通常は 4 のままでOKです。QRタグを入れた結合セル範囲へ、自動的にフィットします。',
      mappingSectionTitle: 'Excel差し込み設定',
      mappingSectionHelp: 'Excelテンプレート内の {{タグ名}} に、kintoneの値を差し込みます。',
      mappingHelpExample: 'Excel側には {{partNumber}} のように入力してください。ここで partNumber に対応するkintoneフィールドを選ぶと、出力時に値が入ります。',
      examplePartNumber: 'Part Number',
      exampleQty: 'このラベルの数量',
      exampleSeqNo: 'ラベル番号',
      exampleSeqTotal: 'ラベル総数',
      mappingTagName: 'Excel内のタグ名',
      mappingSourceType: '差し込む値の種類',
      mappingSourceValue: '選択内容',
      mappingFieldValue: 'kintoneフィールド',
      mappingBuiltInValue: '自動生成値',
      mappingStaticValue: '固定文字',
      addMappingRow: '差し込み項目を追加',
      deleteMappingRow: '削除',
      sourceField: 'kintoneフィールド',
      sourceBuiltIn: '自動生成値',
      sourceStatic: '固定文字',
      advancedSummary: '詳細設定（通常は変更不要）',
      advancedHelp: 'エンジニア向けの設定です。通常は上の差し込み設定を使用してください。',
      mappingLabel: '詳細JSONマッピング',
      mappingHint: '旧設定との互換用です。差し込み項目が空の場合だけ使用されます。',
      outputFileNameLabel: '出力ファイル名',
      outputFileNameHint: '空の場合は excel-output-日時.xlsx になります。',
      buttonLabel: '一覧画面のボタン名',
      buttonHint: '空の場合は「ラベルを生成」を表示します。',
      columnWidthScaleLabel: '列幅補正率',
      columnWidthScaleHint: 'Excel出力後に横幅が少し広がる場合のみ調整してください。例: 0.92cm → 0.87cm にしたい場合は 0.95 など。通常は1です。',
      rowHeightScaleLabel: '行高さ補正率',
      rowHeightScaleHint: '出力後に縦方向が縮む場合だけ調整してください。通常は1です。',
      viewFieldLabel: 'ボタンを表示する一覧',
      viewHint: '未選択の場合はすべての一覧で表示します。',
      viewEmpty: '一覧が見つかりません。',
      save: '保存',
      cancel: 'キャンセル',
      required: '必須',
      notSet: '選択してください',
      messageRequiredAttachment: 'テンプレート添付ファイルを選択してください。',
      messageRequiredUrl: 'テンプレートURLを入力してください。',
      messageRequiredTemplateAppId: '帳票テンプレートアプリIDを入力してください。',
      messageRequiredTemplateCode: '使用するテンプレートコードを入力してください。',
      messageRequiredTemplateFileField: 'テンプレート添付ファイルのフィールドコードを入力してください。',
      messageRequiredSplitFields: '全体数量のフィールドと1ラベルあたりの数量フィールドを選択してください。',
      messageInvalidMappingRows: '差し込み設定に未入力があります。Excel内のタグ名、値の種類、選択内容を確認してください。',
      messageInvalidMapping: '詳細JSONマッピングの形式が正しくありません。',
      messageSaved: '設定を保存しました。',
      apiError: 'フィールド情報の取得に失敗しました。ページを再読み込みしてください。'
    },
    en: {}
  };

  TEXT.en = TEXT.ja;

  Object.assign(TEXT.ja, {
    title: 'Excel帳票一括生成',
    description: 'Excelテンプレート内のタグへkintoneの値を差し込み、xlsxファイルを出力します。',
    usageTitle: '使い方',
    usageStep1: 'Excelテンプレートに {{partNumber}} のようなタグを入れます。',
    usageStep2: 'この画面でタグとkintoneフィールドを対応付けます。',
    usageStep3: '一覧画面でレコードを選び、「ラベルを生成」を押すとExcelが出力されます。',
    templateSectionTitle: 'テンプレート設定',
    templateSectionHelp: 'Excelテンプレートをどこから取得するかを設定します。通常は「帳票テンプレートアプリ」を選択してください。',
    templateSourceLabel: 'テンプレートの取得方法',
    templateSourceAttachment: 'このアプリの添付ファイルから取得',
    templateSourceAttachmentDesc: '出力対象レコードにExcelテンプレートを添付して使います。',
    templateSourceUrl: '固定URLから取得',
    templateSourceUrlDesc: '固定のxlsxファイルURLからテンプレートを取得します。',
    templateSourceTemplateApp: '帳票テンプレートアプリから取得',
    templateSourceTemplateAppDesc: '通常はこちらを選択してください。',
    templateFileFieldLabel: 'テンプレート添付ファイル',
    templateFileFieldHint: 'このアプリのレコードにテンプレートを添付する場合に選びます。',
    templateUrlLabel: 'テンプレートURL',
    templateUrlHint: '固定のxlsxファイルURLを指定します。',
    templateAppIdLabel: '帳票テンプレートアプリID',
    templateAppIdHint: '例: 255',
    templateCodeFieldLabel: 'テンプレートコードのフィールドコード',
    templateCodeFieldHint: '通常は templateCode のままでOKです。',
    templateAppFileFieldLabel: 'テンプレート添付ファイルのフィールドコード',
    templateAppFileFieldHint: '通常は templateFile のままでOKです。',
    templateCodeLabel: '使用するテンプレートコード',
    templateCodeHint: '例: WI_LABEL, QC_COMPLETED_LABEL',
    templateStatusFieldLabel: 'ステータスのフィールドコード',
    templateStatusFieldHint: '通常は status のままでOKです。',
    templateActiveValueLabel: '有効ステータス値',
    templateActiveValueHint: '通常は ACTIVE のままでOKです。',
    quantitySectionTitle: 'ラベル枚数設定',
    quantitySectionHelp: '1つのレコードから複数枚のラベルを作る場合に設定します。例: 100個を25個入りラベルで分ける場合、4枚のラベルを作成します。',
    quantitySplitLabel: '複数ラベル作成',
    enableQuantitySplitLabel: '数量に応じてラベルを複数枚作成する',
    enableQuantitySplitDesc: '例: 100個を25個入りで分ける場合、4枚のラベルを作成します。',
    quantityExample1: '出力例: 100 ÷ 25 = 4枚',
    quantityExample2: '端数例: 110 ÷ 25 = 5枚、最後のラベルは10個',
    quantityFieldLabel: '全体数量のフィールド',
    quantityFieldHint: '例: Plan: 100 のような文字列でも数値部分を読み取ります。',
    packQtyFieldLabel: '1ラベルあたりの数量フィールド',
    packQtyFieldHint: '例: 25',
    outputQtyTagLabel: 'ラベル数量タグ名',
    outputQtyTagHint: '通常は labelQty のままでOKです。Excelでは {{labelQty}} と入力します。',
    qrSectionLabel: 'QR画像',
    enableQrImageLabel: 'QR画像を出力する',
    enableQrImageDesc: 'ExcelのQRタグを画像に置き換えます。',
    qrImageHelp: '使い方: 1. QRを置きたいセル範囲を結合します。2. 左上セルへ {{QR:ticketQr}} を入力します。3. 出力時に結合セル範囲へQRが自動配置されます。',
    qrPaddingLabel: 'QR余白(px)',
    qrPaddingHint: '通常は 4 のままでOKです。QRタグを入れた結合セル範囲へ、自動的にフィットします。',
    mappingSectionTitle: 'Excel差し込み設定',
    mappingSectionHelp: 'Excelテンプレート内の {{タグ名}} に、kintoneの値を差し込みます。',
    mappingHelpExample: 'Excel側には {{partNumber}} のように入力してください。ここで partNumber に対応するkintoneフィールドを選ぶと、出力時に値が入ります。',
    examplePartNumber: 'Part Number',
    exampleQty: 'このラベルの数量',
    exampleSeqNo: 'ラベル番号',
    exampleSeqTotal: 'ラベル総数',
    mappingTagName: 'Excel内のタグ名',
    mappingSourceType: '差し込む値の種類',
    mappingSourceValue: '選択内容',
    mappingFieldValue: 'kintoneフィールド',
    mappingBuiltInValue: '自動生成値',
    mappingStaticValue: '固定文字',
    addMappingRow: '差し込み項目を追加',
    deleteMappingRow: '削除',
    sourceField: 'kintoneフィールド',
    sourceBuiltIn: '自動生成値',
    sourceStatic: '固定文字',
    outputSectionTitle: '出力・表示設定',
    outputSectionHelp: '出力ファイル名、一覧画面のボタン名、印刷レイアウト補正を設定します。',
    outputFileNameLabel: '出力ファイル名',
    outputFileNameHint: '空の場合は excel-output-日時.xlsx になります。',
    buttonLabel: '一覧画面のボタン名',
    buttonHint: '空の場合は「ラベルを生成」を表示します。',
    columnWidthScaleLabel: '横幅補正',
    columnWidthScaleHint: 'Excel出力後に横幅が広がる/狭まる場合に調整します。通常は100%です。',
    rowHeightScaleLabel: '縦高さ補正',
    rowHeightScaleHint: 'Excel出力後に縦方向が広がる/狭まる場合に調整します。通常は100%です。',
    viewFieldLabel: 'ボタンを表示する一覧',
    viewHint: '未選択の場合はすべての一覧で表示します。',
    viewEmpty: '一覧が見つかりません。',
    advancedSummary: '詳細設定（エンジニア向け）',
    advancedHelp: '通常は変更不要です。差し込み設定をJSONで直接指定したい場合のみ使用してください。',
    mappingLabel: '詳細JSONマッピング',
    mappingHint: '旧設定との互換用です。差し込み項目が空の場合だけ使用されます。',
    save: '保存',
    cancel: 'キャンセル',
    required: '必須',
    notSet: '選択してください',
    messageRequiredAttachment: 'テンプレート添付ファイルを選択してください。',
    messageRequiredUrl: 'テンプレートURLを入力してください。',
    messageRequiredTemplateAppId: '帳票テンプレートアプリIDを入力してください。',
    messageRequiredTemplateCode: '使用するテンプレートコードを入力してください。',
    messageRequiredTemplateFileField: 'テンプレート添付ファイルのフィールドコードを入力してください。',
    messageRequiredSplitFields: '全体数量のフィールドと1ラベルあたりの数量フィールドを選択してください。',
    messageInvalidMappingRows: '差し込み設定に未入力があります。Excel内のタグ名、値の種類、選択内容を確認してください。',
    messageInvalidMapping: '詳細JSONマッピングの形式が正しくありません。',
    messageSaved: '設定を保存しました',
    messageUpdateApp: '設定を反映するため、右上の「アプリを更新」を押してください。',
    apiError: 'フィールド情報の取得に失敗しました。ページを再読み込みしてください。'
  });

  BUILT_INS.forEach((item) => {
    const labels = {
      recordId: 'レコード番号',
      seqNo: 'ラベル番号',
      seqTotal: 'ラベル総数',
      pageNo: 'ページ番号',
      pageTotal: 'ページ総数',
      detailStartNo: '明細開始番号',
      detailEndNo: '明細終了番号',
      labelQty: 'このラベルの数量',
      splitIndex: '分割番号',
      splitKey: '分割キー',
      ticketId: 'チケットID',
      qrText: 'QR文字列',
      ticketQr: 'Ticket QR文字列',
      partQr: 'Part QR文字列',
      today: '今日の日付',
      now: '現在日時'
    };
    item.label = labels[item.value] || item.label;
  });

  Object.assign(TEXT.ja, {
    description: 'Excelテンプレートへkintoneの値を差し込み、xlsxを出力します。',
    usageStep3: '一覧画面でレコードを選び、「ラベルを生成」を押すとExcelが出力されます。',
    templateSectionHelp: '通常は「帳票テンプレートアプリから取得」を選択します。',
    templateSourceTemplateApp: '帳票テンプレートアプリから取得',
    templateSourceAttachment: 'このアプリの添付ファイルから取得',
    templateSourceUrl: '固定URLから取得',
    templateFileFieldHint: 'レコード添付のExcelを使う場合に選択します。',
    templateUrlHint: 'xlsxファイルのURLを指定します。',
    templateAppIdHint: '例: 255',
    templateCodeFieldHint: '通常は templateCode',
    templateAppFileFieldHint: '通常は templateFile',
    templateCodeHint: '例: WI_LABEL',
    templateStatusFieldHint: '通常は status',
    templateActiveValueHint: '通常は ACTIVE',
    quantitySectionTitle: '出力モード・枚数設定',
    quantitySectionHelp: '数量と1ラベルあたり数量から、必要なラベル枚数を計算します。',
    enableQuantitySplitDesc: '例: 100個を25個入りで分ける場合、4枚作成します。',
    quantityExample1: '100 ÷ 25 = 4枚',
    quantityExample2: '110 ÷ 25 = 5枚、最後は10個',
    quantityFieldHint: '例: Plan: 100 でも数値部分を読み取ります。',
    packQtyFieldHint: '例: 25',
    outputQtyTagHint: '通常は labelQty。Excelでは {{labelQty}} と入力します。',
    enableQrImageDesc: 'ExcelのQRタグを画像に置き換えます。',
    qrImageHelp: 'QRを置きたいセルを結合し、左上セルへ {{QR:ticketQr}} を入力します。',
    qrPaddingHint: '通常は4。結合セル内に収まるよう余白を取ります。',
    mappingSectionHelp: 'Excel内の {{タグ名}} に差し込む値を設定します。',
    mappingHelpExample: 'Excel側に {{partNumber}} のようなタグを入れ、対応する値を選びます。',
    outputSectionHelp: '出力ファイル名、ボタン名、印刷レイアウト補正を設定します。',
    outputFileNameHint: '空の場合は excel-output-日時.xlsx になります。',
    buttonHint: '空の場合は「ラベルを生成」を表示します。',
    columnWidthScaleHint: '横幅が広がる/狭まる場合だけ調整します。通常は100%です。',
    rowHeightScaleHint: '縦方向が広がる/狭まる場合だけ調整します。通常は100%です。',
    viewHint: '未選択の場合はすべての一覧で表示します。',
    advancedHelp: '通常は変更不要です。JSONで直接指定したい場合のみ使用します。',
    mappingLabel: '詳細JSONマッピング',
    mappingHint: '差し込み項目が空の場合だけ使用される旧設定です。',
    messageInvalidMapping: '詳細JSONマッピングの形式が正しくありません。'
  });

  const getLang = () => {
    try {
      const lang = window.kintone?.getLoginUser?.().language;
      if (lang && TEXT[lang]) {
        return lang;
      }
    } catch {
      /* noop */
    }
    return 'ja';
  };

  const normalizeTemplateSource = (value) => {
    const map = {
      attachment: 'recordFile',
      url: 'fixedUrl',
      recordFile: 'recordFile',
      fixedUrl: 'fixedUrl',
      templateApp: 'templateApp'
    };
    return map[value] || 'templateApp';
  };

  const normalizeOutputMode = (value) => {
    return value === 'report' ? 'report' : 'label';
  };

  Object.assign(TEXT.ja, {
    outputModeLabel: '出力モード',
    outputModeLabelMode: 'ラベル出力',
    outputModeReportMode: '帳票出力（明細テーブルをページごとにシート分割）',
    outputModeHelp: '帳票出力では、サブテーブル明細を指定行数ごとに分け、ページごとに同じテンプレートシートへ出力します。',
    reportDetailTableFieldLabel: '明細サブテーブル',
    reportDetailTableFieldHint: '帳票の明細行として出力するサブテーブルを選択します。',
    reportDetailStartRowLabel: '明細開始行',
    reportDetailStartRowHint: 'Excelテンプレート上で明細を書き始める行番号です。例: 15',
    reportRowsPerPageLabel: '1ページあたりの明細行数',
    reportRowsPerPageHint: 'この行数を超えた明細は次のシートへ出力します。',
    reportHideEmptyRowsSectionLabel: '余り行の表示',
    reportHideEmptyRowsLabel: '明細がない余り行を非表示にする',
    reportHideEmptyRowsHint: '明細が少ないページで、空の明細行を隠して帳票を詰めます。合計欄など下の行も上に詰まります。',
    reportDetailColumnLabel: 'Excel列',
    reportDetailFieldLabel: 'サブテーブル内フィールド',
    addReportDetailRow: '明細列を追加',
    reportDetailRowsHint: '例: A列に品番、B列に品名、C列に数量を出力します。Excel列は A, B, AA のように入力します。',
    messageRequiredReportSettings: '帳票出力では、明細サブテーブル、明細開始行、1ページあたりの明細行数が必要です。',
    messageInvalidReportDetailRows: '明細列設定に未入力があります。Excel列とサブテーブル内フィールドを確認してください。',
    printStatusSectionLabel: '印刷ステータス更新',
    enablePrintStatusUpdateLabel: '帳票生成後に印刷ステータスを更新する',
    printStatusUpdateHelp: 'チェックを入れると更新設定を表示します。例: NOT_PRINTED → PRINTED、PRINTED → REPRINTED',
    printStatusFieldCodeLabel: '印刷ステータスフィールド',
    printStatusFieldCodeHint: 'このアプリのフィールドから選択します。',
    printedStatusValueLabel: '初回印刷後の値',
    printedStatusValueHint: '初回印刷後に設定する値です。例: PRINTED',
    reprintedStatusValueLabel: '再印刷後の値',
    reprintedStatusValueHint: '再印刷後に設定する値です。例: REPRINTED',
    printedAtFieldCodeLabel: '印刷日時フィールド（任意）',
    printedAtFieldCodeHint: '更新しない場合は未選択にしてください。',
    printedByFieldCodeLabel: '印刷者フィールド（任意）',
    printedByFieldCodeHint: '更新しない場合は未選択にしてください。USER_SELECTにはログインユーザー、その他のフィールドにはユーザー名を設定します。',
    mappingAction: '操作',
    outputFileNameHint: '空の場合は TicketLabels_YYYYMMDD_HHmm.xlsx になります。',
    maxSheetsPerWorkbookLabel: '最大シート数',
    maxSheetsPerWorkbookHint: '選択件数がこの上限を超える場合は出力を中止します。通常は100です。'
  });
  TEXT.en = TEXT.ja;

  const lang = getLang();
  const STRINGS = TEXT[lang];
  const $ = (id) => document.getElementById(id);
  let mappableFields = [];
  let subtableFields = [];
  let subtableFieldMap = {};

  const els = {
    message: $('message'),
    recordFileField: $('recordFileField'),
    templateUrl: $('templateUrl'),
    templateAppId: $('templateAppId'),
    templateCodeField: $('templateCodeField'),
    templateAppFileField: $('templateAppFileField'),
    templateCode: $('templateCode'),
    templateStatusField: $('templateStatusField'),
    templateActiveValue: $('templateActiveValue'),
    reportDetailTableField: $('reportDetailTableField'),
    reportDetailStartRow: $('reportDetailStartRow'),
    reportRowsPerPage: $('reportRowsPerPage'),
    reportHideEmptyRows: $('reportHideEmptyRows'),
    reportDetailRows: $('reportDetailRows'),
    addReportDetailRow: $('addReportDetailRow'),
    enableQuantitySplit: $('enableQuantitySplit'),
    quantityField: $('quantityField'),
    packQtyField: $('packQtyField'),
    outputQtyTag: $('outputQtyTag'),
    enableQrImage: $('enableQrImage'),
    qrPadding: $('qrPadding'),
    enablePrintStatusUpdate: $('enablePrintStatusUpdate'),
    printStatusFieldCode: $('printStatusFieldCode'),
    printedStatusValue: $('printedStatusValue'),
    reprintedStatusValue: $('reprintedStatusValue'),
    printedAtFieldCode: $('printedAtFieldCode'),
    printedByFieldCode: $('printedByFieldCode'),
    mappingRows: $('mappingRows'),
    addMappingRow: $('addMappingRow'),
    mappingJson: $('mappingJson'),
    outputFileName: $('outputFileName'),
    maxSheetsPerWorkbook: $('maxSheetsPerWorkbook'),
    buttonLabel: $('buttonLabel'),
    columnWidthScale: $('columnWidthScale'),
    rowHeightScale: $('rowHeightScale'),
    viewList: $('viewList'),
    save: $('save'),
    cancel: $('cancel')
  };

  const onReady = (fn) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  };

  const setTextContent = () => {
    document.querySelectorAll('[data-i18n]').forEach((node) => {
      const key = node.getAttribute('data-i18n');
      if (key && Object.prototype.hasOwnProperty.call(STRINGS, key)) {
        node.textContent = STRINGS[key];
      }
    });
  };

  const showMessage = (text) => {
    els.message.textContent = text || '';
    els.message.style.display = text ? 'block' : 'none';
    if (text) {
      els.message.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const showToast = ({ type = 'info', message, duration = 2500 }) => {
    if (!message) {
      return;
    }

    const old = document.querySelector('.etb-toast');
    if (old) {
      old.remove();
    }

    const toast = document.createElement('div');
    const color = type === 'success'
      ? { bg: '#ecfdf3', border: '#86efac', text: '#166534' }
      : { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' };

    toast.className = `etb-toast etb-toast-${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    Object.assign(toast.style, {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      zIndex: '9999',
      maxWidth: '420px',
      padding: '12px 14px',
      border: `1px solid ${color.border}`,
      borderRadius: '8px',
      background: color.bg,
      color: color.text,
      boxShadow: '0 8px 24px rgba(15, 23, 42, 0.16)',
      fontWeight: '700',
      whiteSpace: 'pre-line',
      opacity: '0',
      transform: 'translateY(8px)',
      transition: 'opacity 160ms ease, transform 160ms ease'
    });

    document.body.appendChild(toast);
    window.requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    window.setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      window.setTimeout(() => toast.remove(), 180);
    }, duration);
  };

  const redirectToAppSettings = () => {
    const appId = encodeURIComponent(String(APP_ID));
    window.location.href = `/k/admin/app/flow?app=${appId}`;
  };

  const parseJsonArray = (value) => {
    if (!value) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const parseViewIds = (value) => {
    const array = parseJsonArray(value);
    if (array.length) {
      return array.map((item) => String(item));
    }
    return String(value || '').split(',').map((v) => v.trim()).filter(Boolean);
  };

  const scaleToPercent = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      return '100';
    }
    return String(Math.round(n * 100));
  };

  const percentToScale = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      return '1';
    }
    return String(Number((n / 100).toFixed(4)));
  };

  const loadConfig = () => {
    const stored = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
    const inferredSource = stored.templateSource ||
      (stored.templateUrl ? 'fixedUrl' : stored.templateFileField ? 'recordFile' : 'templateApp');
    return {
      outputMode: normalizeOutputMode(stored.outputMode),
      templateSource: normalizeTemplateSource(inferredSource),
      templateFileField: stored.templateFileField || '',
      templateUrl: stored.templateUrl || '',
      templateAppId: stored.templateAppId || '',
      templateCodeField: stored.templateCodeField || 'templateCode',
      templateCode: stored.templateCode || '',
      templateStatusField: stored.templateStatusField || 'status',
      templateActiveValue: stored.templateActiveValue || 'ACTIVE',
      reportDetailTableField: stored.reportDetailTableField || '',
      reportDetailStartRow: stored.reportDetailStartRow || '15',
      reportRowsPerPage: stored.reportRowsPerPage || '20',
      reportHideEmptyRows: stored.reportHideEmptyRows !== 'false',
      reportDetailRows: parseJsonArray(stored.reportDetailRows || ''),
      enableQuantitySplit: stored.enableQuantitySplit === 'true',
      quantityField: stored.quantityField || '',
      packQtyField: stored.packQtyField || '',
      outputQtyTag: stored.outputQtyTag || 'labelQty',
      enableQrImage: stored.enableQrImage !== 'false',
      qrPadding: stored.qrPadding || '4',
      enablePrintStatusUpdate: stored.enablePrintStatusUpdate === 'true',
      printStatusFieldCode: stored.printStatusFieldCode || '',
      printedStatusValue: stored.printedStatusValue || 'PRINTED',
      reprintedStatusValue: stored.reprintedStatusValue || 'REPRINTED',
      printedAtFieldCode: stored.printedAtFieldCode || '',
      printedByFieldCode: stored.printedByFieldCode || '',
      mappingRows: parseJsonArray(stored.mappingRows || ''),
      mappingJson: stored.mappingJson || '',
      outputFileName: stored.outputFileName || '',
      maxSheetsPerWorkbook: stored.maxSheetsPerWorkbook || '100',
      buttonLabel: stored.buttonLabel || '',
      columnWidthScale: stored.columnWidthScale || '1',
      rowHeightScale: stored.rowHeightScale || '1',
      viewIds: parseViewIds(stored.viewIds || '')
    };
  };

  const createPlaceholderOption = (select) => {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = STRINGS.notSet;
    select.appendChild(opt);
  };

  const populateSelect = (select, fields, selectedValue) => {
    select.innerHTML = '';
    createPlaceholderOption(select);
    fields.forEach((field) => {
      const opt = document.createElement('option');
      opt.value = field.code;
      opt.textContent = `${field.label} (${field.code})`;
      opt.selected = field.code === selectedValue;
      select.appendChild(opt);
    });
  };

  const fetchFields = async () => {
    const url = kintone.api.url('/k/v1/app/form/fields', true);
    const resp = await kintone.api(url, 'GET', { app: APP_ID });
    const props = resp?.properties || {};
    const allFields = [];
    const fileFields = [];
    const subtableFields = [];
    const subtableFieldMap = {};
    Object.values(props).forEach((prop) => {
      if (!prop) {
        return;
      }
      if (prop.type === 'SUBTABLE') {
        const table = {
          code: prop.code,
          label: prop.label || prop.code,
          type: prop.type
        };
        subtableFields.push(table);
        subtableFieldMap[prop.code] = Object.values(prop.fields || {}).map((fieldProp) => ({
          code: fieldProp.code,
          label: fieldProp.label || fieldProp.code,
          type: fieldProp.type
        }));
        return;
      }
      const field = {
        code: prop.code,
        label: prop.label || prop.code,
        type: prop.type
      };
      if (prop.type === 'FILE') {
        fileFields.push(field);
      } else {
        allFields.push(field);
      }
    });
    const locale = lang === 'ja' ? 'ja-JP' : 'en-US';
    allFields.sort((a, b) => a.label.localeCompare(b.label, locale));
    fileFields.sort((a, b) => a.label.localeCompare(b.label, locale));
    subtableFields.sort((a, b) => a.label.localeCompare(b.label, locale));
    Object.values(subtableFieldMap).forEach((fields) => {
      fields.sort((a, b) => a.label.localeCompare(b.label, locale));
    });
    return { allFields, fileFields, subtableFields, subtableFieldMap };
  };

  const fetchViews = async () => {
    const url = kintone.api.url('/k/v1/app/views', true);
    const resp = await kintone.api(url, 'GET', { app: APP_ID });
    const views = Object.values(resp?.views || {}).map((view) => {
      const id = view?.id != null ? String(view.id) : '';
      const name = view?.name || '';
      return {
        key: id || `name:${name}`,
        id,
        name
      };
    });
    const locale = lang === 'ja' ? 'ja-JP' : 'en-US';
    views.sort((a, b) => a.name.localeCompare(b.name, locale));
    return views;
  };

  const renderViewList = (views, selectedIds) => {
    els.viewList.innerHTML = '';
    const selectedSet = new Set(selectedIds);
    views.forEach((view) => {
      const row = document.createElement('label');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = view.key;
      checkbox.checked = selectedSet.has(view.key);

      const title = document.createElement('span');
      title.textContent = view.name || view.key;

      const desc = document.createElement('span');
      desc.className = 'etb-view-id';
      desc.textContent = view.id ? `一覧ID: ${view.id}` : '一覧ID: -';

      row.append(checkbox, title, desc);
      els.viewList.appendChild(row);
    });

    if (!views.length) {
      const empty = document.createElement('span');
      empty.className = 'kb-muted';
      empty.textContent = STRINGS.viewEmpty;
      els.viewList.appendChild(empty);
    }
  };

  const getSelectedTemplateSource = () => {
    return document.querySelector('input[name="templateSource"]:checked')?.value || 'templateApp';
  };

  const setSelectedTemplateSource = (value) => {
    const target = document.querySelector(`input[name="templateSource"][value="${value}"]`);
    if (target) {
      target.checked = true;
    }
  };

  const getSelectedOutputMode = () => {
    return normalizeOutputMode(document.querySelector('input[name="outputMode"]:checked')?.value);
  };

  const setSelectedOutputMode = (value) => {
    const target = document.querySelector(`input[name="outputMode"][value="${normalizeOutputMode(value)}"]`);
    if (target) {
      target.checked = true;
    }
  };

  const syncOutputModeRows = () => {
    const isReport = getSelectedOutputMode() === 'report';
    document.querySelectorAll('[data-label-mode-row]').forEach((row) => {
      row.style.display = isReport ? 'none' : 'grid';
    });
    document.querySelectorAll('[data-report-row]').forEach((row) => {
      row.style.display = isReport ? 'grid' : 'none';
    });
    syncQuantityRows();
  };

  const syncSourceRows = () => {
    const source = getSelectedTemplateSource();
    document.querySelectorAll('[data-source-row]').forEach((row) => {
      row.style.display = row.getAttribute('data-source-row') === source ? 'grid' : 'none';
    });
  };

  const syncQuantityRows = () => {
    const display = getSelectedOutputMode() === 'label' && els.enableQuantitySplit.checked ? 'grid' : 'none';
    document.querySelectorAll('[data-quantity-row]').forEach((row) => {
      row.style.display = display;
    });
  };

  const syncQrRows = () => {
    const display = els.enableQrImage.checked ? 'grid' : 'none';
    document.querySelectorAll('[data-qr-row]').forEach((row) => {
      row.style.display = display;
    });
  };

  const syncPrintStatusRows = () => {
    const display = els.enablePrintStatusUpdate.checked ? 'grid' : 'none';
    document.querySelectorAll('[data-print-status-row]').forEach((row) => {
      row.style.display = display;
    });
  };

  const createOption = (value, text) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    return opt;
  };

  const fillFieldOptions = (select, selectedValue) => {
    populateSelect(select, mappableFields, selectedValue);
  };

  const fillBuiltInOptions = (select, selectedValue) => {
    select.innerHTML = '';
    createPlaceholderOption(select);
    BUILT_INS.forEach((item) => {
      const opt = createOption(item.value, item.label);
      opt.selected = item.value === selectedValue;
      select.appendChild(opt);
    });
  };

  const fillReportDetailFieldOptions = (select, selectedValue) => {
    select.innerHTML = '';
    createPlaceholderOption(select);
    const fields = subtableFieldMap[els.reportDetailTableField.value] || [];
    fields.forEach((field) => {
      const opt = createOption(field.code, `${field.label} (${field.code})`);
      opt.selected = field.code === selectedValue;
      select.appendChild(opt);
    });
  };

  const createLabeledControl = (labelText, control) => {
    const wrap = document.createElement('label');
    wrap.className = 'kb-map-control';
    const label = document.createElement('span');
    label.textContent = labelText;
    wrap.append(label, control);
    return wrap;
  };

  const renderMappingRow = (row = {}) => {
    const item = document.createElement('div');
    item.className = 'kb-mapping-row';

    const tagInput = document.createElement('input');
    tagInput.type = 'text';
    tagInput.className = 'kb-map-tag';
    tagInput.placeholder = 'partNumber';
    tagInput.value = row.tag || '';

    const sourceSelect = document.createElement('select');
    sourceSelect.className = 'kb-map-source';
    [
      ['field', STRINGS.sourceField],
      ['builtIn', STRINGS.sourceBuiltIn],
      ['static', STRINGS.sourceStatic]
    ].forEach(([value, text]) => sourceSelect.appendChild(createOption(value, text)));
    sourceSelect.value = row.sourceType || 'field';

    const fieldSelect = document.createElement('select');
    fieldSelect.className = 'kb-map-field';
    fillFieldOptions(fieldSelect, row.fieldCode || '');

    const builtInSelect = document.createElement('select');
    builtInSelect.className = 'kb-map-built-in';
    fillBuiltInOptions(builtInSelect, row.builtIn || '');

    const staticInput = document.createElement('input');
    staticInput.type = 'text';
    staticInput.className = 'kb-map-static';
    staticInput.value = row.staticValue || '';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'kb-btn kb-danger-lite';
    deleteBtn.textContent = STRINGS.deleteMappingRow;

    const sourceWrap = document.createElement('div');
    sourceWrap.className = 'kb-map-source-value';
    sourceWrap.append(
      createLabeledControl(STRINGS.mappingFieldValue, fieldSelect),
      createLabeledControl(STRINGS.mappingBuiltInValue, builtInSelect),
      createLabeledControl(STRINGS.mappingStaticValue, staticInput)
    );

    const sync = () => {
      fieldSelect.parentElement.style.display = sourceSelect.value === 'field' ? 'flex' : 'none';
      builtInSelect.parentElement.style.display = sourceSelect.value === 'builtIn' ? 'flex' : 'none';
      staticInput.parentElement.style.display = sourceSelect.value === 'static' ? 'flex' : 'none';
    };

    sourceSelect.addEventListener('change', sync);
    deleteBtn.addEventListener('click', () => item.remove());
    item.append(
      createLabeledControl(STRINGS.mappingTagName, tagInput),
      createLabeledControl(STRINGS.mappingSourceType, sourceSelect),
      sourceWrap,
      deleteBtn
    );
    els.mappingRows.appendChild(item);
    sync();
  };

  const renderReportDetailRow = (row = {}) => {
    const item = document.createElement('div');
    item.className = 'kb-mapping-row kb-detail-row';

    const columnInput = document.createElement('input');
    columnInput.type = 'text';
    columnInput.className = 'kb-report-detail-column';
    columnInput.placeholder = 'A';
    columnInput.value = row.column || '';

    const fieldSelect = document.createElement('select');
    fieldSelect.className = 'kb-report-detail-field';
    fillReportDetailFieldOptions(fieldSelect, row.fieldCode || '');

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'kb-btn kb-danger-lite';
    deleteBtn.textContent = STRINGS.deleteMappingRow;
    deleteBtn.addEventListener('click', () => item.remove());

    item.append(
      createLabeledControl(STRINGS.reportDetailColumnLabel, columnInput),
      createLabeledControl(STRINGS.reportDetailFieldLabel, fieldSelect),
      deleteBtn
    );
    els.reportDetailRows.appendChild(item);
  };

  const collectMappingRows = () => {
    return Array.from(els.mappingRows.querySelectorAll('.kb-mapping-row')).map((row) => ({
      tag: row.querySelector('.kb-map-tag').value.trim(),
      sourceType: row.querySelector('.kb-map-source').value,
      fieldCode: row.querySelector('.kb-map-field').value.trim(),
      staticValue: row.querySelector('.kb-map-static').value,
      builtIn: row.querySelector('.kb-map-built-in').value.trim()
    })).filter((row) => row.tag || row.fieldCode || row.staticValue || row.builtIn);
  };

  const collectReportDetailRows = () => {
    return Array.from(els.reportDetailRows.querySelectorAll('.kb-detail-row')).map((row) => ({
      column: row.querySelector('.kb-report-detail-column').value.trim().toUpperCase(),
      fieldCode: row.querySelector('.kb-report-detail-field').value.trim()
    })).filter((row) => row.column || row.fieldCode);
  };

  const refreshReportDetailFieldOptions = () => {
    Array.from(els.reportDetailRows.querySelectorAll('.kb-report-detail-field')).forEach((select) => {
      const selectedValue = select.value;
      fillReportDetailFieldOptions(select, selectedValue);
    });
  };

  const validateMappingRows = (rows) => {
    return rows.every((row) => {
      if (!row.tag) {
        return false;
      }
      if (row.sourceType === 'field') {
        return Boolean(row.fieldCode);
      }
      if (row.sourceType === 'builtIn') {
        return Boolean(row.builtIn);
      }
      return Boolean(row.staticValue);
    });
  };

  const validateReportDetailRows = (rows) => {
    return rows.every((row) => /^[A-Z]{1,3}$/.test(row.column) && Boolean(row.fieldCode));
  };

  const validateMappingJson = (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return true;
    }
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed);
  };

  const bindEvents = () => {
    document.querySelectorAll('input[name="templateSource"]').forEach((input) => {
      input.addEventListener('change', () => {
        syncSourceRows();
      });
    });
    document.querySelectorAll('input[name="outputMode"]').forEach((input) => {
      input.addEventListener('change', () => {
        syncOutputModeRows();
      });
    });
    els.enableQuantitySplit.addEventListener('change', () => {
      syncQuantityRows();
    });
    els.reportDetailTableField.addEventListener('change', () => {
      refreshReportDetailFieldOptions();
    });
    els.enableQrImage.addEventListener('change', () => {
      syncQrRows();
    });
    els.enablePrintStatusUpdate.addEventListener('change', () => {
      syncPrintStatusRows();
    });
    els.addMappingRow.addEventListener('click', () => renderMappingRow());
    els.addReportDetailRow.addEventListener('click', () => renderReportDetailRow());

    els.save.addEventListener('click', () => {
      showMessage('');
      const outputMode = getSelectedOutputMode();
      const templateSource = getSelectedTemplateSource();
      const templateFileField = templateSource === 'templateApp'
        ? (els.templateAppFileField.value?.trim() ?? '')
        : (els.recordFileField.value?.trim() ?? '');
      const templateUrl = els.templateUrl.value?.trim() ?? '';
      const templateAppId = els.templateAppId.value?.trim() ?? '';
      const templateCode = els.templateCode.value?.trim() ?? '';
      const mappingJson = els.mappingJson.value?.trim() ?? '';
      const mappingRows = collectMappingRows();
      const reportDetailRows = collectReportDetailRows();

      if (templateSource === 'recordFile' && !templateFileField) {
        showMessage(STRINGS.messageRequiredAttachment);
        return;
      }
      if (templateSource === 'fixedUrl' && !templateUrl) {
        showMessage(STRINGS.messageRequiredUrl);
        return;
      }
      if (templateSource === 'templateApp' && !templateAppId) {
        showMessage(STRINGS.messageRequiredTemplateAppId);
        return;
      }
      if (templateSource === 'templateApp' && !templateCode) {
        showMessage(STRINGS.messageRequiredTemplateCode);
        return;
      }
      if (templateSource === 'templateApp' && !templateFileField) {
        showMessage(STRINGS.messageRequiredTemplateFileField);
        return;
      }
      if (outputMode === 'label' && els.enableQuantitySplit.checked && (!els.quantityField.value || !els.packQtyField.value)) {
        showMessage(STRINGS.messageRequiredSplitFields);
        return;
      }
      if (outputMode === 'report' && (!els.reportDetailTableField.value || !els.reportDetailStartRow.value || !els.reportRowsPerPage.value)) {
        showMessage(STRINGS.messageRequiredReportSettings);
        return;
      }
      if (outputMode === 'report' && (!reportDetailRows.length || !validateReportDetailRows(reportDetailRows))) {
        showMessage(STRINGS.messageInvalidReportDetailRows);
        return;
      }
      if (!validateMappingRows(mappingRows)) {
        showMessage(STRINGS.messageInvalidMappingRows);
        return;
      }
      try {
        if (!validateMappingJson(mappingJson)) {
          showMessage(STRINGS.messageInvalidMapping);
          return;
        }
      } catch {
        showMessage(STRINGS.messageInvalidMapping);
        return;
      }

      const selectedViews = Array.from(els.viewList.querySelectorAll('input[type="checkbox"]'))
        .filter((input) => input.checked)
        .map((input) => input.value);

      kintone.plugin.app.setConfig({
        outputMode,
        templateSource,
        templateFileField,
        templateUrl,
        templateAppId,
        templateCodeField: els.templateCodeField.value?.trim() || 'templateCode',
        templateCode,
        templateStatusField: els.templateStatusField.value?.trim() || 'status',
        templateActiveValue: els.templateActiveValue.value?.trim() || 'ACTIVE',
        reportDetailTableField: els.reportDetailTableField.value?.trim() ?? '',
        reportDetailStartRow: els.reportDetailStartRow.value?.trim() || '15',
        reportRowsPerPage: els.reportRowsPerPage.value?.trim() || '20',
        reportHideEmptyRows: els.reportHideEmptyRows.checked ? 'true' : 'false',
        reportDetailRows: reportDetailRows.length ? JSON.stringify(reportDetailRows) : '',
        enableQuantitySplit: els.enableQuantitySplit.checked ? 'true' : 'false',
        quantityField: els.quantityField.value?.trim() ?? '',
        packQtyField: els.packQtyField.value?.trim() ?? '',
        outputQtyTag: els.outputQtyTag.value?.trim() || 'labelQty',
        enableQrImage: els.enableQrImage.checked ? 'true' : 'false',
        qrPadding: els.qrPadding.value?.trim() || '4',
        enablePrintStatusUpdate: els.enablePrintStatusUpdate.checked ? 'true' : 'false',
        printStatusFieldCode: els.printStatusFieldCode.value?.trim() ?? '',
        printedStatusValue: els.printedStatusValue.value?.trim() || 'PRINTED',
        reprintedStatusValue: els.reprintedStatusValue.value?.trim() || 'REPRINTED',
        printedAtFieldCode: els.printedAtFieldCode.value?.trim() ?? '',
        printedByFieldCode: els.printedByFieldCode.value?.trim() ?? '',
        mappingRows: mappingRows.length ? JSON.stringify(mappingRows) : '',
        mappingJson,
        outputFileName: els.outputFileName.value?.trim() ?? '',
        maxSheetsPerWorkbook: els.maxSheetsPerWorkbook.value?.trim() || '100',
        buttonLabel: els.buttonLabel.value?.trim() ?? '',
        columnWidthScale: percentToScale(els.columnWidthScale.value),
        rowHeightScale: percentToScale(els.rowHeightScale.value),
        viewIds: selectedViews.length ? JSON.stringify(selectedViews) : ''
      }, () => {
        showToast({
          type: 'success',
          message: `${STRINGS.messageSaved}\n${STRINGS.messageUpdateApp}`,
          duration: 2200
        });
        window.setTimeout(redirectToAppSettings, 1200);
      });
    });

    els.cancel.addEventListener('click', () => {
      window.history.back();
    });
  };

  onReady(async () => {
    setTextContent();
    const config = loadConfig();
    setSelectedOutputMode(config.outputMode);
    setSelectedTemplateSource(config.templateSource);
    els.templateUrl.value = config.templateUrl;
    els.templateAppId.value = config.templateAppId;
    els.templateCodeField.value = config.templateCodeField;
    els.templateAppFileField.value = config.templateSource === 'templateApp'
      ? (config.templateFileField || 'templateFile')
      : 'templateFile';
    els.templateCode.value = config.templateCode;
    els.templateStatusField.value = config.templateStatusField;
    els.templateActiveValue.value = config.templateActiveValue;
    els.reportDetailStartRow.value = config.reportDetailStartRow;
    els.reportRowsPerPage.value = config.reportRowsPerPage;
    els.reportHideEmptyRows.checked = config.reportHideEmptyRows;
    els.enableQuantitySplit.checked = config.enableQuantitySplit;
    els.outputQtyTag.value = config.outputQtyTag;
    els.enableQrImage.checked = config.enableQrImage;
    els.qrPadding.value = config.qrPadding;
    els.enablePrintStatusUpdate.checked = config.enablePrintStatusUpdate;
    els.printStatusFieldCode.value = config.printStatusFieldCode;
    els.printedStatusValue.value = config.printedStatusValue;
    els.reprintedStatusValue.value = config.reprintedStatusValue;
    els.printedAtFieldCode.value = config.printedAtFieldCode;
    els.printedByFieldCode.value = config.printedByFieldCode;
    els.mappingJson.value = config.mappingJson;
    els.outputFileName.value = config.outputFileName;
    els.maxSheetsPerWorkbook.value = config.maxSheetsPerWorkbook;
    els.buttonLabel.value = config.buttonLabel;
    els.columnWidthScale.value = scaleToPercent(config.columnWidthScale);
    els.rowHeightScale.value = scaleToPercent(config.rowHeightScale);

    try {
      const [fieldsResult, views] = await Promise.all([
        fetchFields(),
        fetchViews()
      ]);
      const { allFields, fileFields } = fieldsResult;
      mappableFields = allFields;
      subtableFields = fieldsResult.subtableFields;
      subtableFieldMap = fieldsResult.subtableFieldMap;
      populateSelect(els.recordFileField, fileFields, config.templateFileField);
      populateSelect(els.reportDetailTableField, subtableFields, config.reportDetailTableField);
      populateSelect(els.quantityField, allFields, config.quantityField);
      populateSelect(els.packQtyField, allFields, config.packQtyField);
      populateSelect(els.printStatusFieldCode, allFields, config.printStatusFieldCode);
      populateSelect(els.printedAtFieldCode, allFields, config.printedAtFieldCode);
      populateSelect(els.printedByFieldCode, allFields, config.printedByFieldCode);
      renderViewList(views, config.viewIds);
      config.mappingRows.forEach((row) => renderMappingRow(row));
      config.reportDetailRows.forEach((row) => renderReportDetailRow(row));
      syncSourceRows();
      syncOutputModeRows();
      syncQuantityRows();
      syncQrRows();
      syncPrintStatusRows();
      bindEvents();
    } catch (err) {
      console.error(err);
      showMessage(STRINGS.apiError);
      els.save.disabled = true;
    }
  });
})();
