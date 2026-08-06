import type { ComponentType } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ModuleGuard } from './components/ModuleGuard';
import { ChatPage } from './pages/ChatPage';
import { ScenariosPage } from './pages/ScenariosPage';
import { HandoffPage } from './pages/HandoffPage';
import { WelcomePage } from './pages/WelcomePage';
import { ModulesPage } from './pages/ModulesPage';
import { ProfilePage } from './pages/ProfilePage';
import { PrivacyPage } from './pages/PrivacyPage';
import { CalendarModulePage } from './pages/modules/CalendarModulePage';
import { FoodModulePage } from './pages/modules/FoodModulePage';
import { PhoneModulePage } from './pages/modules/PhoneModulePage';
import { LostFoundModulePage } from './pages/modules/LostFoundModulePage';
import { GpaModulePage } from './pages/modules/GpaModulePage';
import { MODULE_REGISTRY } from './modules/registry';

// 模块 id → 页面组件的扁平查找表（架构 §2.5 ADR-3 方案 A）。
// 放在这里而不是 registry.ts 里，是为了让 registry 保持「纯数据」——
// 否则会形成环：registry → page → ModuleGuard → lib/modules → registry。
//
// 新增一个模块 = registry 加 1 条 + 本表加 1 行，下面的路由生成逻辑零改动。
const MODULE_PAGES: Record<string, ComponentType> = {
  calendar: CalendarModulePage,
  food: FoodModulePage,
  phone: PhoneModulePage,
  lostfound: LostFoundModulePage,
  gpa: GpaModulePage,
};

// 路由装配：入口仅做路由分发，不含业务逻辑。
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/welcome" replace />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/scenarios" element={<ScenariosPage />} />
        <Route path="/handoff" element={<HandoffPage />} />
        <Route path="/modules" element={<ModulesPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/privacy" element={<PrivacyPage />} />

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
    </BrowserRouter>
  );
}
