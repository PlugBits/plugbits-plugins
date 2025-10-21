# プラグイン仕様書（テンプレート）

## 1. プラグイン名
- 日本語名: `<日本語名をここに記入>`
- 英語名: `<English Name>`

## 2. バージョン
- `0.0.1`

## 3. 概要
このプラグインは `<概要を1〜3行で記載>`。

## 4. 主な機能
- 機能1: `<説明>`
- 機能2: `<説明>`
- 機能3: `<説明>`

## 5. 設定項目
| 設定名 | 説明 | 保存キー | 初期値 |
| ------ | ---- | -------- | ------ |
| 設定1  | `<UIでの意味や用途>` | `configKey1` | `<default>` |
| 設定2  | `<UIでの意味や用途>` | `configKey2` | `<default>` |

※ 設定不要型の場合は「設定画面なし（固定動作）」と明記。

## 6. 動作イベント
- `app.record.detail.show` : 詳細画面表示時に実行
- `app.record.index.show` : 一覧画面表示時に実行
- `app.record.create.show` : レコード作成画面で実行
- `app.record.edit.show` : レコード編集画面で実行

## 7. 使用ファイル構成
plugin-template/
├─ manifest.json
├─ package.json
├─ esbuild.config.mjs
├─ src/
│ ├─ js/
│ │ ├─ plugin.js # 実行処理
│ │ └─ config.js # 設定画面処理
│ ├─ css/
│ │ ├─ base.css # 実行時CSS
│ │ └─ kp-config.css # 設定画面CSS
│ ├─ html/
│ │ └─ config.html # 設定画面本文
│ └─ images/
│ ├─ icon-128.png
│ └─ icon-16.png
└─ dist/ # ビルド出力

## 8. 既知の制限・注意事項
- `<例> モバイル端末では動作しません`
- `<例> フィールドコードが変更されると動作しなくなります`
