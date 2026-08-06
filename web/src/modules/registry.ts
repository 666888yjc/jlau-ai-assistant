// 模块注册表 —— 模块系统的唯一事实源。
// ------------------------------------------------------------------
// 硬约束（架构 §2.5 ADR-3）：
//   本文件是「纯数据」，禁止 import 任何页面组件。
//   页面组件的映射放在 App.tsx 的 MODULE_PAGES 扁平查找表里，
//   否则会形成环：registry → page → ModuleGuard → lib/modules → registry。
//
// 新增一个模块 = 本文件加 1 条 + App.tsx 的查找表加 1 行，
// 模块中心列表与路由的「渲染逻辑」均无需改动（PRD-P0-04 AC③）。
// ------------------------------------------------------------------

import type { SceneId } from '../components/SceneIcon';

export interface ModuleDef {
  /** 稳定 id，作为 jxn-modules.enabled 的 key，一经发布不得改名 */
  id: string;
  /** 模块名，如 '校历作息' */
  name: string;
  /** 一句话描述，≤14 字 */
  desc: string;
  /** 走自绘 SceneIcon，禁用 lucide stock 图标 */
  icon: SceneId;
  /** 路由路径，如 '/modules/calendar' */
  path: string;
  /** 用户从未设置过开关时的默认值 */
  defaultEnabled: boolean;
  /** 升序排列，留 10 的步长便于中间插入 */
  order: number;
}

export const MODULE_REGISTRY: readonly ModuleDef[] = [
  {
    id: 'calendar',
    name: '校历作息',
    desc: '上课时间与学期节点',
    icon: 'calendar',
    path: '/modules/calendar',
    defaultEnabled: true,
    order: 10,
  },
  {
    id: 'food',
    name: '周边美食',
    desc: '学校周边吃什么',
    icon: 'food',
    path: '/modules/food',
    defaultEnabled: true,
    order: 20,
  },
  {
    id: 'phone',
    name: '常用电话',
    desc: '校内号码一键拨',
    icon: 'phone',
    path: '/modules/phone',
    defaultEnabled: true,
    order: 30,
  },
  {
    id: 'lostfound',
    name: '失物招领',
    desc: '本机记一笔丢与捡',
    icon: 'lostfound',
    path: '/modules/lostfound',
    defaultEnabled: true,
    order: 40,
  },
  {
    id: 'gpa',
    name: '绩点估算',
    desc: '算算这学期绩点',
    icon: 'gpa',
    path: '/modules/gpa',
    defaultEnabled: true,
    order: 50,
  },
];

/** 按 order 升序的模块列表（渲染层直接消费，不要在页面里重复排序） */
export function sortedModules(): ModuleDef[] {
  return [...MODULE_REGISTRY].sort((a, b) => a.order - b.order);
}

export function findModule(id: string): ModuleDef | undefined {
  return MODULE_REGISTRY.find((m) => m.id === id);
}

export function findModuleByPath(path: string): ModuleDef | undefined {
  return MODULE_REGISTRY.find((m) => m.path === path);
}
