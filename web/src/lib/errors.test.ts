import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  classifyError,
  isTerminalFailure,
  shouldRenderErrorCard,
  type ErrorClass,
} from './errors';

/**
 * 错误分类映射单测（T02 验收⑤：码值与 server/src/errors.ts 逐一对齐）。
 *
 * 这里额外锁死了一条 PRD 明令：**任何文案都不得出现「网络开小差」**。
 * 那句话之所以被点名禁用，是因为它把断网、超时、限流、参数错误四种处境
 * 混成同一句废话，用户既不知道发生了什么，也不知道下一步该做什么。
 */

describe('errors: 码值与服务端对齐', () => {
  it('1. 4xxx/5xxx 码值与 server/src/errors.ts 逐一对齐', () => {
    // 这几个值是从 server/src/errors.ts 抄下来的，两边任何一侧改动都会让本例变红
    expect(ErrorCode.INVALID_REQUEST).toBe(4001);
    expect(ErrorCode.SCENARIO_NOT_FOUND).toBe(4002);
    expect(ErrorCode.INVALID_FEEDBACK_TYPE).toBe(4003);
    expect(ErrorCode.RATE_LIMITED).toBe(4290);
    expect(ErrorCode.UPSTREAM_UNAVAILABLE).toBe(5001);
    expect(ErrorCode.INTERNAL_ERROR).toBe(5002);
  });

  it('2. 本次新增的两个服务端码值在约定分段内', () => {
    expect(ErrorCode.DUPLICATE_REQUEST).toBe(4009);
    expect(ErrorCode.TICKET_INVALID).toBe(4010);
  });

  it('3. 前端传输层码值全部落在 1xxx 分段', () => {
    const frontend = [
      ErrorCode.NETWORK_OFFLINE,
      ErrorCode.TTFB_TIMEOUT,
      ErrorCode.IDLE_TIMEOUT,
      ErrorCode.STREAM_BROKEN,
      ErrorCode.PARSE_DEGRADED,
      ErrorCode.USER_ABORTED,
    ];
    for (const c of frontend) {
      expect(c).toBeGreaterThanOrEqual(1000);
      expect(c).toBeLessThan(2000);
    }
    expect(new Set(frontend).size).toBe(frontend.length); // 无重复
  });
});

describe('errors: 六类分级映射（UX-3）', () => {
  it('4. 离线 → offline，可重试', () => {
    const e = classifyError({ offline: true });
    expect(e.cls).toBe<ErrorClass>('offline');
    expect(e.code).toBe(ErrorCode.NETWORK_OFFLINE);
    expect(e.action).toBe('retry');
    expect(e.retryable).toBe(true);
  });

  it('5. TTFB 超时与空闲超时都归 timeout，但保留各自码值', () => {
    const ttfb = classifyError({ abortReason: 'ttfb-timeout' });
    const idle = classifyError({ abortReason: 'idle-timeout' });
    expect(ttfb.cls).toBe<ErrorClass>('timeout');
    expect(idle.cls).toBe<ErrorClass>('timeout');
    expect(ttfb.code).toBe(ErrorCode.TTFB_TIMEOUT);
    expect(idle.code).toBe(ErrorCode.IDLE_TIMEOUT);
    expect(ttfb.retryable).toBe(true);
  });

  it('6. 5xx → server，可重试；502/503/504 归为上游不可用', () => {
    expect(classifyError({ httpStatus: 500 }).cls).toBe<ErrorClass>('server');
    expect(classifyError({ httpStatus: 500 }).code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(classifyError({ httpStatus: 503 }).code).toBe(ErrorCode.UPSTREAM_UNAVAILABLE);
    expect(classifyError({ httpStatus: 502 }).retryable).toBe(true);
  });

  it('7. 429 → rate-limited，文案带秒数占位替换', () => {
    const e = classifyError({ httpStatus: 429, retryAfterSec: 12 });
    expect(e.cls).toBe<ErrorClass>('rate-limited');
    expect(e.code).toBe(ErrorCode.RATE_LIMITED);
    expect(e.retryAfterSec).toBe(12);
    expect(e.title).toContain('12');
    expect(e.title).not.toContain('{n}');
  });

  it('8. 429 缺 Retry-After 时按 5 秒兜底展示', () => {
    const e = classifyError({ httpStatus: 429 });
    expect(e.retryAfterSec).toBe(5);
    expect(e.title).toContain('5');
  });

  it('9. 其余 4xx → client，不可重试、引导换个问法', () => {
    for (const s of [400, 403, 404, 422]) {
      const e = classifyError({ httpStatus: s });
      expect(e.cls, `status=${s}`).toBe<ErrorClass>('client');
      expect(e.retryable, `status=${s}`).toBe(false);
      expect(e.action, `status=${s}`).toBe('rephrase');
    }
  });

  it('10. SSE 帧降级 → degraded，不可自动重试，引导重新提问', () => {
    const e = classifyError({ code: ErrorCode.PARSE_DEGRADED });
    expect(e.cls).toBe<ErrorClass>('degraded');
    expect(e.retryable).toBe(false);
    expect(e.action).toBe('rephrase');
    expect(e.title).toContain('不完整');
  });

  it('11. 流中途断裂归 timeout（处置动作与超时一致）', () => {
    const e = classifyError({ code: ErrorCode.STREAM_BROKEN });
    expect(e.cls).toBe<ErrorClass>('timeout');
    expect(e.retryable).toBe(true);
  });

  it('12. 票据失效可自动恢复：retryable=true（重新领票再发）', () => {
    expect(classifyError({ code: ErrorCode.TICKET_INVALID }).retryable).toBe(true);
    expect(classifyError({ httpStatus: 401 }).code).toBe(ErrorCode.TICKET_INVALID);
  });

  it('13. 幂等重复既不重试也不弹重试按钮', () => {
    const e = classifyError({ code: ErrorCode.DUPLICATE_REQUEST });
    expect(e.retryable).toBe(false);
    expect(e.action).toBe('none');
  });

  it('14. 业务码优先于兜底：4002 无 httpStatus 时仍归 client', () => {
    const e = classifyError({ code: ErrorCode.SCENARIO_NOT_FOUND });
    expect(e.cls).toBe<ErrorClass>('client');
    expect(e.code).toBe(ErrorCode.SCENARIO_NOT_FOUND);
  });

  it('15. 完全未知的异常兜底为 server，仍给用户一条重试出路', () => {
    const e = classifyError({});
    expect(e.cls).toBe<ErrorClass>('server');
    expect(e.action).toBe('retry');
  });
});

describe('errors: 中止原因的优先级与静默处理', () => {
  it('16. 用户主动停止不弹错误卡，也不计入终态失败', () => {
    const e = classifyError({ abortReason: 'user' });
    expect(e.code).toBe(ErrorCode.USER_ABORTED);
    expect(e.action).toBe('none');
    expect(shouldRenderErrorCard(e)).toBe(false);
    expect(isTerminalFailure(e)).toBe(false);
  });

  it('17. 卸载/场景切换属生命周期中止，静默且无文案', () => {
    for (const r of ['unmount', 'scenario-change'] as const) {
      const e = classifyError({ abortReason: r });
      expect(e.title, r).toBe('');
      expect(shouldRenderErrorCard(e), r).toBe(false);
    }
  });

  it('18. 中止原因优先于残留的 httpStatus —— 防止把「用户点停止」误报成服务器错误', () => {
    const e = classifyError({ abortReason: 'user', httpStatus: 500 });
    expect(e.code).toBe(ErrorCode.USER_ABORTED);
    expect(e.cls).not.toBe<ErrorClass>('server');
  });

  it('19. 超时类中止即便带着 500 残留状态，仍归 timeout', () => {
    const e = classifyError({ abortReason: 'ttfb-timeout', httpStatus: 500 });
    expect(e.code).toBe(ErrorCode.TTFB_TIMEOUT);
    expect(e.cls).toBe<ErrorClass>('timeout');
  });

  it('20. 真实失败计入终态失败，用于 UX-4 连击兜底', () => {
    expect(isTerminalFailure(classifyError({ httpStatus: 500 }))).toBe(true);
    expect(isTerminalFailure(classifyError({ abortReason: 'ttfb-timeout' }))).toBe(true);
  });
});

describe('errors: 文案红线（PRD §7.3）', () => {
  const samples = [
    classifyError({ offline: true }),
    classifyError({ abortReason: 'ttfb-timeout' }),
    classifyError({ abortReason: 'idle-timeout' }),
    classifyError({ httpStatus: 500 }),
    classifyError({ httpStatus: 429, retryAfterSec: 3 }),
    classifyError({ httpStatus: 400 }),
    classifyError({ code: ErrorCode.PARSE_DEGRADED }),
    classifyError({}),
  ];

  it('21. 任何分级文案都不得出现被禁用的「网络开小差」', () => {
    for (const e of samples) {
      expect(e.title, `code=${e.code}`).not.toContain('网络开小差');
    }
  });

  it('22. 六类分级的文案互不相同 —— 分级才有意义', () => {
    const byCls = new Map<string, string>();
    for (const e of samples) {
      if (!byCls.has(e.cls)) byCls.set(e.cls, e.title);
    }
    const titles = [...byCls.values()];
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('23. 需要展示的错误卡一定有非空文案和明确按钮', () => {
    for (const e of samples) {
      if (!shouldRenderErrorCard(e)) continue;
      expect(e.title.length, `code=${e.code}`).toBeGreaterThan(0);
      expect(['retry', 'rephrase', 'handoff', 'none']).toContain(e.action);
    }
  });

  it('24. retryable 与 action 语义自洽：不可重试的不给「重试」按钮', () => {
    const notRetryable = samples.filter((e) => !e.retryable);
    for (const e of notRetryable) {
      expect(e.action, `code=${e.code}`).not.toBe('retry');
    }
  });
});
