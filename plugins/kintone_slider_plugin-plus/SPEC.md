# 一覧日付スライダー / Index Date Range Slider

- **バージョン / Version**: 1.0.19
- **種別 / Type**: APP plugin

## 概要 / Overview
一覧ビューに「日付レンジ・スライダー」とプリセットボタンを追加し、指定した **DATE/DATETIME** フィールドで動的に絞り込みます。テーマ（配色）はトークン化された `.kb-root` の CSS 変数で切替可能。

---

## 主な機能 / Features
- 一覧ヘッダーに**2ハンドルのレンジスライダー**を表示（アクティブ帯付き、ドラッグで期間変更）
- **プリセット**：今日 / 直近7日 / 直近30日 / 今月 / 今年 / 全期間（英語環境では英表示）
- **アクションボタン**（ツールバー内）
  - **適用 / Apply**：フォームにセットされた日付範囲で一覧を絞り込み
  - **解除 / Reset**：既定の期間（設定で指定）に戻す
  - **テーマ / Theme**：設定値に基づくテーマを `.kb-root` に即時反映（light / mono-blue / mint / soft-dark / pale）
- **日付入力**（from/to）とスライダーが相互連動
- **最小/最大日の自動初期化**（安全な範囲でデータから推定、取得不可時はプリセットで代替）
- 言語はログインユーザーの設定に追従（ja/en）

---

## 設定項目 / Settings
> 保存キー名と既定値を明記（kintone.plugin.app.setConfig / getConfig）

| UIラベル | 説明 | 保存キー | 型 / 例 | 既定値 |
|---|---|---|---|---|
| 日付フィールド / Date field | 絞り込み対象の **DATE/DATETIME** フィールド | `dateField` | `string`（フィールドコード） | **必須**（未選択不可） |
| 週の開始 / Week start | 曜日の並び・一部プリセット計算に使用 | `weekStart` | `string`（`0`=日 … `6`=土） | `"0"` |
| 既定の範囲 / Default range | Reset時・初期表示で用いる期間プリセット | `defaultPreset` | `string`（`today` / `last-7` / `last-30` / `this-month` / `this-year` / `all`） | `"this-month"` |
| テーマ / Theme | `.kb-root[data-kb-theme]` に適用 | `theme` | `string`（`light` / `mono-blue` / `mint` / `soft-dark` / `pale`） | `"light"` |

- 設定画面ではテーマ変更が**即時に保存ボタンへ反映**（`.kb-btn.kb-primary` の配色）

---

## 動作イベント / Kintone events
- **一覧ビュー**（本体）：`app.record.index.show`
- **設定画面**：`app.plugin.config.show`（DOMContentLoaded フォールバック併用・冪等化）

---

## 使用ファイル構成 / Files
plugin-template/
├─ manifest.json
├─ package.json
├─ esbuild.config.mjs
├─ dist/
│ └─ js/
│ └─ plugin.js # ビルド出力（エントリ：src/js/plugin.js）
└─ src/
├─ js/
│ ├─ plugin.js # 本体（一覧UI・絞り込み）
│ └─ config.js # 設定ページ（テーマ即時反映・プレビュー含む）
├─ css/
│ ├─ base.css # ベース（必要最低限）
│ ├─ plugin.css # ★.kb-root テーマトークン & プリミティブ
│ └─ config.css # 設定UI（プレビュー用スライダー含む）
├─ html/
│ └─ config.html # 本文のみ（ヘッダー/スクリプト記述なし）
└─ images/
└─ icon_128.png # 128px / 透過

pgsql
コピーする
編集する

### manifest.json（要件）
```json
{
  "desktop": {
    "js": ["dist/js/plugin.js"],
    "css": ["src/css/base.css", "src/css/plugin.css"]
  },
  "config": {
    "html": "src/html/config.html",
    "js": ["src/js/config.js"],
    "css": ["src/css/config.css"]
  }
}
実装メモ / Implementation notes
ES2019, 外部ライブラリなし。eval / new Function / 文字列 setTimeout 禁止

optional chaining / nullish coalescing を未使用（旧Edge/互換モード対策）

UI はすべて .kb-root 配下、色は var(--kb-*) の CSS 変数のみを使用

テーマは kbSetTheme(root, theme) で適用（設定画面・一覧双方）

レコード更新は行わない。必要な API 更新時は kintone.api + revision を送る

例外は console.error へ記録し、利用者には簡易トーストで通知

多言語・端末対応 / i18n & mobile
言語：ログインユーザーの言語（ja/en）に追従。ラベルは日英併記または切替

モバイル：本バージョンは PC 一覧での利用を前提。スマホ版の最適化は将来対応（未対応である旨をここに明記）

既知の制限・注意事項 / Known limitations
DATE/DATETIME フィールドが必須（未選択・未配置のアプリでは機能しません）

データ量が極端に多いアプリでは、初期の最小/最大日の推定が遅延する場合があります（取得失敗時はプリセットで代替）

ブラウザ拡張（例：Edge Copilot など）のコンソール警告はプラグイン動作に無関係

スライダー表示はブラウザ実装差により若干の見た目差があります（機能には影響なし）