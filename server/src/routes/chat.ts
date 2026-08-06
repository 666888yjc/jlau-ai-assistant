import { Request, Response } from 'express';
import { config } from '../config';
import { getStore } from '../store';
import { sendError, ErrorCode } from '../errors';
import { clientKey, rateLimit } from '../middleware/rateLimit';
import { validateChatBody } from '../middleware/validate';
import { sendEvent } from '../utils/response';
import { streamMock, streamRealCoze } from '../coze/client';
import { streamSiliconFlow } from '../llm/siliconflow';
import { detectHumanHandoff, emitHumanHandoff } from '../llm/handoff';

/**
 * POST /api/v1/chat —— 核心端点。
 * 1) 先完成所有预检（校验 / 限流 / 场景存在性），失败时以 JSON 返回对应错误码；
 * 2) 通过预检后才切换为 text/event-stream，按 openapi.yaml 事件序列推送；
 * 3) 无真实 Coze token 时走 mock 流（useMock），注入 token 后自动切换真实代理。
 */
export async function chatHandler(req: Request, res: Response): Promise<void> {
  const v = validateChatBody(req.body);
  if (!v.ok) {
    sendError(res, v.code, v.message);
    return;
  }

  const rl = rateLimit(`chat:${clientKey(req)}`, config.rateLimit.chatMax, config.rateLimit.windowMs);
  if (!rl.ok) {
    sendError(res, ErrorCode.RATE_LIMITED, '请求过于频繁，请稍后再试');
    return;
  }

  const store = await getStore();
  const scenario = await store.getScenario(v.value.scenario_id);
  if (!scenario) {
    sendError(res, ErrorCode.SCENARIO_NOT_FOUND, '场景不存在');
    return;
  }

  // 预检通过，进入 SSE 流（此后只能用 event:error 表达错误）
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

  const emit = (event: string, data: unknown) => sendEvent(res, event, data);

  try {
    // 转人工意图：不触发 KB 检索与 LLM 调用，直接 SSE 返回人工通道引导（token -> fallback -> done）
    if (detectHumanHandoff(v.value.message)) {
      emitHumanHandoff(v.value, emit);
      return;
    }

    if (config.brain === 'siliconflow') {
      await streamSiliconFlow(v.value, emit);
    } else if (config.brain === 'coze') {
      await streamRealCoze(v.value, emit);
    } else {
      await streamMock(v.value, emit);
    }
  } catch (e) {
    emit('error', { type: 'error', code: ErrorCode.UPSTREAM_UNAVAILABLE, message: '对话服务暂不可用' });
  } finally {
    res.end();
  }
}
