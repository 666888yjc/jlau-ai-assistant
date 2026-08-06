import type {
  ApiResponse,
  ChatRequest,
  FeatureItem,
  FeedbackRequest,
  HumanHandoffRequest,
  ScenarioItem,
  SSEEvent,
} from '../types/api';

const BASE = '/api/v1';

async function jsonPost<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as ApiResponse<T>;
}

export async function postFeedback(req: FeedbackRequest): Promise<ApiResponse<unknown>> {
  return jsonPost('/feedback', req);
}

export async function postHumanHandoff(
  req: HumanHandoffRequest,
): Promise<ApiResponse<{ id: string; scenario_id: string; status: string }>> {
  return jsonPost('/human-handoff', req);
}

export async function getScenarios(): Promise<ApiResponse<ScenarioItem[]>> {
  const res = await fetch(BASE + '/scenarios');
  return (await res.json()) as ApiResponse<ScenarioItem[]>;
}

export async function getFeatures(
  scenarioId?: string,
): Promise<ApiResponse<FeatureItem[]>> {
  const qs = scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : '';
  const res = await fetch(BASE + '/features' + qs);
  return (await res.json()) as ApiResponse<FeatureItem[]>;
}

// 流式对话：返回 reader，调用方用 parseSSE 逐事件回调。前端不持有 Coze token。
// 健壮性：网络层偶发失败（函数冷启动 5xx / 网关瞬断）自动重试 2 次退避，避免误报「网络开小差」。
export async function streamChat(
  req: ChatRequest,
  onEvent: (ev: SSEEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const MAX_RETRY = 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      const res = await fetch(BASE + '/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`chat request failed: ${res.status}`);
      }
      await parseSSE(res.body, onEvent);
      return; // 成功，结束重试
    } catch (e) {
      lastErr = e;
      // 用户主动中断不重试
      if (signal?.aborted) throw e;
      if (attempt < MAX_RETRY) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastErr;
}

// 解析 text/event-stream：按空行切分事件块，提取 event: 与 data: 行。
export async function parseSSE(
  body: ReadableStream<Uint8Array>,
  onEvent: (ev: SSEEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer.trim()) flush(buffer, onEvent);
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      flush(block, onEvent);
    }
  }
}

function flush(block: string, onEvent: (ev: SSEEvent) => void): void {
  let event = '';
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (!event || dataLines.length === 0) return;
  try {
    const data = JSON.parse(dataLines.join('')) as SSEEvent;
    onEvent(data);
  } catch {
    // 忽略无法解析的片段
  }
}
