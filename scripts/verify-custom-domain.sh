#!/usr/bin/env bash
# =============================================================================
# verify-custom-domain.sh —— M-2 自定义域名绑定验证（方案 A：网关层绑定）
#
# 用法：
#   ./scripts/verify-custom-domain.sh <CUSTOM_DOMAIN>
#   DOMAIN=<CUSTOM_DOMAIN> ./scripts/verify-custom-domain.sh
#
# 判定标准（架构 §2.5 / AC-M2.1~2.5，五连测）：
#   ① H5 首页可达       —— https://<DOMAIN>/chat?scenario=baodao 返回 200 且含 <title>
#   ② HTTPS 证书有效    —— curl 校验证书成功（不带 -k，无证书告警），首页 200
#   ③ 【核心】API 同源   —— https://<DOMAIN>/api/v1/scenarios 返回 JSON 且 code:0
#                           （证明网关把新域名 /api 转发到云函数，方案 A 生效）
#   ④ SSE 打字机可用    —— 复用 verify-headers.sh M0 判据：text/event-stream、
#                           无 content-encoding: br|gzip、内容分批到达（跨度 ≥150ms）
#   ⑤ CNAME 解析生效   —— dig +short CNAME <DOMAIN> 非空
#
# 退出码：0=全部通过；1=存在 FAIL；2=用法错误。
#
# ⚠️ 核心判据是 ③：H5 首页能开 ≠ API 能用。若 ③ 返回静态托管 404/HTML 而非 JSON，
#    说明网关未把新域名 /api 转发到云函数，立即走架构 §2.3 降级路径（B → C）。
# =============================================================================
set -uo pipefail

DOMAIN="${1:-${DOMAIN:-}}"
if [ -z "$DOMAIN" ]; then
  echo "用法: $0 <自定义域名>   例如: $0 chat.example.com" >&2
  exit 2
fi
# 容错：去掉可能的协议前缀与尾部斜杠，统一 https
DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN%/}"
BASE="https://$DOMAIN"

PASS=0
FAIL=0
WARN=0

c_ok()   { printf '  \033[32m✅ PASS\033[0m  %s\n' "$1"; PASS=$((PASS + 1)); }
c_bad()  { printf '  \033[31m❌ FAIL\033[0m  %s\n' "$1"; FAIL=$((FAIL + 1)); }
c_warn() { printf '  \033[33m⚠️  WARN\033[0m  %s\n' "$1"; WARN=$((WARN + 1)); }
title()  { printf '\n\033[1m%s\033[0m\n' "$1"; }

TMP_BODY="$(mktemp)"
TMP_SSE_H="$(mktemp)"
TMP_SSE_T="$(mktemp)"
trap 'rm -f "$TMP_BODY" "$TMP_SSE_H" "$TMP_SSE_T"' EXIT

echo "==========================================================="
echo " 吉小农 · 自定义域名绑定验证（M-2 方案 A：网关层）"
echo " 域名: $DOMAIN"
echo " 时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "==========================================================="

# ---------------------------------------------------------------------------
title "① H5 首页可达（AC-M2.1）"
CODE="$(curl -sS -L --max-time 20 -o "$TMP_BODY" -w '%{http_code}' "$BASE/chat?scenario=baodao" 2>/dev/null || echo 000)"
TITLE="$(grep -o '<title>[^<]*</title>' "$TMP_BODY" 2>/dev/null | head -n1)"
if [ "$CODE" = "200" ] && [ -n "$TITLE" ]; then
  c_ok "首页 HTTP 200 且含标题: $TITLE"
else
  c_bad "首页异常（HTTP $CODE，标题=${TITLE:-<缺失>}）——站点不可达或未绑定"
fi

# ---------------------------------------------------------------------------
title "② HTTPS 证书有效（AC-M2.2）"
if HTTP_LINE="$(curl -sS -I -L --max-time 20 "$BASE/" 2>/dev/null | grep -i '^HTTP' | head -n1)"; then
  c_ok "证书校验通过，$HTTP_LINE"
else
  c_bad "证书校验失败（curl 校验证书不通过）——证书未签发/无效，检查 CloudBase 域名管理"
fi

# ---------------------------------------------------------------------------
title "③ 【核心】新域名下 /api/v1/scenarios 可用（AC-M2.3，方案 A 生效判据）"
SCEN_BODY="$(curl -sS -L --max-time 20 "$BASE/api/v1/scenarios" 2>/dev/null)"
if printf '%s' "$SCEN_BODY" | grep -q '"code": *0' && printf '%s' "$SCEN_BODY" | grep -q '"data"'; then
  c_ok "/api/v1/scenarios 返回 JSON code:0（网关 /api → 云函数生效，前后端 API 零改动成立）"
elif printf '%s' "$SCEN_BODY" | grep -qi '<html'; then
  c_bad "返回了 HTML 而非 JSON —— 网关未转发 /api 到云函数（方案 A 未生效），走降级路径（架构 §2.3）"
else
  c_bad "返回异常: $(printf '%s' "$SCEN_BODY" | head -c 200)"
fi

# ---------------------------------------------------------------------------
title "④ SSE 打字机可用（AC-M2.3，复用 verify-headers.sh M0 判据）"
SSE_URL="$BASE/api/v1/chat"
SSE_BODY='{"scenario_id":"baodao","message":"报到需要带什么材料","history":[],"conversation_id":"verify-custom-domain-probe"}'
curl -sS -N --max-time 45 \
  -D "$TMP_SSE_H" \
  -H 'content-type: application/json' \
  -H 'accept: text/event-stream' \
  -H 'accept-encoding: br, gzip' \
  -X POST --data "$SSE_BODY" \
  "$SSE_URL" 2>/dev/null \
  | while IFS= read -r line; do printf '%s %s\n' "$(date +%s%3N)" "$line"; done > "$TMP_SSE_T"

SSE_H="$(tr 'A-Z' 'a-z' < "$TMP_SSE_H")"
SSE_CT="$(printf '%s' "$SSE_H" | grep -i '^content-type:' | head -n1)"
SSE_ENC="$(printf '%s' "$SSE_H" | grep -i '^content-encoding:' | head -n1)"
SSE_CC="$(printf '%s' "$SSE_H" | grep -i '^cache-control:' | head -n1)"

if printf '%s' "$SSE_CT" | grep -q 'text/event-stream'; then
  c_ok "SSE content-type 正确: $SSE_CT"
else
  c_bad "SSE content-type 异常: ${SSE_CT:-<缺失>}（端点不可达或被网关改写）"
fi

if printf '%s' "$SSE_ENC" | grep -qE '\b(br|gzip|deflate)\b'; then
  c_bad "🚨 SSE 被压缩（$SSE_ENC）—— 新域名必须同样排除 text/event-stream 压缩"
else
  c_ok "SSE 未被压缩（${SSE_ENC:-无 content-encoding，正确}）"
fi

if printf '%s' "$SSE_CC" | grep -q 'no-transform'; then
  c_ok "SSE cache-control 含 no-transform: $SSE_CC"
else
  c_warn "SSE cache-control 缺 no-transform: ${SSE_CC:-<缺失>}（服务端已设，可能被网关剥离）"
fi

LINES="$(grep -c 'data:' "$TMP_SSE_T" 2>/dev/null || echo 0)"
FIRST_TS="$(head -n1 "$TMP_SSE_T" 2>/dev/null | awk '{print $1}')"
LAST_TS="$(tail -n1 "$TMP_SSE_T" 2>/dev/null | awk '{print $1}')"
if [ -n "$FIRST_TS" ] && [ -n "$LAST_TS" ] && [ "$LINES" -gt 1 ]; then
  SPAN=$((LAST_TS - FIRST_TS))
  echo "     收到 data 行数: $LINES，首末行间隔: ${SPAN}ms"
  if [ "$SPAN" -ge 150 ]; then
    c_ok "🚨 M0 通过：内容分批到达（跨度 ${SPAN}ms），打字机效果成立"
  else
    c_bad "🚨 M0 失败：全部内容在 ${SPAN}ms 内一次性到达 —— 疑似被缓冲/压缩"
  fi
else
  c_bad "🚨 M0 失败：未收到多行 SSE 数据（行数=$LINES），无法判定流式"
fi

# ---------------------------------------------------------------------------
title "⑤ CNAME 解析生效（AC-M2.5）"
CNAME="$(dig +short CNAME "$DOMAIN" 2>/dev/null || true)"
if [ -z "$CNAME" ]; then
  CNAME="$(nslookup -type=cname "$DOMAIN" 2>/dev/null | grep -i 'canonical name' | head -n1 || true)"
fi
if [ -z "$CNAME" ]; then
  CNAME="$(host -t cname "$DOMAIN" 2>/dev/null | head -n1 || true)"
fi
if [ -n "$CNAME" ]; then
  c_ok "CNAME 已解析: $CNAME"
else
  c_bad "CNAME 未解析（dig/nslookup/host 均无结果）——检查 DNS 记录是否生效"
fi

echo ""
echo "==========================================================="
printf ' 结果:  \033[32mPASS %d\033[0m   \033[31mFAIL %d\033[0m   \033[33mWARN %d\033[0m\n' "$PASS" "$FAIL" "$WARN"
echo "==========================================================="
[ "$FAIL" -eq 0 ] || {
  echo ""
  echo "存在 FAIL 项。请按 docs/miniapp/domain-binding.md 排查："
  echo "  · CNAME 未生效 → 等 DNS 传播或检查解析值"
  echo "  · 证书失败 → CloudBase 域名管理触发/等待 HTTPS 签发"
  echo "  · ③ /api 返回 HTML → 网关路由未对新域名生效，走架构 §2.3 降级（B → C）"
  exit 1
}
exit 0

# =============================================================================
# 验证结果归档（T02 步骤 6，通过后填写）
# -----------------------------------------------------------------------------
# 日期        域名              ①  ②  ③   ④  ⑤   备注
# ----------  ----------------  -- -- --- -- --  ------------------------------
# (待实测)    <CUSTOM_DOMAIN>   ?  ?  ?   ?  ?   ?
# =============================================================================
