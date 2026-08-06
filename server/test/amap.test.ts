import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { detectMapIntent, poiAround, CAMPUS_CENTER } from '../src/tools/amap';

describe('detectMapIntent 纯逻辑', () => {
  it('路径规划：从X到Y（步行默认）', () => {
    const r = detectMapIntent('从长春站怎么去学校');
    expect(r?.kind).toBe('route');
    if (r?.kind === 'route') {
      expect(r.fromText).toBe('长春站');
      expect(r.toText).toBe('学校');
      expect(r.mode).toBe('walking');
    }
  });

  it('路径规划：X到Y怎么走', () => {
    const r = detectMapIntent('宿舍到图书馆怎么走');
    expect(r?.kind).toBe('route');
    if (r?.kind === 'route') {
      expect(r.fromText).toBe('宿舍');
      expect(r.toText).toBe('图书馆');
    }
  });

  it('路径规划：仅终点默认从学校出发', () => {
    const r = detectMapIntent('怎么去长春站');
    expect(r?.kind).toBe('route');
    if (r?.kind === 'route') {
      expect(r.fromText).toBe('学校');
      expect(r.toText).toBe('长春站');
    }
  });

  it('路径规划：公交模式识别', () => {
    const r = detectMapIntent('从学校到长春站坐公交怎么走');
    if (r?.kind === 'route') expect(r.mode).toBe('bus');
    else throw new Error('expected route');
  });

  it('路径规划：打车模式识别', () => {
    const r = detectMapIntent('从学校打车去龙嘉机场');
    if (r?.kind === 'route') expect(r.mode).toBe('driving');
    else throw new Error('expected route');
  });

  it('周边搜索：附近+名词命中', () => {
    const r = detectMapIntent('附近有打印店吗');
    expect(r?.kind).toBe('poi');
    if (r?.kind === 'poi') expect(r.keyword).toBe('打印');
  });

  it('周边搜索：学校周边好吃的', () => {
    const r = detectMapIntent('学校周边有什么好吃的');
    expect(r?.kind).toBe('poi');
    if (r?.kind === 'poi') expect(r.keyword).toBe('好吃的');
  });

  it('非地图问题返回 null（不触发 amap 调用）', () => {
    expect(detectMapIntent('报到要带什么材料')).toBeNull();
    expect(detectMapIntent('吉农保研率多少')).toBeNull();
    expect(detectMapIntent('宿舍怎么分配')).toBeNull();
  });
});

// 真实调用仅在 .env 配置了 AMAP_API_KEY 时运行（vitest 默认不加载 .env，故测试环境自动跳过）
describe.skipIf(!config.amapApiKey)('amap 实时调用（需 AMAP_API_KEY + 联网）', () => {
  it('poiAround 返回结构化 POI 列表', async () => {
    const r = await poiAround(CAMPUS_CENTER, '美食', 2000);
    expect(r.ok).toBe(true);
    expect(Array.isArray(r.data)).toBe(true);
    expect(r.data!.length).toBeGreaterThan(0);
    expect(r.data![0]).toHaveProperty('name');
    expect(r.data![0]).toHaveProperty('location');
  }, 20000);
});
