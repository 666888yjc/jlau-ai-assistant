import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config';
import { streamSiliconFlow } from '../src/llm/siliconflow';
import type { ChatInput } from '../src/coze/client';

/**
 * 地图类问题的「来源归属」回归 + 路线多方案数据注入。
 *
 * 线上真实 Bug：
 * 1. 问「学校附近有什么好吃的」，答案实际由高德实时数据生成，
 *    但 sources 只带随机命中的 KB 芯片 —— 来源张冠李戴。
 *    修复后：mapCtx 非空时，来源**只显示** `高德地图实时数据`（长度=1，不再混入 KB 芯片）；
 *    大模型降级路径（emitKbFallback）同样只带该来源。
 * 2. 问「从学校怎么去长春西站」，后端只按单一 mode 拉高德数据，
 *    LLM 却编造了数据中不存在的公交线路/站点。
 *    修复后：walking/bus/driving 三方案并行拉取、成功方案全部注入 prompt，
 *    并附带「严禁编造」约束。
 *
 * 全程 stub 全局 fetch（按 URL 分流 amap / siliconflow），不发真实网络请求。
 */

const AMAP_SOURCE_TITLE = '高德地图实时数据';
const AMAP_SOURCE_URL = 'https://lbs.amap.com/';

/** 触发 poi 意图（附近 + 名词），且答案应由实时数据驱动 */
const MAP_MESSAGE = '学校附近有什么好吃的';
/** 触发 route 意图（从X到Y怎么走） */
const ROUTE_MESSAGE = '从学校到长春西站怎么走';
/** 不触发任何地图意图，但能稳定命中 KB */
const NON_MAP_MESSAGE = '宿舍怎么分配';

const AMAP_POI_BODY = {
  status: '1',
  info: 'OK',
  pois: [
    { name: '李季酱骨头', address: '净月大学城新城大街', location: '125.408,43.817', distance: '320' },
    { name: '农大小吃街', address: '新城大街 2888 号', location: '125.409,43.818', distance: '450' },
  ],
};

const AMAP_GEO_BODY = {
  status: '1',
  info: 'OK',
  geocodes: [{ location: '125.1,43.8', formatted_address: '长春西站' }],
};

/** 按模式返回高德路径规划响应（steps 结构与 amap.ts route() 消费字段一致） */
function routeBody(mode: 'walking' | 'bus' | 'driving'): unknown {
  const spec: Record<string, { distance: string; duration: string; steps: unknown[] }> = {
    walking: {
      distance: '1200',
      duration: '900',
      steps: [{ instruction: '从学校南门出发步行至新城大街', distance: '1200', duration: '900' }],
    },
    bus: {
      distance: '10200',
      duration: '1800',
      steps: [
        { instruction: '步行至吉林农大站', distance: '400', duration: '300' },
        { instruction: '乘坐 Z161 路至长春西站', distance: '9800', duration: '1500' },
      ],
    },
    driving: {
      distance: '14200',
      duration: '1320',
      steps: [{ instruction: '沿新城大街向北行驶至长春西站', distance: '14200', duration: '1320' }],
    },
  };
  const s = spec[mode];
  return { status: '1', info: 'OK', route: { paths: [{ distance: s.distance, duration: s.duration, steps: s.steps }] } };
}

/** 按 amap URL 分流返回对应响应（geocode / place around / 三种 direction） */
function amapResponse(url: string): Response {
  if (url.includes('/v3/direction/walking')) return jsonResponse(200, routeBody('walking'));
  if (url.includes('/v3/direction/transit/integrated')) return jsonResponse(200, routeBody('bus'));
  if (url.includes('/v3/direction/driving')) return jsonResponse(200, routeBody('driving'));
  if (url.includes('/v3/geocode/geo')) return jsonResponse(200, AMAP_GEO_BODY);
  return jsonResponse(200, AMAP_POI_BODY);
}

interface CapturedEvent {
  e: string;
  d: Record<string, unknown>;
}

interface SourceItem {
  title: string;
  url: string;
  updated_at?: string;
}

function createCollector() {
  const events: CapturedEvent[] = [];
  const emit = (e: string, d: unknown) => {
    events.push({ e, d: (d ?? {}) as Record<string, unknown> });
  };
  return { events, emit };
}

function sourcesOf(events: CapturedEvent[]): SourceItem[] {
  const ev = events.find((x) => x.e === 'sources');
  return ev ? ((ev.d.items ?? []) as SourceItem[]) : [];
}

function makeInput(message: string): ChatInput {
  return { scenario_id: 'baodao', message, conversation_id: 'conv-map-test', history: [] };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function sseResponse(payload: string): Response {
  return new Response(payload, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const SSE_OK = `data: ${JSON.stringify({ choices: [{ delta: { content: '附近推荐李季酱骨头。' } }] })}\n\ndata: [DONE]\n\n`;

/**
 * 按 URL 分流的 fetch stub：amap 域名走 amapResponse 路由，其余（硅基流动）返回 llmResponse 工厂产物。
 */
function stubFetch(llmResponse: () => Response) {
  const fetchMock = vi.fn(async (url: unknown) => {
    if (String(url).includes('restapi.amap.com')) return amapResponse(String(url));
    return llmResponse();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** 用假定时器跑完整条链路，避免真实等待重试退避 */
async function runStream(input: ChatInput, emit: (e: string, d: unknown) => void): Promise<void> {
  vi.useFakeTimers();
  try {
    const running = streamSiliconFlow(input, emit);
    await vi.runAllTimersAsync();
    await running;
  } finally {
    vi.useRealTimers();
  }
}

describe('地图问题的来源不再张冠李戴', () => {
  let originalApiKey: string;
  let originalAmapKey: string;

  beforeEach(() => {
    originalApiKey = config.siliconflowApiKey;
    originalAmapKey = config.amapApiKey;
    config.siliconflowApiKey = 'test-key';
    config.amapApiKey = 'test-amap-key';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    config.siliconflowApiKey = originalApiKey;
    config.amapApiKey = originalAmapKey;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('实时数据驱动的地图问题：来源只显示高德（长度=1，不混入 KB 芯片）', async () => {
    stubFetch(() => sseResponse(SSE_OK));
    const { events, emit } = createCollector();

    await runStream(makeInput(MAP_MESSAGE), emit);

    const sources = sourcesOf(events);
    expect(sources.length).toBe(1);
    expect(sources[0].title).toBe(AMAP_SOURCE_TITLE);
    expect(sources[0].url).toBe(AMAP_SOURCE_URL);
    expect(sources[0].updated_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('非地图问题：不得凭空插入高德来源', async () => {
    stubFetch(() => sseResponse(SSE_OK));
    const { events, emit } = createCollector();

    await runStream(makeInput(NON_MAP_MESSAGE), emit);

    const sources = sourcesOf(events);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.some((s) => s.title === AMAP_SOURCE_TITLE)).toBe(false);
  });

  it('路线问题：步行/公交/驾车三方案与「严禁编造」约束一并注入 prompt', async () => {
    let requestBody = '';
    const fetchMock = vi.fn(async (url: unknown, init?: { body?: unknown }) => {
      if (String(url).includes('restapi.amap.com')) return amapResponse(String(url));
      requestBody = String(init?.body ?? '');
      return sseResponse(SSE_OK);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { events, emit } = createCollector();

    await runStream(makeInput(ROUTE_MESSAGE), emit);

    // 三种模式必须被真实请求（不再是单一 mode）
    const amapCalls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('restapi.amap.com'));
    expect(amapCalls.some((u) => u.includes('/v3/direction/walking'))).toBe(true);
    expect(amapCalls.some((u) => u.includes('/v3/direction/transit/integrated'))).toBe(true);
    expect(amapCalls.some((u) => u.includes('/v3/direction/driving'))).toBe(true);

    // 多方案真实数据 + 禁编造约束注入 system prompt
    expect(requestBody).toContain('【步行方案】');
    expect(requestBody).toContain('【公交方案】');
    expect(requestBody).toContain('【驾车方案】');
    expect(requestBody).toContain('严禁编造');

    const sources = sourcesOf(events);
    expect(sources[0]?.title).toBe(AMAP_SOURCE_TITLE);
  });

  it('大模型降级（连续 429）时，地图来源依旧保留', async () => {
    stubFetch(() => jsonResponse(429, { code: 50609, message: 'rate limit' }));
    const { events, emit } = createCollector();

    await runStream(makeInput(MAP_MESSAGE), emit);

    expect(events.map((x) => x.e)).not.toContain('error');
    // 降级路径同样只显示高德来源（不再混入 KB 芯片）
    expect(sourcesOf(events).length).toBe(1);
    expect(sourcesOf(events)[0]?.title).toBe(AMAP_SOURCE_TITLE);
  });

  it('未配置 AMAP_API_KEY：无实时数据则不标注高德来源', async () => {
    config.amapApiKey = '';
    stubFetch(() => sseResponse(SSE_OK));
    const { events, emit } = createCollector();

    await runStream(makeInput(MAP_MESSAGE), emit);

    expect(sourcesOf(events).some((s) => s.title === AMAP_SOURCE_TITLE)).toBe(false);
  });

  it('高德周边搜索失败：记录 [amap] 警告日志（poi 分支）', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    config.amapApiKey = '';
    stubFetch(() => sseResponse(SSE_OK));
    const { events, emit } = createCollector();

    await runStream(makeInput(MAP_MESSAGE), emit);

    expect(warnSpy).toHaveBeenCalledWith('[amap] poiAround 失败', 'AMAP_API_KEY 未配置');
    expect(sourcesOf(events).some((s) => s.title === AMAP_SOURCE_TITLE)).toBe(false);
  });

  it('高德路径规划失败：记录 [amap] 警告日志（route 分支）', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    config.amapApiKey = '';
    stubFetch(() => sseResponse(SSE_OK));
    const { events, emit } = createCollector();

    await runStream(makeInput(ROUTE_MESSAGE), emit);

    expect(warnSpy).toHaveBeenCalledWith('[amap] route 失败', 'AMAP_API_KEY 未配置');
    expect(sourcesOf(events).some((s) => s.title === AMAP_SOURCE_TITLE)).toBe(false);
  });

  it('所有来源 URL 要么合法 http(s) 要么空串（前端据此决定是否渲染 <a>）', async () => {
    stubFetch(() => sseResponse(SSE_OK));
    const { events, emit } = createCollector();

    await runStream(makeInput(MAP_MESSAGE), emit);

    for (const s of sourcesOf(events)) {
      if (s.url) expect(s.url).toMatch(/^https?:\/\/[^\s()（）[\]<>"']+$/);
      else expect(s.url).toBe('');
    }
  });
});
