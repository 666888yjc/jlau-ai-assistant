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
  },
};

export type AppConfig = typeof config;
