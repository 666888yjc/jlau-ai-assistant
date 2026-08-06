# 吉小农薄壳 MVP —— 本地一键命令
# 说明：本地联调后端走 3100，避开前端 dev 的 3000 冲突。

.PHONY: install dev dev-real verify stop

install:
	cd server && npm install
	cd web && npm install

# 起 server(3100) + web(3000, 默认 mock 模式)
dev:
	./scripts/start-dev.sh

# 起 server(3100) + web(3000, 接真实后端)
dev-real:
	./scripts/start-dev.sh --real

# 部署验证（默认打 http://localhost:3100，可用 BASE_URL 覆盖）
verify:
	BASE_URL=http://localhost:3100 node scripts/verify-deploy.mjs

stop:
	-@kill `cat /tmp/jlau-server.pid 2>/dev/null` 2>/dev/null || true
	-@kill `cat /tmp/jlau-web.pid 2>/dev/null` 2>/dev/null || true
	-@pkill -f "tsx src/index.ts" 2>/dev/null || true
	-@pkill -f "node.*vite" 2>/dev/null || true
	@echo "stopped"
