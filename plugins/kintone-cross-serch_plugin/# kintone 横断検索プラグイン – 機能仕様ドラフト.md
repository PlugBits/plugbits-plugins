````markdown
# kintone Cross Search プラグイン v2 仕様（Codex向け指示書）

## ゴール

現状の Cross Search プラグインは、  
**全アプリの「検索対象フィールド」に対して一律 `like` 句を投げる設計** のため、

- Lookup フィールド (`Customer` など) に対して `like` を投げて GAIA_IQ10 が出る
- Lookup を検索対象から外すと、**標準の全文検索と大差ない挙動になる**

→ これをやめて、

> **「マスタアプリを起点に検索 → その結果をキーにして関連アプリを検索」**  
> という構成に方向転換する。

これにより：

- Lookup に無理やり `like` を投げずに済む
- Customer / 品番など **マスタに紐づく全レコードを横断して見られる**
- 標準の検索窓とは明確に違う価値が出る

---

## 新コンセプト（v2）

### 1. 概要

**v1**：  
- 各アプリの「検索対象フィールド」に対して  
  `field like "K3012-"` を投げる横断検索

**v2**（目指す形）：  
1. 検索キーワードを **マスタアプリ**（顧客マスタ・品番マスタ など）に対して `like` 検索  
2. ヒットしたマスタレコードから **キー（顧客コード / 品番コード）** を取得  
3. そのキーを元に、各業務アプリを  
   `lookup_field in ("KEY1", "KEY2", ...)` で検索  
4. 結果を「マスタ単位」あるいは「アプリ単位」のタブで一覧表示

---

## 2. 設定イメージ（できるだけシンプルに）

### 2.1 プラグイン設定画面：必要最小限の情報だけ

**A. マスタアプリ定義（1〜複数）**

各マスタについて以下を設定：

- `masterAppId`: マスタアプリID
- `masterKeyFieldCode`: 業務アプリの Lookup が参照する「キーとなるフィールドコード」  
  例：`customer_code`, `part_no` など
- `masterLabelFields`: ユーザーに見せたい表示用フィールド（任意で 1〜2 個）
  - 例：`customer_name`, `part_name`

> ※ 検索対象フィールド（どこに like するか）は、  
> 　`masterKeyFieldCode` と `masterLabelFields` を **自動利用** してよい。

---

**B. 子アプリ（業務アプリ）定義**

各業務アプリごとに以下を設定：

- `childAppId`: アプリID
- `lookupFieldCode`:  
  このアプリ側で **マスタを参照している Lookup フィールドのコード**  
  （例：`Customer`, `Part`, …）
- `displayFields`: 一覧に表示するフィールドコード配列（省略可）
  - 省略時は、フォーム定義から「1行文字列」を自動選択してよい

---

### 2.2 設定 JSON の例（イメージ）

```json
{
  "masters": [
    {
      "masterAppId": 101,
      "masterKeyFieldCode": "customer_code",
      "masterLabelFields": ["customer_name"]
    }
  ],
  "children": [
    {
      "childAppId": 54,
      "lookupFieldCode": "Customer",
      "displayFields": ["品番", "工程", "担当者", "ステータス", "更新日時"]
    },
    {
      "childAppId": 200,
      "lookupFieldCode": "Customer",
      "displayFields": ["案件名", "金額", "ステータス"]
    }
  ]
}
````

※ 実装では、既存の設定保存ロジックに合わせて構造を調整してよい。

---

## 3. 新しい検索フロー（重要）

`index.js` / `plugin.js` 側の検索処理を、以下のフローに差し替える。

### 3.1 フロー全体

1. ユーザーが検索キーワードを入力して「検索」クリック
2. まず **マスタアプリ群**（`masters[]`）に対して検索
3. ヒットしたマスタレコードから **キー値リスト** を作成
4. キーリストが空なら「該当なし」で終了
5. キーリストを使って **子アプリ群**（`children[]`）を検索
6. 結果をまとめて UI に表示

---

### 3.2 マスタ検索の詳細

#### クエリ生成（マスタ用）

マスタごとに以下のようなクエリを組む：

* キーワードを `kw` とする
* 検索対象フィールド：

  * `masterKeyFieldCode`
  * `masterLabelFields`（1〜複数）

クエリ例（1語のみの場合）：

```text
masterKeyFieldCode like "kw" or customer_name like "kw"
```

複数語対応が必要なら、シンプルに AND 連結でよい：

```text
( masterKeyFieldCode like "K3012" or customer_name like "K3012" )
and ( masterKeyFieldCode like "SHAFT" or customer_name like "SHAFT" )
```

実装は既存の `buildKeywordClause` を流用 or 簡略版を新規実装してよい。

#### マスタ結果の保持

* マスタ検索の結果は、内部的に以下の構造に保持：

```ts
type MasterHit = {
  masterAppId: number;
  recordId: string;      // レコード番号
  key: string;           // masterKeyFieldCode の値
  labels: string[];      // masterLabelFields から取った表示用文字列
};
```

* 全マスタの結果を配列 `masterHits: MasterHit[]` として保持
* また、子アプリ検索に使うために、
  `key` の配列（ユニーク）を作る：

```js
const masterKeys = Array.from(new Set(masterHits.map(hit => hit.key))).filter(Boolean);
```

`masterKeys` が空なら、**以降の子アプリ検索は行わない**。

---

### 3.3 子アプリ検索の詳細

#### クエリ生成（子アプリ用）

各子アプリについて：

* `lookupFieldCode` に対して `in` クエリを使う
* 例えば `masterKeys = ["C0001", "C0002"]` の場合：

```text
Customer in ("C0001","C0002")
```

※ キー数が多い場合（>100など）は注意が必要だが、
　初期実装では「最大キー数を制限（例：50件まで）」でもよい。

#### 取得フィールド

* `displayFields` が指定されている場合：

  * `fields` パラメータに指定
* 指定されていない場合：

  * `lookupFieldCode` と、1行文字列を2〜3個自動選択してもよい

---

### 3.4 表示形式

**左ペイン：マスタ一覧**

* `masterHits` をマスタ単位で表示：

  * 行あたり：

    * `key`（例：顧客コード / 品番）
    * `labels[0]`（例：顧客名）
  * クリックすると、そのキーに紐づく子アプリ結果を右側に表示

**右ペイン：子アプリ結果**

* タブ形式：

  ```
  [Rework Log (10)] [Final Inspection (3)] [Production Plan (5)]
  ```

* タブ内はテーブル表示：

  * 列：`displayFields` で指定されたフィールド
  * 行クリックで kintone の詳細画面を新規タブで開く

**マスタが1件しかヒットしない場合**：

* 左ペインを省略して、子アプリ結果だけ出してもよい。

---

## 4. 既存コードからの変更ポイント

### 4.1 「全フィールドに like」をやめる

現状のロジック（例）：

```js
var keywordClause = buildKeywordClause(keyword, app.searchFields);
// ...
query = keywordClause; // + other conditions
```

これは **完全に破棄 or 未使用化** して OK。
代わりに以下の二段構えにする。

1. マスタ検索用の `buildMasterQuery(keyword, master)` を実装
2. 子アプリ検索用の `buildChildQuery(masterKeys, child)` を実装

---

### 4.2 設定データ構造の変更

* 現在の `appConfigs` が「各アプリに対する検索対象フィールド」などを持っていた場合、
  それを以下の2グループに整理：

```ts
type MasterConfig = {
  masterAppId: number;
  masterKeyFieldCode: string;
  masterLabelFields: string[];
};

type ChildConfig = {
  childAppId: number;
  lookupFieldCode: string;
  displayFields?: string[];
};

type PluginConfig = {
  masters: MasterConfig[];
  children: ChildConfig[];
};
```

※ 既存の設定 UI を流用するか、新しいUIを実装してもよい。

---

### 4.3 検索UIは現状をベースにしてOK

* 既存の「検索キーワード入力＋検索ボタン」UIをそのまま流用
* 検索結果の描画部分だけ、

  * 左にマスタ
  * 右に子アプリ
    に分ける

---

## 5. エラー処理と境界条件

* マスタ検索の結果が 0 件の場合：

  * 「該当する顧客/品番がありません」とメッセージを表示
  * 子アプリ検索は行わない
* マスタはヒットするが、子アプリは 0 件の場合：

  * 「関連するレコードはありません」とタブ内に表示
* RESTエラー時：

  * エラー内容を画面上部にバナー表示（`code`, `message`）

---

## 6. MVP の完了条件

v2 として「実用になる最小構成」は以下：

1. 設定画面で：

   * 1つのマスタアプリ
   * 1〜3個の子アプリ
     を設定できる（`masterAppId`, `masterKeyFieldCode`, `lookupFieldCode`）

2. 検索キーワードを入れて検索すると：

   * マスタから like 検索で候補が出る
   * そのキーで子アプリの Lookup に対して `in` 検索がかかる
   * 結果が「マスタ × 子アプリ」構造で表示される

3. Lookup フィールドへの `like` クエリは一切投げない
   → GAIA_IQ10 を出さない

4. マスタが1件だけ見つかった場合でも問題なく動く

ここまで実装できれば、
**「標準検索との差別化が明確で、Customer/品番マスタを軸にした実用的な横断ビュー」**
として成り立つ。

---

```
::contentReference[oaicite:0]{index=0}
```
