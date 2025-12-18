# kintone用 Excel JOIN プラグイン仕様書（Codex用プロンプト）
PlugBits – Excel Master Joiner Plugin

（※ これはCodex実装用の完全仕様書です）

## 目的
ユーザーが kintone 上から Excel/CSV をアップロードし、  
kintone マスターとJOINして、JOIN済みExcelをダウンロードできるプラグインを実装する。

## 機能概要
- 一覧画面にボタン［Excel JOINツール］追加
- プラグイン画面で：
  1. Excel/CSVアップロード
  2. シート選択
  3. キー列選択
  4. マスター選択
  5. JOIN実行 → Excelダウンロード
- JOINはブラウザ内のみで完結（kintoneにデータ登録しない）

## 技術方針
- 100%フロント（HTML/CSS/JS）
- 使用ライブラリ：SheetJS, FileSaver.js
- kintone REST API：kintone.api()
- プラグインzipで配布

## 構成案
manifest.json  
plugin.js  
config.html / config.js  
excel-join.html / excel-join.js  
kintoneClient.js  
excelUtil.js  
storage.js  
style.css  
icons/

## 設定画面仕様
設定画面で「マスター定義」を複数登録できる。

保存形式例：
```json
{
  "masters": [
    {
      "id": "customerMaster",
      "name": "得意先マスター",
      "appId": "123",
      "keyFieldCode": "customer_code",
      "mappings": [
        { "kintoneFieldCode": "customer_name", "excelHeaderName": "得意先名" },
        { "kintoneFieldCode": "sales_rep",    "excelHeaderName": "担当営業" }
      ]
    }
  ]
}
```

UI要素：
- マスター一覧
- 追加/編集モーダル
- マッピング追加/削除
- 保存→setConfig()

## 一覧画面ボタン（plugin.js）
- event: app.record.index.show
- ［Excel JOINツール］を表示
- click → excel-join.html を window.open()

## JOINツール画面（excel-join.html/js）
UI:
1. ファイル選択（input/Drag&Drop）
2. シート選択（Excel）
3. キー列選択（ヘッダ読み込み）
4. マスター選択（mappings表示）
5. JOIN実行→Excelダウンロード

## JOINロジック（excelUtil.js）
1. ファイル読み込み（ArrayBuffer）
2. SheetJSでワークブック解析
3. シート → JSON配列へ
4. kintone APIでマスター取得（ページング対応）
5. Map<キー, レコード> でマスター化
6. JSON配列行ごとにJOIN
7. SheetJSで新Workbook作成
8. FileSaverでダウンロード

擬似コード：
```js
rows.forEach(row => {
  const key = row[keyColumn];
  const m = masterMap.get(key);
  if (m) {
    mappings.forEach(mp => {
      row[mp.excelHeaderName] = m[mp.kintoneFieldCode].value;
    });
  }
});
```

## エラー処理
- ファイル未選択
- キー未選択
- マスター未選択
- kintone APIエラー
- Excel解析エラー

## 最終成果物
- プラグインzipとして動作するコード一式
- manifest.json / plugin.js / config画面 / excel-join画面 / util群

この仕様でCodexに実装を指示してください。
