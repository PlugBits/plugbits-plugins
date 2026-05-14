# New product Issue 下書き

`README.md` と `.github/ISSUE_TEMPLATE/new_product.yml` の項目に合わせた転記用ドラフトです。

## 基本情報

### slug (英数字とハイフン)

`listkit`

### 種別

`plugin`

### 公開ステータス

`public`

### PAGE_URL（拡張機能のみ）

``

### INSTALL_URL

`TBD`

### Brevo Form ID

`TBD`

### HERO_IMAGE（相対パス）

`assets/listkit/hero.webp`

### FILE_SIZE

`TBD`

### UPDATED_AT

`2026-04`

## 日本語コンテンツ

### TITLE_JA

`PlugBits ListKit`

### SHORT_SUMMARY_JA（カード表示用・64文字以内）

一覧のタブ切替・日付絞り込み・集計表示をまとめて追加します

### SUMMARY_JA（詳細ページ用・160文字程度）

kintone の一覧画面にビュータブ、日付フィルター、集計表示を追加するプラグインです。よく使う一覧への移動、期間での絞り込み、件数や数値の確認を一覧上部に集約し、日々の操作効率を高めます。

### CATEGORY_JA

`UI改善`

### TAGS_JA（カンマ区切り）

一覧, タブ, 日付フィルター, 集計, 業務改善

### SUPPORTED_SCREENS_JA

`PC / 一覧`

### FEATURES_JA（セミコロン区切り）

一覧上部にビュー切替タブを表示;表示するビューと順番を設定可能;日付・日時フィールドを期間プリセットで絞り込み;今週・今月・四半期・半期・年単位のプリセットに対応;数値フィールドと計算フィールドの集計を表示;合計・平均・最小・最大・件数に対応;ビューごとに日付フィルターと集計の表示対象を制御可能;接頭文字・接尾文字・小数桁を設定可能

### LIMITATIONS_JA（セミコロン区切り）

PC版一覧画面向け;日付フィルターには日付または日時フィールドが必要;集計には数値または計算フィールドが必要;レコード件数や集計対象が多い場合は表示に時間がかかることがある

### STEPS_JA（1行ずつ「番号|見出し|本文」）

```text
1|プラグインをインストール|kintone 管理画面からプラグインをアップロードして追加します
2|設定を開く|対象アプリのプラグイン設定で PlugBits ListKit を開きます
3|ビュータブを設定|表示するビュー、順番、横並びタブ数、アイコン表示を設定します
4|日付フィルターと集計を設定|対象日付フィールド、プリセット、対象ビュー、集計ルールを設定します
5|完了|保存後にアプリを更新すると、一覧上部にタブ・日付フィルター・集計が表示されます
```

### FAQ_JA（1行ずつ「質問|回答」）

```text
日付フィルターが表示されません|プラグイン設定で日付フィルターが有効か、対象ビューに含まれているか、日付または日時フィールドが設定されているかを確認してください
集計が表示されません|集計が有効か、集計ルールが1件以上あるか、数値または計算フィールドを選んでいるかを確認してください
タブが多すぎて見切れます|横並びタブ数を超えた分は「その他」に入ります。設定画面で表示順や横並びタブ数を調整してください
設定を変えたのに反映されません|保存後にアプリを更新しているか確認してください
```

## English content

### TITLE_EN

`PlugBits ListKit`

### SHORT_SUMMARY_EN (for card display, under 64 chars)

Adds view tabs, date filters, and aggregates to kintone list views

### SUMMARY_EN (for detail page)

A kintone plugin that adds view tabs, date filters, and aggregate summaries to list views. It helps users switch views faster, filter by period with one click, and check counts or key numbers directly from the list header.

### CATEGORY_EN

`UI Enhancement`

### TAGS_EN (comma-separated)

list, tabs, date filter, aggregate, productivity

### SUPPORTED_SCREENS_EN

`PC / List`

### FEATURES_EN (semicolon-separated)

Show view-switching tabs in the list header;Choose which views to show and in what order;Filter date or datetime fields with quick presets;Supports week, month, quarter, half-year, and year presets;Display aggregates for number and calculation fields;Supports sum, average, minimum, maximum, and count;Limit date filters and aggregates by view;Customize prefixes, suffixes, and decimal digits

### LIMITATIONS_EN (semicolon-separated)

Designed for PC list view;Date filter requires a date or datetime field;Aggregates require number or calculation fields;Large datasets or many aggregate rules may slow rendering

### STEPS_EN (one per line "No|Heading|Body")

```text
1|Install the plugin|Upload and add the plugin from the kintone admin panel
2|Open settings|Open PlugBits ListKit from the app's plugin settings
3|Configure view tabs|Choose visible views, order, inline tab count, and icon display
4|Configure date filter and aggregates|Set the target date field, presets, target views, and aggregate rules
5|Done|Save the settings and update the app to show tabs, date filters, and aggregates in the list header
```

### FAQ_EN (one per line "Question|Answer")

```text
Why is the date filter not shown?|Check whether the date filter is enabled, included for the current view, and configured with a date or datetime field.
Why are aggregates not shown?|Check whether aggregates are enabled, at least one aggregate rule exists, and the selected field is numeric or calculated.
There are too many tabs to fit.|Tabs over the inline limit are grouped under "Other". Adjust the display order or inline count in the settings.
Why do my setting changes not appear?|Make sure you saved the plugin settings and updated the app.
```

## メモ

- `slug` は製品名ベースで `listkit` を仮置きしています。命名規則があれば合わせて変更してください。
- `INSTALL_URL` `Brevo Form ID` `HERO_IMAGE` `FILE_SIZE` はこのリポジトリだけでは確定できないため仮値です。
