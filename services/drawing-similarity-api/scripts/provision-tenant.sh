#!/usr/bin/env bash
# テナント発行スクリプト（Cloud Shell での実行を想定）。
#
# 「B. テナント発行」（テナント有効化手順.md）を1コマンドにまとめたもの。
# APIキーとそのSHA-256ハッシュを同時生成し、Firestore の tenants コレクションに
# ドキュメント（tenantId / active）を作成する。
#
# 使い方:
#   ./provision-tenant.sh <kintoneサブドメイン>
#
# 例:
#   ./provision-tenant.sh yahatausa
#
# 環境変数（省略時は既定値。プロジェクト構成が変わった場合のみ上書き）:
#   PROJECT       GCPプロジェクトID（既定: drawing-similarity-501101）
#   DB            Firestore データベースID（既定: default）
#   API_BASE_URL  検証curlに使うAPIのベースURL
#                 （既定: https://drawing-similarity-api-939943665629.asia-northeast1.run.app）

set -euo pipefail

usage() {
  cat <<'EOF'
使い方: ./provision-tenant.sh <kintoneサブドメイン>

例:
  ./provision-tenant.sh yahatausa

新規テナント用のAPIキーを発行し、Firestore の tenants コレクションに
ドキュメント（tenantId / active）を作成します。Cloud Shell での実行を想定。

環境変数（省略時は既定値）:
  PROJECT       GCPプロジェクトID（既定: drawing-similarity-501101）
  DB            Firestore データベースID（既定: default）
  API_BASE_URL  検証curlに使うAPIのベースURL
EOF
}

if [ "$#" -lt 1 ] || [ -z "${1:-}" ]; then
  usage
  exit 1
fi

TENANT_ID="$1"
PROJECT="${PROJECT:-drawing-similarity-501101}"
DB="${DB:-default}"
API_BASE_URL="${API_BASE_URL:-https://drawing-similarity-api-939943665629.asia-northeast1.run.app}"

KEY=$(openssl rand -hex 20)
HASH=$(printf '%s' "$KEY" | sha256sum | cut -d' ' -f1)

TOKEN=$(gcloud auth print-access-token)

BODY=$(cat <<EOF
{
  "fields": {
    "tenantId": { "stringValue": "${TENANT_ID}" },
    "active": { "booleanValue": true }
  }
}
EOF
)

RESPONSE=$(curl -sS -X POST \
  "https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DB}/documents/tenants?documentId=${HASH}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${BODY}")

if printf '%s' "$RESPONSE" | grep -q '"error"'; then
  echo "テナントドキュメントの作成に失敗しました。" >&2
  if printf '%s' "$RESPONSE" | grep -q 'ALREADY_EXISTS'; then
    echo "原因: 同じハッシュ（${HASH}）のドキュメントが既に存在します" \
         "（衝突。もう一度実行するとキー・ハッシュが再生成されます）。" >&2
  fi
  echo "--- Firestore レスポンス ---" >&2
  printf '%s\n' "$RESPONSE" >&2
  exit 1
fi

cat <<EOF

テナント発行が完了しました。

  テナント: ${TENANT_ID}
  APIキー（プラグイン設定に貼る）: ${KEY}
  Firestore ドキュメントID: ${HASH}

検証用（プラグイン設定なしでも確認できる。200 なら成功）:
  curl -sSi '${API_BASE_URL}/tags?tenantId=${TENANT_ID}' -H "X-API-Key: ${KEY}" | head -1

EOF
