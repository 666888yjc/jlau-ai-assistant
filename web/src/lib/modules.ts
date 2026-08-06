// 模块开关（jxn-modules）读写。
// ------------------------------------------------------------------
// 语义：存储里「缺 key」不等于「关闭」，而是「用户从未设置过」
//       → 回落到 registry 里的 defaultEnabled。
//       这样新上线的模块默认可见，不需要给老用户做数据迁移。
//
// 硬约束：不直接碰 localStorage，一律经 lib/storage.ts。
// ------------------------------------------------------------------

import { EMPTY_MODULES, isModulesData } from '../types/local';
import type { ModulesData } from '../types/local';
import { MODULE_REGISTRY, findModule } from '../modules/registry';
import { KEY_MODULES, readJson, writeJson } from './storage';

/** 读取模块开关；无数据 / 非法 JSON 一律回落空表（此时全部走 defaultEnabled） */
export function readModules(): ModulesData {
  return readJson<ModulesData>(KEY_MODULES, isModulesData, EMPTY_MODULES);
}

/** 在已读出的数据上判定单个模块开关，避免批量判定时反复读存储 */
function resolveEnabled(data: ModulesData, id: string): boolean {
  const stored = data.enabled[id];
  if (typeof stored === 'boolean') return stored;
  return findModule(id)?.defaultEnabled ?? false;
}

/** 模块是否开启；缺 key 回落 registry.defaultEnabled；未知 id 返回 false */
export function isModuleEnabled(id: string): boolean {
  return resolveEnabled(readModules(), id);
}

/** 设置模块开关；返回是否写入成功 */
export function setModuleEnabled(id: string, on: boolean): boolean {
  const data = readModules();
  const next: ModulesData = {
    version: 1,
    enabled: { ...data.enabled, [id]: on },
  };
  return writeJson(KEY_MODULES, next);
}

/** 当前开启的模块数（只统计注册表里真实存在的模块） */
export function enabledCount(): number {
  const data = readModules();
  return MODULE_REGISTRY.filter((m) => resolveEnabled(data, m.id)).length;
}

/** 一次性读出全部模块的开关状态，供模块中心列表渲染 */
export function readEnabledMap(): Record<string, boolean> {
  const data = readModules();
  const map: Record<string, boolean> = {};
  for (const m of MODULE_REGISTRY) {
    map[m.id] = resolveEnabled(data, m.id);
  }
  return map;
}
