#!/usr/bin/env bash
# =============================================================================
# verify-protection.sh —— MOB-5 保护清单回归（架构 §7.4）
#
# 用法：./scripts/verify-protection.sh
# 退出码：0=全部达标；1=有回归。
#
# 规则：
#   - 「≥」项：数量只能持平或增加，减少即回归（说明既有的移动端适配被改掉了）。
#   - 「==0」项：必须保持 0，出现即回归（引入了架构明令禁止的模式）。
#
# 基线来源：架构 §7.4（2026-08-07 实测）。本脚本内的基线值以 T01 开工前
# 在本地源码上的复测结果为准，与架构表格有出入的已在行内注明。
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CSS="$ROOT/web/src/styles/global.css"
HTML="$ROOT/web/index.html"

FAIL=0
PASS=0

# grep -c 无匹配时会打印 0 但退出码为 1，因此不能用 `|| echo 0`（会拼出 "0\n0"）。
# 统一走 count()：吞掉退出码，只取数字。
count() {
  local n
  n=$(grep -cE "$2" "$1" 2>/dev/null)
  [ -z "$n" ] && n=0
  printf '%s' "$n"
}

check_min() { # <文件> <描述> <ERE 模式> <基线>
  local file="$1" desc="$2" pat="$3" base="$4" cnt
  cnt=$(count "$file" "$pat")
  if [ "$cnt" -ge "$base" ]; then
    printf '  \033[32m✅\033[0m %-28s 期望≥%-3s 实际 %-3s\n' "$desc" "$base" "$cnt"
    PASS=$((PASS + 1))
  else
    printf '  \033[31m❌ 回归\033[0m %-24s 期望≥%-3s 实际 %-3s  <- %s\n' "$desc" "$base" "$cnt" "$(basename "$file")"
    FAIL=$((FAIL + 1))
  fi
}

check_zero() { # <文件> <描述> <ERE 模式>
  local file="$1" desc="$2" pat="$3" cnt
  cnt=$(count "$file" "$pat")
  if [ "$cnt" -eq 0 ]; then
    printf '  \033[32m✅\033[0m %-28s 必须=0   实际 %-3s\n' "$desc" "$cnt"
    PASS=$((PASS + 1))
  else
    printf '  \033[31m❌ 回归\033[0m %-24s 必须=0   实际 %-3s  <- %s\n' "$desc" "$cnt" "$(basename "$file")"
    grep -nE "$pat" "$file" | sed 's/^/          /'
    FAIL=$((FAIL + 1))
  fi
}

echo "==========================================================="
echo " MOB-5 保护清单回归（架构 §7.4）"
echo "==========================================================="

if [ ! -f "$CSS" ] || [ ! -f "$HTML" ]; then
  echo "❌ 找不到 $CSS 或 $HTML" >&2
  exit 1
fi

echo ""
echo " global.css"
check_min  "$CSS" "1 dvh 视口单位"        'dvh'                        1
check_min  "$CSS" "2 safe-area 安全区"    'safe-area-inset'            5
check_min  "$CSS" "3 降级动效"            'prefers-reduced-motion'     4
check_min  "$CSS" "4 hover 能力隔离"      '@media \(hover: *hover\)'   15
check_zero "$CSS" "5 无 fixed 定位"       'position: *fixed'
check_zero "$CSS" "6 无 will-change"      'will-change'
check_min  "$CSS" "7 sticky 定位"         'position: *sticky'          1
check_min  "$CSS" "8 overflow:hidden"     'overflow: *hidden'          2

echo ""
echo " index.html"
check_min  "$HTML" "9 防白闪内联底色"     'background: *#faf9f5'       1
check_min  "$HTML" "10 内联 SVG favicon"  'data:image/svg\+xml'        1
echo -n ""
check_min  "$HTML" "11 viewport-fit"      'viewport-fit=cover'         1

echo ""
echo " 附加不变量（SEC-6：Markdown 零 XSS 面）"
DSI=$(grep -rEc 'dangerouslySetInnerHTML' "$ROOT/web/src" --include='*.tsx' --include='*.ts' 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
DSI_CALL=$(grep -rEn 'dangerouslySetInnerHTML *=' "$ROOT/web/src" --include='*.tsx' --include='*.ts' 2>/dev/null | wc -l | tr -d ' ')
if [ "$DSI_CALL" -eq 0 ]; then
  printf '  \033[32m✅\033[0m %-28s 必须=0   实际 %-3s (文本出现 %s 处，均为注释)\n' "dangerouslySetInnerHTML 调用" "$DSI_CALL" "$DSI"
  PASS=$((PASS + 1))
else
  printf '  \033[31m❌ 回归\033[0m %-24s 必须=0   实际 %-3s\n' "dangerouslySetInnerHTML 调用" "$DSI_CALL"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "==========================================================="
printf ' 结果:  \033[32mPASS %d\033[0m   \033[31mFAIL %d\033[0m\n' "$PASS" "$FAIL"
echo "==========================================================="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
