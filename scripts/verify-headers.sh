#!/usr/bin/env bash
# =============================================================================
# verify-headers.sh —— 部署后自检脚本（T01 / LOAD-1,2,3 · SEC-4,5 · API-4 验收）
#
# 用法：
#   ./scripts/verify-headers.sh https://your-env.tcloudbaseapp.com
#   BASE=https://your-env.tcloudbaseapp.com ./scripts/verify-headers.sh
#
# 退出码：0=全部通过；1=存在 FAIL。
#
# ⚠️ 关于 Q6（CloudBase 能力边界未确认）：
#   cloudbaserc.json 里写的 hosting.headers / compression 若平台不支持，本脚本会把它测出来。
#   任何 FAIL 项都要到「CloudBase 控制台 → 静态网站托管 → 高级配置 / 缓存配置」等效补齐，
#   补齐后把控制台的实际配置项记到本文件末尾的「控制台兜底清单」注释里，保持三件套同步。
# =============================================================================
set -uo pipefail

BASE="${1:-${BASE:-}}"
if [ -z "$BASE" ]; then
  echo "用法: $0 <站点根地址>   例如: $0 https://your-env.tcloudbaseapp.com" >&2
  exit 2
fi
BASE="${BASE%/}"

PASS=0
FAIL=0
WARN=0

c_ok()   { printf '  \033[32m✅ PASS\033[0m  %s\n' "$1"; PASS=$((PASS + 1)); }
c_bad()  { printf '  \033[31m❌ FAIL\033[0m  %s\n' "$1"; FAIL=$((FAIL + 1)); }
c_warn() { printf '  \033[33m⚠️  WARN\033[0m  %s\n' "$1"; WARN=$((WARN + 1)); }
title()  { printf '\n\033[1m%s\033[0m\n' "$1"; }

# 取响应头（小写化，便于大小写无关匹配）
head_of() { curl -sS -I -L --max-time 20 "$1" 2>/dev/null | tr 'A-Z' 'a-z'; }
# 带 Accept-Encoding 取头
head_enc() { curl -sS -I -L --max-time 20 -H "accept-encoding: $2" "$1" 2>/dev/null | tr 'A-Z' 'a-z'; }

# 从 index.html 里捞一个指纹化 JS 资源；捞不到就退回一个约定路径
detect_asset() {
  local html asset
  html="$(curl -sS -L --max-time 20 "$BASE/" 2>/dev/null)"
  asset="$(printf '%s' "$html" | grep -oE '/assets/[A-Za-z0-9._-]+\.js' | head -n1)"
  [ -n "$asset" ] && printf '%s' "$BASE$asset" || printf ''
}

echo "==========================================================="
echo " 吉小农 · 部署后头部与压缩自检"
echo " 目标: $BASE"
echo " 时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "==========================================================="

# ---------------------------------------------------------------------------
title "① HTML 缓存策略（LOAD-2）"
H_HTML="$(head_of "$BASE/")"
if [ -z "$H_HTML" ]; then
  c_bad "无法获取 $BASE/ 的响应头（站点不可达？）"
else
  CC_HTML="$(printf '%s' "$H_HTML" | grep -i '^cache-control:' | head -n1)"
  if printf '%s' "$CC_HTML" | grep -q 'no-store'; then
    c_bad "HTML 出现 no-store（架构明令禁止，应为 no-cache）: $CC_HTML"
  elif printf '%s' "$CC_HTML" | grep -q 'no-cache'; then
    c_ok "HTML cache-control 含 no-cache: $CC_HTML"
  else
    c_bad "HTML cache-control 非 no-cache: ${CC_HTML:-<缺失>}"
  fi
fi

# ---------------------------------------------------------------------------
title "② 指纹资源长缓存 immutable（LOAD-2）"
ASSET="$(detect_asset)"
if [ -z "$ASSET" ]; then
  c_warn "未能从首页解析出 /assets/*.js（站点可能未构建或结构不同），跳过本项"
else
  echo "     资源: $ASSET"
  H_ASSET="$(head_of "$ASSET")"
  CC_ASSET="$(printf '%s' "$H_ASSET" | grep -i '^cache-control:' | head -n1)"
  if printf '%s' "$CC_ASSET" | grep -q 'immutable'; then
    c_ok "JS 指纹资源含 immutable: $CC_ASSET"
  else
    c_bad "JS 指纹资源缺 immutable: ${CC_ASSET:-<缺失>}"
  fi
fi

# ---------------------------------------------------------------------------
title "③ content-disposition 不得为 attachment（LOAD-3）"
for U in "$BASE/" "${ASSET:-$BASE/}" "$BASE/fallback.html"; do
  [ -z "$U" ] && continue
  CD="$(head_of "$U" | grep -i '^content-disposition:' | head -n1)"
  if printf '%s' "$CD" | grep -q 'attachment'; then
    c_bad "$U 仍带 attachment: $CD"
  else
    c_ok "$U 无 attachment（${CD:-未设置，等价 inline}）"
  fi
done

# ---------------------------------------------------------------------------
title "④ 六类安全头（SEC-4 / SEC-5）"
declare -a SEC_KEYS=(
  "x-content-type-options"
  "x-frame-options"
  "referrer-policy"
  "permissions-policy"
  "strict-transport-security"
  "content-security-policy-report-only"
)
for K in "${SEC_KEYS[@]}"; do
  V="$(printf '%s' "$H_HTML" | grep -i "^$K:" | head -n1)"
  if [ -n "$V" ]; then
    c_ok "$V"
  else
    c_bad "缺少响应头: $K"
  fi
done
# CSP 必须是 Report-Only 首发（架构 A6），出现 enforce 版本要告警
if printf '%s' "$H_HTML" | grep -qi '^content-security-policy:'; then
  c_warn "检测到 enforce 版 content-security-policy —— 本期约定首发 Report-Only，请确认是否提前 enforce"
fi
# frame-ancestors 应在 CSP 内（SEC-5）
if printf '%s' "$H_HTML" | grep -i 'content-security-policy' | grep -q 'frame-ancestors'; then
  c_ok "CSP 含 frame-ancestors（SEC-5）"
else
  c_bad "CSP 缺 frame-ancestors（SEC-5）"
fi

# ---------------------------------------------------------------------------
title "⑤ 压缩生效且 JS 传输体积达标（LOAD-1）"
if [ -z "$ASSET" ]; then
  c_warn "无 JS 资源可测，跳过"
else
  H_BR="$(head_enc "$ASSET" 'br, gzip')"
  ENC="$(printf '%s' "$H_BR" | grep -i '^content-encoding:' | head -n1)"
  if printf '%s' "$ENC" | grep -qE 'br|gzip'; then
    c_ok "JS 压缩生效: $ENC"
  else
    c_bad "JS 未启用压缩: ${ENC:-<无 content-encoding>}"
  fi
  BYTES="$(curl -sS -L --max-time 30 -H 'accept-encoding: br, gzip' -o /dev/null -w '%{size_download}' "$ASSET" 2>/dev/null || echo 0)"
  KB=$((BYTES / 1024))
  if [ "$BYTES" -gt 0 ] && [ "$KB" -le 90 ]; then
    c_ok "JS 传输体积 ${KB}KB ≤ 90KB"
  else
    c_bad "JS 传输体积 ${KB}KB 超过 90KB 目标"
  fi
fi

# ---------------------------------------------------------------------------
title "⑥ 🚨 M0 硬门禁：SSE 逐字到达（API-4 / 风险 R1）"
echo "     说明：压缩或缓冲一旦误伤 text/event-stream，打字机效果消失，用户会判定卡死。"
echo "     判据：多次 read 分批到达（chunked/流式），且响应头不得出现 content-encoding: br|gzip。"
SSE_URL="$BASE/api/v1/chat"
SSE_BODY='{"scenario_id":"baodao","message":"报到需要带什么材料","history":[],"conversation_id":"verify-headers-probe"}'
TMP_H="$(mktemp)"; TMP_T="$(mktemp)"
trap 'rm -f "$TMP_H" "$TMP_T"' EXIT

# -N 关闭输出缓冲；用 %{time_starttransfer} 与分块到达时间戳判断是否流式
curl -sS -N --max-time 45 \
  -D "$TMP_H" \
  -H 'content-type: application/json' \
  -H 'accept: text/event-stream' \
  -H 'accept-encoding: br, gzip' \
  -X POST --data "$SSE_BODY" \
  "$SSE_URL" 2>/dev/null \
  | while IFS= read -r line; do printf '%s %s\n' "$(date +%s%3N)" "$line"; done > "$TMP_T"

SSE_H="$(tr 'A-Z' 'a-z' < "$TMP_H")"
SSE_ENC="$(printf '%s' "$SSE_H" | grep -i '^content-encoding:' | head -n1)"
SSE_CT="$(printf '%s' "$SSE_H" | grep -i '^content-type:' | head -n1)"
SSE_CC="$(printf '%s' "$SSE_H" | grep -i '^cache-control:' | head -n1)"
SSE_XA="$(printf '%s' "$SSE_H" | grep -i '^x-accel-buffering:' | head -n1)"

if printf '%s' "$SSE_CT" | grep -q 'text/event-stream'; then
  c_ok "SSE content-type 正确: $SSE_CT"
else
  c_bad "SSE content-type 异常: ${SSE_CT:-<缺失>}（端点不可达或被网关改写）"
fi

if printf '%s' "$SSE_ENC" | grep -qE '\b(br|gzip|deflate)\b'; then
  c_bad "🚨 致命：SSE 被压缩（$SSE_ENC）—— 必须在托管/网关层对 text/event-stream 排除压缩，否则全批回滚"
else
  c_ok "SSE 未被压缩（${SSE_ENC:-无 content-encoding，正确}）"
fi

if printf '%s' "$SSE_CC" | grep -q 'no-transform'; then
  c_ok "SSE cache-control 含 no-transform: $SSE_CC"
else
  c_bad "SSE cache-control 缺 no-transform: ${SSE_CC:-<缺失>}"
fi

if printf '%s' "$SSE_XA" | grep -q 'no'; then
  c_ok "x-accel-buffering: no 已下发"
else
  c_warn "未见 x-accel-buffering: no（服务端已设，可能被网关剥离）"
fi

LINES="$(grep -c 'data:' "$TMP_T" 2>/dev/null || echo 0)"
FIRST_TS="$(head -n1 "$TMP_T" 2>/dev/null | awk '{print $1}')"
LAST_TS="$(tail -n1 "$TMP_T" 2>/dev/null | awk '{print $1}')"
if [ -n "$FIRST_TS" ] && [ -n "$LAST_TS" ] && [ "$LINES" -gt 1 ]; then
  SPAN=$((LAST_TS - FIRST_TS))
  echo "     收到 data 行数: $LINES，首末行间隔: ${SPAN}ms"
  if [ "$SPAN" -ge 150 ]; then
    c_ok "🚨 M0 通过：内容分批到达（跨度 ${SPAN}ms），打字机效果成立"
  else
    c_bad "🚨 M0 失败：全部内容在 ${SPAN}ms 内一次性到达 —— 疑似被缓冲/压缩，按预案全批回滚"
  fi
else
  c_bad "🚨 M0 失败：未收到多行 SSE 数据（行数=$LINES），无法判定流式"
fi

# ---------------------------------------------------------------------------
title "⑦ 静态兜底页可独立访问（PRD §9.4）"
FB_CODE="$(curl -sS -L --max-time 20 -o "$TMP_T" -w '%{http_code}' "$BASE/fallback.html" 2>/dev/null || echo 000)"
if [ "$FB_CODE" = "200" ]; then
  if grep -q '/api/v1/' "$TMP_T"; then
    c_bad "fallback.html 中出现 /api/v1/ 引用 —— 必须零 API 依赖"
  else
    c_ok "fallback.html 可访问且零 /api/v1/ 依赖"
  fi
else
  c_bad "fallback.html 不可访问（HTTP $FB_CODE）"
fi

# ---------------------------------------------------------------------------
echo ""
echo "==========================================================="
printf ' 结果:  \033[32mPASS %d\033[0m   \033[31mFAIL %d\033[0m   \033[33mWARN %d\033[0m\n' "$PASS" "$FAIL" "$WARN"
echo "==========================================================="
[ "$FAIL" -eq 0 ] || {
  echo ""
  echo "存在 FAIL 项。若因 CloudBase 不支持 cloudbaserc.json 的对应配置，请到控制台等效补齐："
  echo "  · 静态网站托管 → 缓存配置：/assets/* 长缓存 immutable；*.html 设 no-cache"
  echo "  · 静态网站托管 → 自定义响应头：补齐六类安全头（CSP 用 Report-Only）"
  echo "  · 压缩配置：MIME 白名单中确保【不含】text/event-stream"
  echo "  · 云函数/网关：确认未对 /api/v1/chat 开启响应缓冲或二次压缩"
  echo "补齐后请把控制台实际配置追加记录到本脚本末尾注释，保持配置-脚本-控制台三件套同步。"
  exit 1
}
exit 0

# =============================================================================
# 控制台兜底清单（Q6 实测后在此登记，每次变更追加一行，勿删历史）
# -----------------------------------------------------------------------------
# 日期        项目                              cloudbaserc 是否生效   控制台等效配置
# ----------  --------------------------------  --------------------  ----------------
# (待实测)    hosting.headers                   ?                     ?
# (待实测)    hosting.compression.excludeMime   ?                     ?
# (待实测)    /api/v1/chat 压缩排除              ?                     ?
# =============================================================================
