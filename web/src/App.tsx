import { Suspense, lazy, type ElementType } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ModuleGuard } from './components/ModuleGuard';
import { ChatPage } from './pages/ChatPage';
import { MODULE_REGISTRY } from './modules/registry';

/**
 * 路由级 React.lazy（T05 / LOAD-4）。
 *
 * 首屏规则（架构 A5 / 风险 R7）：/chat 是首屏必载路由，保持静态 import，
 * 否则 ?scenario=baodao 直接进入会出现二次白屏。其余 12 个页面全部 lazy。
 *
 * T04 交接约束：/chat 的场景切换已由 useChatStream 的 resetForScenario 处理
 * （useLayoutEffect + 掐旧流 + 换消息），这里不再给 /chat 加路由 key——
 * 两套机制二选一，保留 resetForScenario。
 *
 * Suspense fallback 用统一骨架（.page-skeleton，见 global.css §15），不造新布局。
 */

// 页面均为命名导出（export function X），React.lazy 需要 default，用 .then 适配。
const WelcomePage = lazy(() => import('./pages/WelcomePage').then((m) => ({ default: m.WelcomePage })));
const ScenariosPage = lazy(() => import('./pages/ScenariosPage').then((m) => ({ default: m.ScenariosPage })));
const HandoffPage = lazy(() => import('./pages/HandoffPage').then((m) => ({ default: m.HandoffPage })));
const ModulesPage = lazy(() => import('./pages/ModulesPage').then((m) => ({ default: m.ModulesPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const CalendarModulePage = lazy(() =>
  import('./pages/modules/CalendarModulePage').then((m) => ({ default: m.CalendarModulePage })),
);
const FoodModulePage = lazy(() =>
  import('./pages/modules/FoodModulePage').then((m) => ({ default: m.FoodModulePage })),
);
const PhoneModulePage = lazy(() =>
  import('./pages/modules/PhoneModulePage').then((m) => ({ default: m.PhoneModulePage })),
);
const LostFoundModulePage = lazy(() =>
  import('./pages/modules/LostFoundModulePage').then((m) => ({ default: m.LostFoundModulePage })),
);
const GpaModulePage = lazy(() =>
  import('./pages/modules/GpaModulePage').then((m) => ({ default: m.GpaModulePage })),
);
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));

// 模块 id → 页面组件的扁平查找表（架构 §2.5 ADR-3 方案 A）。
// 放在这里而不是 registry.ts 里，是为了让 registry 保持「纯数据」——
// 否则会形成环：registry → page → ModuleGuard → lib/modules → registry。
//
// 新增一个模块 = registry 加 1 条 + 本表加 1 行，下面的路由生成逻辑零改动。
const MODULE_PAGES: Record<string, ElementType> = {
  calendar: CalendarModulePage,
  food: FoodModulePage,
  phone: PhoneModulePage,
  lostfound: LostFoundModulePage,
  gpa: GpaModulePage,
};

/** Suspense 兜底骨架：结构与 index.html 首帧静态骨架一致（LOAD-5 的运行时版本）。 */
function PageSkeleton() {
  return (
    <div className="app-shell" aria-hidden="true">
      <div className="app-header">
        <div className="nav-bar">
          <span className="nav-brand" />
          <span className="nav-title" />
          <span className="nav-spacer" />
        </div>
      </div>
      <div className="shell-body">
        <div className="page-skeleton">
          <span className="sk-line" />
          <span className="sk-line mid" />
          <span className="sk-line" />
          <span className="sk-line short" />
        </div>
      </div>
    </div>
  );
}

// 路由装配：入口仅做路由分发，不含业务逻辑。
export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/" element={<Navigate to="/welcome" replace />} />
          <Route path="/welcome" element={<WelcomePage />} />
          {/* /chat 首屏必载，静态 import（A5）；场景切换走 useChatStream.resetForScenario */}
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/scenarios" element={<ScenariosPage />} />
          <Route path="/handoff" element={<HandoffPage />} />
          <Route path="/modules" element={<ModulesPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          {/* 反馈管理后台（方案 A）：lazy 不进首屏（LOAD-4 预算保护） */}
          <Route path="/admin" element={<AdminPage />} />

          {MODULE_REGISTRY.map((m) => {
            const Page = MODULE_PAGES[m.id];
            // 注册表里有、但还没有页面实现的模块：只上列表、不上路由，不崩
            if (!Page) return null;
            return (
              <Route
                key={m.id}
                path={m.path}
                element={
                  <ModuleGuard id={m.id}>
                    <Page />
                  </ModuleGuard>
                }
              />
            );
          })}

          <Route path="*" element={<Navigate to="/welcome" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
