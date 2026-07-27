# bulk-reindex.js — サーバ主導の一括再インデックス

kintone に登録済みの図面を、ブラウザ（kintoneプラグイン）を使わずに CLI から
drawing-similarity API の `/index` へ一括で（再）登録するツール。

想定用途:

1. **EMBED_IMAGE_MODE の A/B実験**（`auto_roi` vs `full`）— 実験用の別デプロイ・別Qdrant
   コレクションへ全量登録し、`eval/eval.js` で現行と数字を比較する（下記「A/B実験の手順」参照）
2. 将来の加工方法フィールド反映など、任意タイミングでの再インデックス

一晩で完走できること・途中で落ちても再開できることを前提に設計している:

- 進捗は JSONL（`--progress`。既定 `scripts/bulk-reindex-progress.jsonl`）に1行ずつ追記する。
  プロセスが落ちても直前までの結果は残る
- 再実行すると、進捗ファイルを読んで **成功済み・添付なしのレコードは自動スキップ**し、
  失敗したレコードだけ再試行する

依存パッケージの追加は一切ない（Node.js コア機能のみ。ESM）。純粋ロジックは
`bulk-reindex-lib.js` に分離してあり、`test/bulk-reindex.test.mjs` でユニットテストする。

```sh
node --test test/bulk-reindex.test.mjs
```

## 使い方

```sh
KINTONE_BASE_URL=https://your-subdomain.cybozu.com \
KINTONE_API_TOKEN=xxxxxxxx \
TARGET_API_BASE_URL=https://drawing-similarity-api-exp-xxxxx.asia-northeast1.run.app \
node scripts/bulk-reindex.js --app 123 --field-map ./field-map.json
```

### 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `KINTONE_BASE_URL` | ○ | kintone サブドメインのベースURL |
| `KINTONE_API_TOKEN` | ○ | kintone REST APIトークン（レコード一覧取得・ファイル取得の両方に使う権限が必要） |
| `TARGET_API_BASE_URL` | ○ | 登録先の drawing-similarity API のベースURL（実験用デプロイ等を指す） |
| `API_KEY` | - | 登録先APIの `X-API-Key`（テナント認証が有効な場合のみ必要） |
| `TENANT_ID` | - | テナントID（既定 `default`） |
| `THUMB_KEY` | - | 暗号化サムネイル鍵。kintoneプラグイン設定の「サムネイル高速化」で使っている base64 文字列と同じもの。指定すると `/index` に `thumbKey` として同梱し、暗号化サムネイルも生成させる。未指定ならサムネイルなしで登録される |

`KINTONE_API_TOKEN` は API を直接叩く（プラグイン経由ではない）ため、対象アプリの
「アプリの管理」→「APIトークン」で **レコード閲覧・ファイル読み込み** 権限を持つトークンを使うこと。

### CLI引数

| 引数 | 必須 | 説明 |
|---|---|---|
| `--app <appId>` | ○ | kintone アプリID |
| `--field-map <path>` | ○ | フィールドコードのマッピングJSON（後述） |
| `--concurrency <N>` | - | 並行実行数（既定 3）。kintoneファイル取得と登録先APIへの送信の両方を含む、API呼び出し全体としての上限 |
| `--limit <N>` | - | 先頭N件のみ処理（スモークテスト用） |
| `--records <id,id,...>` | - | 指定レコードのみ処理 |
| `--progress <path>` | - | 進捗ファイルのパス（既定 `scripts/bulk-reindex-progress.jsonl`） |
| `--dry-run` | - | 取得と対象一覧表示のみ。`/index` は一切呼ばない |
| `--force` | - | 進捗ファイルを無視して全件処理する（成功済みも再送信） |

### field-map JSON の書き方

kintone-drawing-similarity プラグインの設定画面と同じキー名を使う（プラグイン設定を
そのままコピーして流用できる）。**`pdfFileField` のみ必須**、他は未指定でも動く
（未指定のフィールドは空文字として送られ、server.js 側は空文字を「未指定」として扱い、
OCR抽出結果にフォールバックする）。

```json
{
  "drawingNoField": "drawing_no",
  "productNameField": "product_name",
  "materialField": "material",
  "dimensionField": "dimension",
  "processField": "process_methods",
  "tagField": "tags",
  "shapeTagField": "shape_tags",
  "pdfFileField": "attachment"
}
```

`shapeTagField` は field-map のキーとしては受け付けるが、**`/index` へのメタデータには
含めない**（下記「thumbKey・メタデータの対応」参照）。プラグイン設定と1対1のキー構成に
しておくための項目で、実際に AI 形状タグへ反映されるのは登録時に毎回やり直す OCR の
Gemini/Vertex 抽出結果のみ。

### 動作確認（スモークテスト）

まず `--dry-run` で対象件数・添付なし件数を確認し、次に `--limit 10` で少数だけ実登録する。

```sh
node scripts/bulk-reindex.js --app 123 --field-map ./field-map.json --dry-run
node scripts/bulk-reindex.js --app 123 --field-map ./field-map.json --limit 10
```

### 途中で落ちた場合の再開

そのまま同じコマンドを再実行するだけでよい。進捗ファイル（既定
`scripts/bulk-reindex-progress.jsonl`）に記録済みの `success` / `skipped`（添付なし）
レコードは自動的にスキップされ、`failed` のレコードだけ再試行される。

進捗ファイルは1レコード1行以上（再実行のたびに追記）の JSONL:

```json
{"recordId":"101","status":"success","at":"2026-07-27T10:00:00.000Z"}
{"recordId":"102","status":"failed","at":"2026-07-27T10:00:03.000Z","error":"HTTP 500 [embedding]"}
{"recordId":"103","status":"skipped","at":"2026-07-27T10:00:03.500Z","error":"no attachment"}
```

同じ `recordId` が複数回書かれたら、判定には最後の行が使われる。

## `/index` が要求するメタデータとの対応

`/index` はバイナリ直送（`Content-Type: application/octet-stream`、ボディ=PDFの生バイト列、
メタデータは `X-Index-Meta` ヘッダーに URLエンコードJSON）を受け付ける。このスクリプトは
`plugins/kintone-drawing-similarity/app/plugin.js`（1654行付近の一括登録処理）と
同じ形式で送る。

| X-Index-Meta のキー | 送信元 | 備考 |
|---|---|---|
| `recordId` | kintoneレコードの `$id` | 必須（server.js: 無いと400） |
| `fileKey` | 添付フィールドの先頭PDF/TIFファイルの `fileKey` | 必須（server.js: 無いと400）。毎回kintoneから読み直すので、差し替え済みファイルでも常に最新のfileKeyが送られる |
| `fileName` | 同上の `name` | Qdrant payload の `file_name` に保存されるのみ |
| `tenantId` | `TENANT_ID` 環境変数 | 未指定なら `default` |
| `appId` | `--app` | Qdrant payload の `app_id` に保存 |
| `drawingNo` | `field-map.drawingNoField` の値 | 空文字なら server.js が OCR抽出値にフォールバック |
| `productName` | `field-map.productNameField` の値 | 同上 |
| `material` | `field-map.materialField` の値 | 同上 |
| `dimension` | `field-map.dimensionField` の値 | 同上 |
| `processes` | `field-map.processField` の値 | `process_methods` として保存。未入力でも減点されない設計（server.js） |
| `tags` | `field-map.tagField` の値 | |
| `thumbKey` | `THUMB_KEY` 環境変数（あれば） | server.js が32バイトのAES鍵として検証し、暗号化サムネイルを生成・保存する |

**あえて送らないもの**: `shapeTags`。server.js の `/index` は `body.shapeTags` が文字列で
なければ、その回のOCR（Gemini/Vertex）が画像から抽出した形状タグをそのまま使う
（`plugins/kintone-drawing-similarity/app/plugin.js` の一括登録処理も同じ理由で
`shapeTags` を送っていない）。一括再インデックスは毎回PDFを画像化してOCRをやり直すため、
kintone側の古い値で上書きさせず、常に最新のAI抽出結果を使わせるのが正しい。

## thumbKey の扱い（調査結果）

`server.js` の `/index` は、`body.thumbKey` が truthy な文字列のときだけ:

1. PDFの1ページ目を幅300px（既定。`THUMB_ENC_MAX_WIDTH` で変更可）のPNGにレンダリング
2. `thumbKey` を base64 デコードし、**ちょうど32バイト**（AES-256のキー長）でなければ
   `console.warn` を出して **暗号化をスキップ**（登録自体は失敗させない）
3. 32バイトなら AES-256-GCM で暗号化し、`base64(iv(12B) || ciphertext || authTag(16B))`
   の形式で Qdrant payload の `thumb_enc` フィールドに保存する
4. 復号はブラウザ（WebCrypto）側のみで行う設計。サーバーはこの鍵を一切永続化しない

`thumbKey` はテナント固有の秘密鍵（kintoneプラグイン設定の `thumbEncKey`）であり、
サーバー環境変数としては保持されない。このスクリプトでは `THUMB_KEY` 環境変数として
渡す設計にした。起動時に base64 デコード後の長さを検証し、32バイトでなければ警告を
出す（server.js 側の挙動と同じく、登録自体は止めない）。

## サーバー側の変更要否

調査の結果、**server.js の変更は不要**と判断した。`/index` のバイナリ直送経路・必須項目
（`recordId` / `fileKey`）・`thumbKey` の受け方は、CLIからの一括送信でもプラグインからの
送信でも全く同じインターフェースで扱える。

## A/B実験（EMBED_IMAGE_MODE: auto_roi vs full）の完全手順

### ① 実験用 Cloud Run サービスのデプロイ

本番と同じソースから、**サービス名を変えて**別サービスとしてデプロイする（本番の
`drawing-similarity-api` を上書きしないこと）。

```sh
cd ~/plugbits-plugins && git pull origin main
cd services/drawing-similarity-api
gcloud run deploy drawing-similarity-api-exp \
  --source . \
  --region asia-northeast1 --project drawing-similarity-501101 \
  --clear-base-image
```

デプロイ後、本番と同じ環境変数（`QDRANT_URL` / `QDRANT_API_KEY` / `EMBEDDING_PROVIDER` /
OCRエンジン用の認証情報 `GEMINI_API_KEY` または `GOOGLE_APPLICATION_CREDENTIALS_JSON` /
`GOOGLE_CLOUD_PROJECT` 等）を設定した上で、**実験対象の2つだけを変更**する:

```sh
gcloud run services update drawing-similarity-api-exp \
  --update-env-vars EMBED_IMAGE_MODE=full,QDRANT_COLLECTION=drawing_similarity_dinov2_base_full \
  --region asia-northeast1 --project drawing-similarity-501101
```

- `QDRANT_COLLECTION` を必ず本番と別名にすること。同じコレクションに `full` と
  `auto_roi` のベクトルが混在すると比較にならない（次元数が同じでも埋め込み空間が違う）
- 本番の現在値は `テナント有効化手順.md` / `運用コマンド集.md` を参照。特に
  `EMBEDDING_PROVIDER`・`OCR_ENGINE`・`SHAPE_ENGINE` は本番と揃えること（揃えないと
  「モード差」以外の要因が混ざる）
- **`KINTONE_BASE_URL` / `KINTONE_API_TOKEN` は不要**: このスクリプトはPDFをkintoneから
  取得してバイナリ直送するため、登録先サーバー自身がkintoneに接続する必要がない
- **テナント認証（`TENANT_AUTH_ENABLED`）を無効のままにする選択肢**: 実験用デプロイは
  使い捨てで、外部公開もしない前提なら `TENANT_AUTH_ENABLED` を設定しない（既定false）
  ことで、Firestoreへのテナントドキュメント登録手順を省略できる。この場合 `API_KEY`
  環境変数もCLI側で空のままでよい。ただし実験用サービスのURLが漏れると誰でも
  書き込めてしまうため、実験終了後は忘れずにサービスを削除すること
  （`gcloud run services delete drawing-similarity-api-exp ...`）

### ② スモークテスト

まず10件だけ流して、エラーなく `/index` が完走することを確認する。

```sh
TARGET_API_BASE_URL=https://drawing-similarity-api-exp-xxxxx.asia-northeast1.run.app \
KINTONE_BASE_URL=https://your-subdomain.cybozu.com \
KINTONE_API_TOKEN=xxxxxxxx \
node scripts/bulk-reindex.js --app 123 --field-map ./field-map.json --limit 10
```

`/index-status?tenantId=...` を叩いて実験先コレクションに10件登録されていることを
確認する。

### ③ 全量実行

```sh
TARGET_API_BASE_URL=https://drawing-similarity-api-exp-xxxxx.asia-northeast1.run.app \
KINTONE_BASE_URL=https://your-subdomain.cybozu.com \
KINTONE_API_TOKEN=xxxxxxxx \
node scripts/bulk-reindex.js --app 123 --field-map ./field-map.json --concurrency 3 \
  2>&1 | tee bulk-reindex.log
```

途中で落ちたら、同じコマンドをそのまま再実行すれば失敗分から再開する（進捗ファイルは
既定で `scripts/bulk-reindex-progress.jsonl`。実験を仕切り直すときはこのファイルを
削除するか `--progress` で別名を指定すること）。

### ④ eval/eval.js を実験先に向けて実行し、現行と比較する

`eval/eval.js` は `API_BASE_URL` を読み取り先として `/similar` を叩く評価スクリプト。
現行本番と実験先の両方に対して同じ `eval/pairs.json` で実行し、Precision@k 等を比較する。

```sh
# 現行（本番）
API_BASE_URL=https://drawing-similarity-api-939943665629.asia-northeast1.run.app \
TENANT_ID=your-subdomain node eval/eval.js > eval-baseline.txt

# 実験（EMBED_IMAGE_MODE=full）
API_BASE_URL=https://drawing-similarity-api-exp-xxxxx.asia-northeast1.run.app \
TENANT_ID=your-subdomain node eval/eval.js > eval-experiment.txt
```

より詳細な人手判定（マルバツ判定ゲーム）で比較したい場合は `eval/marubatsu/` 一式
（`generate-set.js` の `API_BASE_URL` を実験先に向けて実行）も利用できる。

## 注意事項

- **モード変更はクエリ側と索引側が揃って初めて意味を持つ**。`EMBED_IMAGE_MODE` は
  埋め込み生成（索引時）にもクエリ時の類似検索（`/similar` 内の埋め込み生成）にも
  使われる設定であり、`/similar` を呼ぶAPIサーバーと `/index` で登録したAPIサーバーの
  `EMBED_IMAGE_MODE` が食い違っていると、埋め込み空間がズレて全く意味のない比較になる。
  実験は必ず「実験用サービスへ登録し、同じ実験用サービスへ `/similar` を投げて評価する」
  形で完結させること
- **API課金と時間**: 1件ごとに PDFレンダリング・OCR（Gemini/Vertex呼び出し）・埋め込み
  生成が発生する。OCRは1件あたり数秒〜十数秒かかり、5,000件を並列度3で流すと
  体感 1件あたり10〜20秒（レート制限時のリトライ待ちを含む）として、単純計算でも
  数時間規模になる（`5000 / 3 * 15秒 ≈ 7時間`）。一晩がかりの実行を前提にすること
- Gemini/Vertex呼び出しは件数分の課金が発生する。実験用デプロイと本番デプロイの
  両方で発生する（実験は追加の全量課金になる）ことを踏まえて実施すること
- kintoneのAPIレート制限に配慮し、`--concurrency` を上げすぎないこと（既定3を推奨。
  file.jsonの取得とレコード一覧取得の両方がこの並行数に含まれる）
