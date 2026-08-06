#!/usr/bin/env bash
# 吉小农 route-B 公网部署脚本（CloudBase）
# 用法：
#   1) 先 `tcb login` 并在 cloudbaserc.json 填好 envId
#   2) bash scripts/deploy-cloudbase.sh <你的环境ID>
set -euo pipefail

ENV_ID="${1:-REPLACE_WITH_YOUR_ENV_ID}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$ENV_ID" = "REPLACE_WITH_YOUR_ENV_ID" ]; then
  echo "用法: bash scripts/deploy-cloudbase.sh <你的CloudBase环境ID>"
  exit 1
fi

echo "==> [1/4] 构建前端"
( cd "$ROOT/web" && npm run build )

echo "==> [2/4] 构建后端"
( cd "$ROOT/server" && npm run build )

echo "==> [3/4] 部署云函数 jlau-ai-assistant"
# 注意：key 通过控制台「云函数环境变量」注入，不要上传 .env（.tcbignore 已排除）
tcb fn deploy jlau-ai-assistant -e "$ENV_ID"

echo "==> [4/4] 部署前端静态托管"
tcb hosting deploy "$ROOT/web/dist" -e "$ENV_ID"

echo "==> 完成。静态域名见控制台；记得配 /api/* -> 云函数 路由（见 docs/deploy-cloudbase.md §6）"
