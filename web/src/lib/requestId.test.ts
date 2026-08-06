import { describe, it, expect } from 'vitest';
import { isUuidV4, newRequestId, newSessionId, type UuidSource } from './requestId';

/**
 * 幂等键生成单测。
 *
 * 三条降级路径都要覆盖 —— 报到日的微信内置浏览器版本极其杂，
 * 只测「现代浏览器有 randomUUID」这一条等于没测。
 */

describe('requestId: 生成合法 UUID v4', () => {
  it('1. 默认路径（node/浏览器原生 crypto）产出合法 v4', () => {
    const id = newRequestId();
    expect(isUuidV4(id)).toBe(true);
  });

  it('2. 走 crypto.randomUUID 分支', () => {
    const fake: UuidSource = { randomUUID: () => '11111111-2222-4333-8444-555555555555' };
    expect(newRequestId(fake)).toBe('11111111-2222-4333-8444-555555555555');
  });

  it('3. 无 randomUUID 时回退到 getRandomValues，仍产出合法 v4', () => {
    const fake: UuidSource = {
      getRandomValues: <T extends Uint8Array>(arr: T): T => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 17) % 256;
        return arr;
      },
    };
    const id = newRequestId(fake);
    expect(isUuidV4(id)).toBe(true);
  });

  it('4. 完全无 crypto 时回退到 Math.random，仍产出合法 v4', () => {
    const id = newRequestId({});
    expect(isUuidV4(id)).toBe(true);
  });

  it('5. 回退路径也必须正确打上 version=4 与 variant=10xx 位', () => {
    const fake: UuidSource = {
      getRandomValues: <T extends Uint8Array>(arr: T): T => {
        arr.fill(0xff); // 全 1，最能暴露掩码写错
        return arr;
      },
    };
    const id = newRequestId(fake);
    expect(id[14]).toBe('4'); // version nibble
    expect(['8', '9', 'a', 'b']).toContain(id[19]); // variant nibble
    expect(isUuidV4(id)).toBe(true);
  });

  it('6. 连续生成 1000 个不重复', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(newRequestId());
    expect(set.size).toBe(1000);
  });
});

describe('requestId: 会话 ID', () => {
  it('7. 带 s- 前缀且长度稳定', () => {
    const sid = newSessionId();
    expect(sid.startsWith('s-')).toBe(true);
    expect(sid).toHaveLength(18);
    // 前缀之后是纯 hex，不应残留 UUID 的连字符
    expect(sid.slice(2)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('8. 连续生成不重复', () => {
    const set = new Set<string>();
    for (let i = 0; i < 200; i++) set.add(newSessionId());
    expect(set.size).toBe(200);
  });
});

describe('requestId: 校验函数', () => {
  it('9. 接受合法 v4，拒绝非法输入', () => {
    expect(isUuidV4('11111111-2222-4333-8444-555555555555')).toBe(true);
    expect(isUuidV4('11111111-2222-1333-8444-555555555555')).toBe(false); // version 非 4
    expect(isUuidV4('11111111-2222-4333-c444-555555555555')).toBe(false); // variant 非法
    expect(isUuidV4('')).toBe(false);
    expect(isUuidV4('not-a-uuid')).toBe(false);
    expect(isUuidV4('11111111222243338444555555555555')).toBe(false); // 缺连字符
  });

  it('10. 大小写不敏感', () => {
    expect(isUuidV4('AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE')).toBe(true);
  });
});
