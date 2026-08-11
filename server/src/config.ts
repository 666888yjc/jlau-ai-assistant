import { join } from 'path';

/**
 * 运行时配置（统一从环境变量读取）。
 * 无 COZE_API_TOKEN 时自动启用 mock 流，便于本地验证（SPEC §12 / openapi.yaml）。
 */
function boolEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

function numEnv(value: string | undefined, fallback: number): number {
  const n = value ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  port: numEnv(process.env.PORT, 3000),
  /** Coze 平台 API Token（薄壳不向前端暴露；真实接入后注入） */
  cozeToken: process.env.COZE_API_TOKEN || '',
  /** Coze 智能体 bot_id */
  cozeBotId: process.env.COZE_BOT_ID || '',
  /** Coze API 基址（国内版 api.coze.cn / 海外 api.coze.com） */
  cozeApiBase: process.env.COZE_API_BASE || 'https://api.coze.cn',
  /** 透传给 Coze 的 user_id（薄壳统一身份占位，不采集隐私） */
  cozeUserId: process.env.COZE_USER_ID || 'jlau-shell',

  /** 本地知识库目录（route-B 后端检索用；零代码维护：替换/增删 .md 即可） */
  kbDir: process.env.KB_DIR || join(__dirname, '..', 'kb'),

  /** 自托管大脑选型：siliconflow / coze / mock */
  llmProvider: (process.env.LLM_PROVIDER as 'siliconflow' | 'coze' | 'mock') || 'mock',
  /** true=强制回到 mock 流（无外部调用，便于离线测试） */
  llmMock: boolEnv(process.env.LLM_MOCK, false),
  /** 硅基流动 SiliconFlow（OpenAI 兼容）配置 */
  siliconflowApiKey: process.env.SILICONFLOW_API_KEY || '',
  siliconflowBaseUrl: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
  siliconflowModel: process.env.SILICONFLOW_MODEL || 'deepseek-ai/DeepSeek-V3',
  /**
   * 备用模型：主模型限流/繁忙/模型级错误时自动切换（免费档 DeepSeek-V3 常被 50609「系统繁忙」限流，
   * 实测同一 key 下 Qwen/Qwen2.5-72B-Instruct 可用且质量较好）。置空字符串可禁用降级链。
   */
  siliconflowModelBackup: process.env.SILICONFLOW_MODEL_BACKUP || 'Qwen/Qwen2.5-72B-Instruct',
  /**
   * SiliconFlow 上游单次 fetch 超时（毫秒）。回答超时根因修复：必须**小于**前端 TTFB 阈值
   * （web/src/lib/config.ts TTFB_TIMEOUT_MS=40s），让「上游偶发慢」时服务端先给出结果/降级，
   * 前端兜底不抢先掐断（杜绝 30s vs 30s 零余量）。
   */
  siliconflowTimeoutMs: numEnv(process.env.SILICONFLOW_TIMEOUT_MS, 15_000),

  /** 高德地图 Web 服务 key（route-B 实时地图问答用；仅后端持有，前端永不暴露） */
  amapApiKey: process.env.AMAP_API_KEY || '',

  /** 旧字段兼容：无 COZE_API_TOKEN 时强制 mock（保留以防旧部署） */
  legacyCozeMock: boolEnv(process.env.COZE_MOCK, !process.env.COZE_API_TOKEN),

  /** true=当前实际走 mock 流（仅用于启动日志展示） */
  get useMock(): boolean {
    return this.brain === 'mock';
  },

  /**
   * 实际生效的大脑（按优先级解析）：
   * 1) LLM_MOCK=true -> mock
   * 2) LLM_PROVIDER=siliconflow 且有 key -> siliconflow
   * 3) LLM_PROVIDER=coze 且有 token -> coze
   * 4) 兜底 -> mock
   */
  get brain(): 'mock' | 'coze' | 'siliconflow' {
    if (this.llmMock) return 'mock';
    if (this.llmProvider === 'siliconflow' && this.siliconflowApiKey) return 'siliconflow';
    if (this.llmProvider === 'coze' && this.cozeToken) return 'coze';
    return 'mock';
  },
  /** MVP 唯一启用的场景；feedback 缺省归属 */
  defaultScenario: process.env.DEFAULT_SCENARIO || 'baodao',
  /** 数据目录；:memory: 表示内存存储（测试用） */
  dataDir: process.env.DATA_DIR || join(__dirname, '..', 'data'),
  storeKind: (process.env.STORE_KIND as 'json' | 'cloudbase' | 'memory') || 'json',
  rateLimit: {
    windowMs: numEnv(process.env.RATE_WINDOW_MS, 60_000),
    chatMax: numEnv(process.env.RATE_CHAT_MAX, 20),
    dataMax: numEnv(process.env.RATE_DATA_MAX, 60),
    /** 票据签发端点单独限流，防止刷票绕过 chat 限流 */
    ticketMax: numEnv(process.env.RATE_TICKET_MAX, 10),
  },

  /**
   * 匿名票据鉴权（SEC-1 / Q2）。
   *
   * ⚠️ 风险 R5「鉴权误伤真新生」是本任务最高风险，因此这里的默认值全部偏向放行：
   *  - `enforce` 默认 **false**（灰度：只记录不拦截），观察 24h 无误伤再置 1；
   *  - 报到日应急预案要求「回滚优先于修复」，改 AUTH_ENFORCE 环境变量即可秒级关停。
   */
  auth: {
    /** 1/true = 拦截无效票据；0/false = 仅记录不拦截（默认，灰度期） */
    enforce: boolEnv(process.env.AUTH_ENFORCE, false),
    /** 票据有效期，默认 30 分钟（Q2） */
    ticketTtlMs: numEnv(process.env.TICKET_TTL_MS, 30 * 60_000),
    /**
     * HMAC 签名密钥。**必须通过环境变量注入。**
     * 云函数是多实例的：若各实例自行生成随机密钥，A 实例签发的票据到 B 实例必然验签失败，
     * 结果就是报到日大面积 401。因此密钥缺失时 auth.ts 会强制退回不拦截模式（见该文件说明）。
     */
    ticketSecret: process.env.TICKET_SECRET || '',
  },

  /**
   * CORS 白名单（SEC-2）。逗号分隔，如 "https://a.com,https://b.com"。
   *
   * 留空 = 沿用既有的 `*` 放行行为。这是刻意的默认值：
   * 生产形态是静态托管与云函数同域，CORS 本就不参与鉴权；
   * 而一个配错的空白名单会把所有人挡在门外，代价远大于收益。
   * 需要收紧时显式配置 CORS_ALLOW_ORIGINS 即可，配了就严格执行。
   */
  cors: {
    allowOrigins: (process.env.CORS_ALLOW_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== ''),
  },

  /** request_id 幂等去重（API-1） */
  idempotency: {
    /** 正常完成的 request_id 在此时间内重复提交视为重复请求 */
    ttlMs: numEnv(process.env.IDEMPOTENCY_TTL_MS, 60_000),
    /** LRU 容量上限，防止内存无限增长 */
    maxEntries: numEnv(process.env.IDEMPOTENCY_MAX_ENTRIES, 5000),
  },

  /**
   * 反馈管理后台（方案 A，A-1~A-4）。
   *
   * ⚠️ 503 门禁的 `adminEnabled()` 刻意**不在**这里读 `ADMIN_PASSWORD`
   * （见 routes/admin.ts）：门禁正确性依赖「当前是否配置」这一事实，
   * 运行时读取最稳，且单测可直接 set/delete 环境变量无需重建单例（架构 §2.1 C3 / §9 D1）。
   * 本段只放「数值型可调项」。
   */
  admin: {
    /** 管理员会话令牌有效期，默认 12h（Q-A2 / D-A6） */
    sessionTtlMs: numEnv(process.env.ADMIN_SESSION_TTL_MS, 12 * 60 * 60_000),
    /** 登录失败锁定窗口，默认 15min（Q-A3） */
    loginFailWindowMs: numEnv(process.env.ADMIN_LOGIN_FAIL_WINDOW_MS, 15 * 60_000),
    /** 窗口内失败达到该次数即锁定（Q-A3：≥5 次） */
    loginFailMax: numEnv(process.env.ADMIN_LOGIN_FAIL_MAX, 5),
    /** 快照 question 上限（Q-A5，与 web/src/lib/config.ts SNAPSHOT_QUESTION_MAX 同步） */
    snapshotQuestionMax: 2000,
    /** 快照 answer 上限（Q-A5，与 web SNAPSHOT_ANSWER_MAX 同步） */
    snapshotAnswerMax: 20000,
    /**
     * admin 会话独立签名密钥（留位，架构 §9 D2）。
     * 默认空 = 回落 TICKET_SECRET（复用同一密钥 + 前缀 av1 域隔离，不新增环境变量）。
     * 未来若需与匿名票据彻底隔离，注入该值即可。
     */
    tokenSecret: process.env.ADMIN_TOKEN_SECRET || '',
  },
};

export type AppConfig = typeof config;
