import { config } from '../config';
import { JsonStore } from './jsonStore';
import type { Store } from '../types';

/**
 * 数据存储单例工厂：
 *  - storeKind=memory  -> 进程内数组（测试）
 *  - storeKind=cloudbase -> CloudBase 文档库（部署）
 *  - 其他 -> 本地 JSON 文件（默认本地形态）
 */
let store: Store | null = null;

export async function getStore(): Promise<Store> {
  if (store) return store;

  if (config.storeKind === 'memory') {
    const s = new JsonStore(':memory:');
    await s.init();
    store = s;
  } else if (config.storeKind === 'cloudbase') {
    const { CloudBaseStore } = await import('./cloudbaseStore');
    const s = new CloudBaseStore();
    await s.init();
    store = s;
  } else {
    const s = new JsonStore(config.dataDir);
    await s.init();
    store = s;
  }
  return store;
}

/** 测试用：清空单例，便于每个用例重建（配合 STORE_KIND=memory）。 */
export function resetStoreForTest(): void {
  store = null;
}
