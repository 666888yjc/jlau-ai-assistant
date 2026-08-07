#!/usr/bin/env bash
# =============================================================================
# gate.sh —— 本地全量门禁（SEC-7 / MAINT-5 / B5 T06）
#
# 工程当前无远端（git remote -v 为空），云端 CI 无法生效，因此以本脚本作为
# 今日生效的「准 CI」；.github/workflows/ci.yml 是与本脚本镜像的 GitHub Actions
# 模板，接远端后自动生效。发布前置步骤见 docs/DEPLOY.md（B5 交付清单）。
#
# 步骤（任一失败即退出非 0）：
#   01 web typecheck          （tsc --noEmit）
#   02 web vitest             （node 环境纯函数内核层，T02）
#   03 web vitest:qa          （jsdom 组件/集成套件；需先 `cd web && npm i` 实装 jsdom）
#   04 web build              （tsc --noEmit && vite build，产出 web/dist）
#   05 bundle-size            （首屏 gzip ≤150KB，复用 scripts/check-bundle-size.mjs）
#   06 scan-secrets           （构建产物/源码 AKID/SecretId/私钥/令牌零命中，SEC-7）
#   07 verify-protection      （MOB-5 保护清单 12/12 回归）
#   08 （可选）verify-headers  --base-url <线上URL>   部署后手工跑，门禁内默认跳过
#
# 用法：
#   bash scripts/gate.sh
#   bash scripts/gate.sh --skip-qa      # 跳过 test:qa（jsdom 未实装时临时用，交付前必须全量跑）
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_QA=0
for a in "$@"; do
  [ "$a" = "--skip-qa" ] && SKIP_QA=1
done

STEP=0
FAIL=0
LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

say() { printf '\n\033[1m[%02d] %s\033[0m\n' "$STEP" "$1"; }
ok()  { printf '  \033[32m✅ %s\033[0m\n' "$1"; }
bad() {
  printf '  \033[31m❌ %s\033[0m\n' "$1"
  FAIL=$((FAIL + 1))
  if [ -s "$LOG" ]; then
    echo '  ── 日志（末 25 行）──────────────────────────'
    tail -n 25 "$LOG" | sed 's/^/    /'
    echo '  ────────────────────────────────────────────'
  fi
}

run() { # <描述> <命令...>
  local desc="$1"
  shift
  STEP=$((STEP + 1))
  say "$desc"
  : > "$LOG"
  if "$@" > "$LOG" 2>&1; then
    ok "$desc"
  else
    bad "$desc"
  fi
}

echo "==========================================================="
echo " 吉小农 · 本地全量门禁（B5）"
echo " 时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "==========================================================="

run "01 web typecheck" bash -c 'cd web && node ./node_modules/typescript/bin/tsc --noEmit'
run "02 web vitest（内核层 node 环境）" bash -c 'cd web && node ./node_modules/vitest/vitest.mjs run --config vitest.config.ts'
if [ "$SKIP_QA" -eq 0 ]; then
  run "03 web vitest:qa（jsdom 套件）" bash -c 'cd web && node ./node_modules/vitest/vitest.mjs run --config vitest.qa.config.ts'
else
  STEP=$((STEP + 1))
  printf '\n\033[1m[%02d] %s\033[0m\n' "$STEP" "03 web vitest:qa（jsdom 套件）"
  printf '  \033[33m⏭  已跳过（--skip-qa）。交付前必须补跑全量门禁。\033[0m\n'
fi
run "04 web build" bash -c 'cd web && npm run build'
run "05 bundle-size（首屏 gzip ≤150KB）" node scripts/check-bundle-size.mjs
run "06 scan-secrets（密钥零命中）" node scripts/scan-secrets.mjs
run "07 verify-protection（MOB-5 保护清单）" bash scripts/verify-protection.sh

echo ""
echo "==========================================================="
if [ "$FAIL" -eq 0 ]; then
  printf ' 结果:  \033[32m✅ 全部门禁通过（%d 步）\033[0m\n' "$STEP"
else
  printf ' 结果:  \033[31m❌ %d 步失败（共 %d 步）\033[0m\n' "$FAIL" "$STEP"
fi
echo "==========================================================="
echo ""
echo " 提示：部署后建议补跑 headers 自检（需真实线上地址）:"
echo "   bash scripts/verify-headers.sh --base-url https://<你的环境>.tcloudbaseapp.com"
echo ""

[ "$FAIL" -eq 0 ] || exit 1
exit 0
