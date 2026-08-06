// [QA 临时文件] 测试范围 5：ModuleGuard 路由守卫 + 注册表驱动列表
// 验收依据：PRD-P0-04 AC②（关闭后直连被弹回）/ AC③（注册表加一条自动出现）；架构 §2.5 ADR-3

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ModuleGuard } from '../src/components/ModuleGuard';
import { setModuleEnabled, isModuleEnabled, readEnabledMap, enabledCount } from '../src/lib/modules';
import { MODULE_REGISTRY, sortedModules, findModule, findModuleByPath } from '../src/modules/registry';
import { KEY_MODULES } from '../src/lib/storage';

function CalendarStub() {
  return <div data-testid="calendar-page">校历页内容</div>;
}
function ModulesHubStub() {
  return <div data-testid="modules-hub">模块中心</div>;
}

/** 渲染一个最小路由环境：/modules/calendar 受 ModuleGuard 保护 */
function renderGuardedRoute(initialPath: string, moduleId = 'calendar') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/modules" element={<ModulesHubStub />} />
        <Route
          path="/modules/calendar"
          element={
            <ModuleGuard id={moduleId}>
              <CalendarStub />
            </ModuleGuard>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ModuleGuard —— 开关生效', () => {
  it('模块开启时正常渲染子页面', () => {
    setModuleEnabled('calendar', true);
    renderGuardedRoute('/modules/calendar');
    expect(screen.getByTestId('calendar-page')).toBeInTheDocument();
    expect(screen.queryByTestId('modules-hub')).not.toBeInTheDocument();
  });

  it('【AC②】模块关闭后直连 URL → 被重定向回 /modules', () => {
    setModuleEnabled('calendar', false);
    expect(isModuleEnabled('calendar')).toBe(false);

    renderGuardedRoute('/modules/calendar');
    expect(screen.getByTestId('modules-hub')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-page')).not.toBeInTheDocument();
  });

  it('【AC②】未知模块 id 直连 → 同样弹回 /modules（不白屏、不崩）', () => {
    expect(() => renderGuardedRoute('/modules/calendar', 'not-a-real-module')).not.toThrow();
    expect(screen.getByTestId('modules-hub')).toBeInTheDocument();
  });

  it('使用 <Navigate replace /> 语义：重定向不入历史栈（源码级断言）', async () => {
    // 行为层面：MemoryRouter 初始 1 条历史，重定向后仍应是 1 条（replace 而非 push）。
    // 这里用组件源码断言 replace 存在，避免依赖 router 内部实现细节。
    const fs = await import('node:fs');
    const src = fs.readFileSync(process.cwd() + '/src/components/ModuleGuard.tsx', 'utf8');
    expect(src).toMatch(/<Navigate\s+to="\/modules"\s+replace\s*\/>/);
  });

  it('挂载时读一次开关：挂载后再关闭开关，当前页面不被抽走（避免闪退）', () => {
    setModuleEnabled('calendar', true);
    const { rerender } = render(
      <MemoryRouter initialEntries={['/modules/calendar']}>
        <Routes>
          <Route path="/modules" element={<ModulesHubStub />} />
          <Route
            path="/modules/calendar"
            element={
              <ModuleGuard id="calendar">
                <CalendarStub />
              </ModuleGuard>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('calendar-page')).toBeInTheDocument();

    // 后台把开关关掉，触发一次重渲染
    setModuleEnabled('calendar', false);
    rerender(
      <MemoryRouter initialEntries={['/modules/calendar']}>
        <Routes>
          <Route path="/modules" element={<ModulesHubStub />} />
          <Route
            path="/modules/calendar"
            element={
              <ModuleGuard id="calendar">
                <CalendarStub />
              </ModuleGuard>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    // 惰性初始化的 allowed 不变，页面仍在
    expect(screen.getByTestId('calendar-page')).toBeInTheDocument();
  });
});

describe('lib/modules —— 开关读写', () => {
  beforeEach(() => localStorage.clear());

  it('未设置过时回退到注册表 defaultEnabled', () => {
    expect(localStorage.getItem(KEY_MODULES)).toBeNull();
    for (const m of MODULE_REGISTRY) {
      expect(isModuleEnabled(m.id)).toBe(m.defaultEnabled);
    }
  });

  it('setModuleEnabled 落盘后可回读，且互不干扰', () => {
    setModuleEnabled('calendar', false);
    expect(isModuleEnabled('calendar')).toBe(false);
    expect(isModuleEnabled('food')).toBe(true);

    setModuleEnabled('calendar', true);
    expect(isModuleEnabled('calendar')).toBe(true);
  });

  it('readEnabledMap 覆盖注册表全部模块', () => {
    const map = readEnabledMap();
    for (const m of MODULE_REGISTRY) {
      expect(map).toHaveProperty(m.id);
    }
  });

  it('enabledCount 与实际开启数一致', () => {
    expect(enabledCount()).toBe(MODULE_REGISTRY.length);
    setModuleEnabled('calendar', false);
    expect(enabledCount()).toBe(MODULE_REGISTRY.length - 1);
  });

  it('jxn-modules 损坏时回退默认值，不抛错', () => {
    localStorage.setItem(KEY_MODULES, '{{{broken');
    expect(() => isModuleEnabled('calendar')).not.toThrow();
    expect(isModuleEnabled('calendar')).toBe(true);
  });

  it('未知模块 id 查询返回 false，不抛错', () => {
    expect(isModuleEnabled('ghost-module')).toBe(false);
  });
});

describe('registry —— 纯数据契约', () => {
  it('id / path 唯一，order 无重复', () => {
    const ids = MODULE_REGISTRY.map((m) => m.id);
    const paths = MODULE_REGISTRY.map((m) => m.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('sortedModules 按 order 升序', () => {
    const orders = sortedModules().map((m) => m.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('findModule / findModuleByPath 双向可查', () => {
    for (const m of MODULE_REGISTRY) {
      expect(findModule(m.id)).toEqual(m);
      expect(findModuleByPath(m.path)).toEqual(m);
    }
    expect(findModule('nope')).toBeUndefined();
    expect(findModuleByPath('/nope')).toBeUndefined();
  });

  it('【ADR-3】registry.ts 不 import 任何页面组件（防循环依赖）', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(process.cwd() + '/src/modules/registry.ts', 'utf8');
    const importLines = src.split('\n').filter((l) => /^\s*import\s/.test(l));
    for (const line of importLines) {
      expect(line, `registry 不应 import 页面: ${line}`).not.toMatch(/pages\//);
      expect(line, `registry 不应 import 组件实现: ${line}`).not.toMatch(/Page['"]/);
    }
  });

  it('desc 不超过 14 字（设计约束）', () => {
    for (const m of MODULE_REGISTRY) {
      expect(m.desc.length, `${m.id} 描述过长: ${m.desc}`).toBeLessThanOrEqual(14);
    }
  });
});

describe('【AC③】注册表加一条 → 模块中心列表自动出现（无 id 分支）', () => {
  it('往注册表注入假模块 qa-ghost，ModulesPage 列表自动多出一行', async () => {
    vi.resetModules();
    vi.doMock('../src/modules/registry', async () => {
      const actual = await vi.importActual<typeof import('../src/modules/registry')>(
        '../src/modules/registry',
      );
      const ghost = {
        id: 'qa-ghost',
        name: 'QA 幽灵模块',
        desc: '仅用于验收测试',
        icon: 'calendar' as const,
        path: '/modules/qa-ghost',
        defaultEnabled: true,
        order: 999,
      };
      const registry = [...actual.MODULE_REGISTRY, ghost];
      return {
        ...actual,
        MODULE_REGISTRY: registry,
        sortedModules: () => [...registry].sort((a, b) => a.order - b.order),
        findModule: (id: string) => registry.find((m) => m.id === id),
        findModuleByPath: (p: string) => registry.find((m) => m.path === p),
      };
    });

    const { ModulesPage } = await import('../src/pages/ModulesPage');
    render(
      <MemoryRouter initialEntries={['/modules']}>
        <ModulesPage />
      </MemoryRouter>,
    );

    // 原有模块仍在
    expect(screen.getByText('校历作息')).toBeInTheDocument();
    expect(screen.getByText('周边美食')).toBeInTheDocument();
    // 假模块自动出现 —— 证明列表 100% 由注册表驱动
    expect(screen.getByText('QA 幽灵模块')).toBeInTheDocument();
    expect(screen.getByText('仅用于验收测试')).toBeInTheDocument();

    vi.doUnmock('../src/modules/registry');
    vi.resetModules();
  });

  it('ModulesPage.tsx 源码中不存在按模块 id 硬编码的分支', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(process.cwd() + '/src/pages/ModulesPage.tsx', 'utf8');
    // 去掉注释行后再检查，避免注释里的说明文字误伤
    const code = src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    expect(code).not.toMatch(/===\s*['"]calendar['"]/);
    expect(code).not.toMatch(/===\s*['"]food['"]/);
    expect(code).toMatch(/sortedModules\(\)/);
  });
});
