import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleChat } from './chat';

function sendJson(res: ServerResponse, data: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => resolve(raw));
  });
}

function rid(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 8);
}

// 场景注册表（与 openapi.yaml / design-tokens 图标映射一致）
const SCENARIOS = [
  { id: 'baodao', name: '新生报到', icon: 'MapPin', lucide_icon: 'MapPin' },
];

// 猜你想问（报到域，真实校园文案）
const FEATURES = [
  { id: 'f1', text: '报到要带什么材料', scenario_id: 'baodao' },
  { id: 'f2', text: '从长春站怎么去学校', scenario_id: 'baodao' },
  { id: 'f3', text: '宿舍怎么分配', scenario_id: 'baodao' },
  { id: 'f4', text: '学费怎么交', scenario_id: 'baodao' },
  { id: 'f5', text: '校园卡怎么激活', scenario_id: 'baodao' },
  { id: 'f6', text: '军训要准备什么', scenario_id: 'baodao' },
];

export async function mockMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): Promise<void> {
  const url = (req.url || '').split('?')[0];
  const method = req.method || 'GET';

  if (!url.startsWith('/api/v1/')) return next();

  if (url === '/api/v1/chat' && method === 'POST') {
    await handleChat(req, res);
    return;
  }

  if (url === '/api/v1/feedback' && method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}');
    return sendJson(res, {
      code: 0,
      data: { id: rid('fb-'), message_id: body.message_id, type: body.type },
      message: 'ok',
    });
  }

  if (url === '/api/v1/human-handoff' && method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}');
    return sendJson(res, {
      code: 0,
      data: { id: rid('hh-'), scenario_id: body.scenario_id, status: 'pending' },
      message: 'ok',
    });
  }

  if (url === '/api/v1/scenarios' && method === 'GET') {
    return sendJson(res, { code: 0, data: SCENARIOS, message: 'ok' });
  }

  if (url === '/api/v1/features' && method === 'GET') {
    const scenarioId = (req.url || '').includes('scenario_id=baodao')
      ? 'baodao'
      : undefined;
    const data = scenarioId ? FEATURES.filter((f) => f.scenario_id === scenarioId) : FEATURES;
    return sendJson(res, { code: 0, data, message: 'ok' });
  }

  return next();
}
