#!/usr/bin/env bash
# 吉小农本地一键启动：后端(3100) + 前端(3000)
# 用法：
#   ./scripts/start-dev.sh            # 前端默认 mock 模式（无需后端即可开发）
#   ./scripts/start-dev.sh --real    # 前端接真实后端（Vite proxy -> server:3100）
set -e

REAL_API=0
if [ "$1" = "--real" ]; then REAL_API=1; fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="$ROOT/server"
WEB="$ROOT/web"

echo "[jlau] 启动后端 (PORT=3100) ..."
( cd "$SERVER" && PORT=3100 npm start > /tmp/jlau-server.log 2>&1 & echo $! > /tmp/jlau-server.pid )

if [ "$REAL_API" = "1" ]; then
  echo "[jlau] 启动前端 (PORT=3000, 接真实后端 -> server:3100) ..."
  ( cd "$WEB" && VITE_USE_REAL_API=1 VITE_API_TARGET=http://localhost:3100 npm run dev > /tmp/jlau-web.log 2>&1 & echo $! > /tmp/jlau-web.pid )
else
  echo "[jlau] 启动前端 (PORT=3000, 内置 mock 模式) ..."
  ( cd "$WEB" && npm run dev > /tmp/jlau-web.log 2>&1 & echo $! > /tmp/jlau-web.pid )
fi

echo "[jlau] 等待后端就绪 (healthz) ..."
for i in $(seq 1 20); do
  if curl -s -m 2 http://localhost:3100/healthz >/dev/null 2>&1; then
    echo "[jlau] 后端就绪: http://localhost:3100 (healthz ok)"
    break
  fi
  sleep 1
done

echo "[jlau] 前端: http://localhost:3000"
echo "[jlau] 停止: make stop  或  kill \$(cat /tmp/jlau-server.pid) \$(cat /tmp/jlau-web.pid)"
echo "[jlau] 验证: make verify"
