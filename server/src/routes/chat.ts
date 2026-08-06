import { Request, Response } from 'express';
import { config } from '../config';
import { getStore } from '../store';
import { sendError, ErrorCode } from '../errors';
import { authorize } from '../middleware/auth';
import { claim, extractRequestId, settle } from '../middleware/idempotency';
import { rateLimit, subjectKey } from '../middleware/rateLimit';
import { validateChatBody } from '../middleware/validate';
import { sendEvent } from '../utils/response';
import { streamMock, streamRealCoze } from '../coze/client';
import { streamSiliconFlow } from '../llm/siliconflow';
import { detectHumanHandoff, emitHumanHandoff } from '../llm/handoff';

/**
 * POST /api/v1/chat —— 核心端点。
 * 1) 先完成所有预检（校验 / 鉴权 / 限流 / 场景存在性 / 幂等），失败时以 JSON 返回对应错误码；
 * 2) 通过预检后才切换为 text/event-stream，按 openapi.yaml 事件序列推送；
 * 3) 无真实 Coze token 时走 mock 流（useMock），注入 token 后自动切换真实代理。
 *
 * 预检顺序是有讲究的：**幂等占位必须放在最后一步**。
 * 若放在前面，一个参数写错的请求也会把 request_id 占掉，
 * 前端改对参数重发时反而被自己的幂等键挡住（4009），排查起来极其反直觉。
 */
export async function chatHandler(req: Request, res: Response): Promise<void> {
  const v = validateChatBody(req.body);
  if (!v.ok) {
    sendError(res, v.code, v.message);
    return;
  }

  // —— 鉴权（SEC-1）——
  // 灰度期 authorize() 恒返回 reject=false，只在日志留观察记录；
  // AUTH_ENFORCE=1 且配了 TICKET_SECRET 时才真正拦截。
  const auth = authorize(req);
  if (auth.reject) {
    sendError(res, ErrorCode.TICKET_INVALID, '访问凭证已失效，请刷新页面后重试');
    return;
  }

  // —— 限流（SEC-3）——
  // 维度改为「票据优先，回落 IP」：校园网共用出口 IP，纯 IP 维度会一人超限、整栋楼连坐。
  const rl = rateLimit(
    `chat:${subjectKey(req, auth.ticketId)}`,
    config.rateLimit.chatMax,
    config.rateLimit.windowMs,
  );
  if (!rl.ok) {
    // ⭐ 补上 Retry-After 头：这是前端 ERR-2 退避与 UX-3 倒计时文案的唯一数据来源，
    //    之前完全没有下发，前端只能自己拍一个数。
    sendError(res, ErrorCode.RATE_LIMITED, '请求过于频繁，请稍后再试', null, {
      retryAfterSec: rl.retryAfterSec,
    });
    return;
  }

  const store = await getStore();
  const scenario = await store.getScenario(v.value.scenario_id);
  if (!scenario) {
    sendError(res, ErrorCode.SCENARIO_NOT_FOUND, '场景不存在');
    return;
  }

  // —— 幂等占位（API-1）——
  // 前端重试复用同一 request_id，这里保证 LLM 只被真正调用一次。
  const requestId = extractRequestId(req.headers as Record<string, unknown>, req.body);
  const claimed = claim(requestId);
  if (!claimed.ok) {
    sendError(res, ErrorCode.DUPLICATE_REQUEST, '该请求正在处理中，请勿重复提交');
    return;
  }

  // 结算必须覆盖所有结束路径，否则 request_id 会一直挂在 in-flight，
  // 把这名学生后续的重试全部挡在 4009 上。'close' 是唯一保证必然触发一次的时机。
  let hadError = false;
  res.on('close', () => {
    if (hadError) settle(requestId, 'failed');
    else if (res.writableFinished) settle(requestId, 'completed');
    // 客户端中途断开：服务端虽然跑完了，但学生一个字都没看到，
    // 必须释放幂等键让他能重试（详见 idempotency.ts 的取舍说明）
    else settle(requestId, 'aborted');
  });

  // 预检通过，进入 SSE 流（此后只能用 event:error 表达错误）
  // 🔒 以下响应头四件套 + flushHeaders 是 API-4 的服务端正解，架构 §7.5 保护对象，不得改动
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
    hadError = true;
    // 原实现在此处什么都不记（MAINT-4）。上游异常是 5001 的唯一来源，
    // 不打日志等于报到日出问题时无从定位。只记错误信息，不记请求体。
    console.error('[chat] upstream failed:', e instanceof Error ? e.message : String(e));
    emit('error', { type: 'error', code: ErrorCode.UPSTREAM_UNAVAILABLE, message: '对话服务暂不可用' });
  } finally {
    res.end();
  }
}
