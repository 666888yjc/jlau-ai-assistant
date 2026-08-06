import { config } from '../config';

/**
 * 高德地图 Web 服务工具集（route-B 实时地图问答）。
 * 三个能力：geocode 地理编码 / poiAround 周边搜索 / route 路径规划。
 * key 仅后端持有（config.amapApiKey），前端永不接触。
 */

/** 校园中心坐标（高德地理编码「吉林农业大学」结果），周边搜索默认基准点 */
export const CAMPUS_CENTER = { lng: 125.407129, lat: 43.816224, name: '吉林农业大学' };

export interface AmapResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface Poi {
  name: string;
  address: string;
  location: { lng: number; lat: number };
  distance?: number; // 距基准点（米）
  tel?: string;
}

export interface RouteStep {
  instruction: string;
  distance: number; // 米
  duration: number; // 秒
}

export interface RoutePlan {
  mode: 'walking' | 'bus' | 'driving';
  distance: number; // 米
  duration: number; // 秒
  steps: RouteStep[];
}

async function amapGet(url: string): Promise<any> {
  const r = await fetch(url);
  return r.json();
}

/** 地址 -> 坐标（高德地理编码） */
export async function geocode(address: string): Promise<AmapResult<{ lng: number; lat: number; formatted: string }>> {
  if (!config.amapApiKey) return { ok: false, error: 'AMAP_API_KEY 未配置' };
  const url = `https://restapi.amap.com/v3/geocode/geo?key=${config.amapApiKey}&address=${encodeURIComponent(address)}`;
  const j = await amapGet(url);
  if (j.status !== '1' || !j.geocodes || !j.geocodes.length) return { ok: false, error: j.info || '地理编码失败' };
  const [lng, lat] = String(j.geocodes[0].location).split(',').map(Number);
  return { ok: true, data: { lng, lat, formatted: j.geocodes[0].formatted_address } };
}

/** 周边搜索（以 center 为中心，radius 米内按距离排序） */
export async function poiAround(
  center: { lng: number; lat: number },
  keyword: string,
  radius = 2000,
): Promise<AmapResult<Poi[]>> {
  if (!config.amapApiKey) return { ok: false, error: 'AMAP_API_KEY 未配置' };
  const url =
    `https://restapi.amap.com/v3/place/around?key=${config.amapApiKey}` +
    `&location=${center.lng},${center.lat}&keywords=${encodeURIComponent(keyword)}` +
    `&radius=${radius}&offset=20&sortrule=distance`;
  const j = await amapGet(url);
  if (j.status !== '1' || !j.pois) return { ok: false, error: j.info || '周边搜索失败' };
  const pois: Poi[] = (j.pois as any[]).map((p) => {
    const [lng, lat] = String(p.location).split(',').map(Number);
    return {
      name: p.name,
      address: p.address || '',
      location: { lng, lat },
      distance: p.distance ? Number(p.distance) : undefined,
      tel: p.tel || undefined,
    };
  });
  return { ok: true, data: pois };
}

/** 路径规划（walking 步行 / bus 公交 / driving 驾车） */
export async function route(
  from: { lng: number; lat: number },
  to: { lng: number; lat: number },
  mode: 'walking' | 'bus' | 'driving' = 'walking',
): Promise<AmapResult<RoutePlan>> {
  if (!config.amapApiKey) return { ok: false, error: 'AMAP_API_KEY 未配置' };
  const base = 'https://restapi.amap.com/';
  let ep: string;
  let extra = '';
  if (mode === 'walking') ep = 'v3/direction/walking';
  else if (mode === 'driving') ep = 'v3/direction/driving';
  else {
    ep = 'v3/direction/transit/integrated';
    extra = '&city=长春&cityd=长春';
  }
  const url = `${base}${ep}?key=${config.amapApiKey}&origin=${from.lng},${from.lat}&destination=${to.lng},${to.lat}${extra}`;
  const j = await amapGet(url);
  if (j.status !== '1' || !j.route || !j.route.paths || !j.route.paths.length) {
    return { ok: false, error: j.info || '路径规划失败' };
  }
  const p = j.route.paths[0];
  const steps: RouteStep[] = (p.steps as any[]).map((s) => ({
    instruction: String(s.instruction || '').replace(/<[^>]+>/g, ''),
    distance: Number(s.distance || 0),
    duration: Number(s.duration || 0),
  }));
  return { ok: true, data: { mode, distance: Number(p.distance || 0), duration: Number(p.duration || 0), steps } };
}

// ---------------------------------------------------------------------------
// 意图检测（纯逻辑，无网络依赖，便于单测）
// ---------------------------------------------------------------------------

export type MapIntent =
  | { kind: 'poi'; keyword: string }
  | { kind: 'route'; fromText: string; toText: string; mode: 'walking' | 'bus' | 'driving' }
  | null;

const POI_NOUNS = [
  '打印', '药店', '药房', 'atm', '自动取款', '超市', '银行', '奶茶', '咖啡', '网吧',
  'ktv', '电影', '理发', '快递', '水果', '美食', '餐厅', '好吃的', '吃的', '玩', '景点',
  '图书馆', '操场', '校门', '食堂', '宿舍', '医院', '门诊', '运动', '健身', '宾馆',
  '酒店', '营业厅', '手机卡', '洗衣', '照相', '文具',
];

const ROUTE_MODE_WORDS = ['怎么走', '怎么去', '路线', '导航', '坐公交', '打车', '开车', '驾车', '公交', '地铁', '班车', '轻轨', '乘车'];
const ENDPOINT = `(?:(?!${ROUTE_MODE_WORDS.join('|')})[一-龥a-zA-Z0-9]){1,12}`;

function pickRouteMode(m: string): 'walking' | 'bus' | 'driving' {
  if (/公交|地铁|班车|轻轨|坐车|乘车/.test(m)) return 'bus';
  if (/打车|开车|驾车/.test(m)) return 'driving';
  return 'walking';
}

function detectRoute(message: string): MapIntent {
  const m = message.toLowerCase();
  const mode = pickRouteMode(m);
  const patterns = [
    new RegExp(`从\\s*(${ENDPOINT})\\s*到\\s*(${ENDPOINT})`),
    new RegExp(`从\\s*(${ENDPOINT})\\s*(?:怎么)?(?:打车|开车|驾车|坐公交|坐车|乘车)?\\s*去\\s*(${ENDPOINT})`),
    new RegExp(`(${ENDPOINT})\\s*到\\s*(${ENDPOINT})\\s*(?:怎么走|怎么去|多远|距离|路线|导航)`),
  ];
  for (const p of patterns) {
    const rm = message.match(p);
    if (rm) {
      const fromText = (rm[1] || '').trim();
      const toText = (rm[2] || '').trim();
      if (fromText && toText) return { kind: 'route', fromText, toText, mode };
    }
  }
  if (/怎么去|路线|导航|多远|距离/.test(message)) {
    const toOnly = message.match(new RegExp(`(?:怎么去|到)\\s*(${ENDPOINT})(?:\\s*(?:怎么走|多远|距离|路线|导航))?$`));
    const toText = toOnly && toOnly[1] ? toOnly[1].trim() : '';
    if (toText && toText.length >= 2) return { kind: 'route', fromText: '学校', toText, mode };
  }
  return null;
}

/**
 * 从用户消息推断地图意图。
 * - 路径规划：从X到Y / X到Y怎么走 / 怎么去Y / 到Y路线
 * - 周边搜索：附近/周边/周围 + 地点名词
 * - 否则 null（不涉及地图，不触发 amap 调用）
 */
export function detectMapIntent(message: string): MapIntent {
  const m = message.toLowerCase();
  const route = detectRoute(message);
  if (route) return route;
  if (/附近|周边|周围|边上/.test(message)) {
    const hit = POI_NOUNS.find((n) => m.includes(n));
    if (hit) return { kind: 'poi', keyword: hit };
  }
  return null;
}

/**
 * 文本 -> 坐标：校园相关词映射到 CAMPUS_CENTER，否则走高德地理编码兜底。
 */
export async function resolvePoint(text: string): Promise<{ lng: number; lat: number; name: string }> {
  if (/学校|校区|农大|校内|校园|本部/.test(text)) return { ...CAMPUS_CENTER };
  const g = await geocode(text);
  if (g.ok && g.data) return { lng: g.data.lng, lat: g.data.lat, name: g.data.formatted };
  return { ...CAMPUS_CENTER };
}
