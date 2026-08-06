// 模块路由守卫。
// 模块被关闭、或 id 根本不在注册表里 → 重定向回模块中心。
//
// 两个刻意的设计：
//   1. 用 <Navigate replace />：不入历史栈，否则用户点「返回」会被反复弹回被禁模块，形成死循环。
//   2. 开关只在「挂载时」读一次（useState 惰性初始化）：
//      否则用户在 /modules 关掉开关的瞬间，正在后台展示的页面会被抽掉，体验上像闪退。

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { isModuleEnabled } from '../lib/modules';
import { findModule } from '../modules/registry';

interface ModuleGuardProps {
  id: string;
  children: ReactNode;
}

export function ModuleGuard({ id, children }: ModuleGuardProps) {
  const allowed = useState(() => findModule(id) !== undefined && isModuleEnabled(id))[0];

  if (!allowed) return <Navigate to="/modules" replace />;
  return <>{children}</>;
}
