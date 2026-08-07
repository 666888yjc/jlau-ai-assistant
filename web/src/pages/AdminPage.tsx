import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../components/NavBar';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import {
  AdminApiError,
  adminListFeedback,
  adminLogin,
  adminLogout,
  adminRefreshKb,
} from '../lib/api';
import {
  clearAdminToken,
  getAdminToken,
  setAdminToken,
  adminErrorMessage,
} from '../lib/admin';
import { ADMIN_LIST_PAGE_SIZE } from '../lib/config';
import type { AdminFeedbackItem } from '../types/api';

/**
 * 反馈管理后台（方案 A，A-1~A-4）。
 *
 * 单页内聚状态机（架构 §2.4.2）：
 *  - 无本地令牌（或已过期/已退出）→ 登录卡（密码输入 + 登录按钮 + 「仅限运营人员访问」），
 *    不渲染任何业务数据（AC-A1.1）；
 *  - 有令牌 → 列表页：筛选（type 分段 + note 搜索）+ 倒序列表（type 徽标 / note / 场景 /
 *    本地化时间，整行 <details> 展开问答快照）+ 分页 + 【刷新知识库】【退出】。
 *
 * 交互约定：
 *  - 数据接口返 4012（会话失效）→ 清令牌自动回登录态（AC-A4.4）；
 *  - 刷新知识库成功 toast「知识库已刷新」/ 失败 toast「刷新失败，请稍后重试」（AC-A3.5）；
 *  - 退出 → clearAdminToken() → 回登录态（AC-A4.4）。
 */

type TypeFilter = 'all' | 'helpful' | 'reported';

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'reported', label: '报错' },
  { value: 'helpful', label: '有帮助' },
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function typeLabel(type: 'helpful' | 'reported'): string {
  return type === 'reported' ? '报错' : '有帮助';
}

export function AdminPage() {
  const { toastNode, showToast } = useToast();

  // —— 会话态 ——
  const [token, setToken] = useState<string | null>(() => getAdminToken());
  // —— 登录卡 ——
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  // —— 列表态 ——
  const [items, setItems] = useState<AdminFeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<TypeFilter>('all');
  const [searchQ, setSearchQ] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const applySessionExpired = useCallback(() => {
    clearAdminToken();
    setToken(null);
    setLoginError(null);
  }, []);

  const loadList = useCallback(
    async (targetPage: number, type: TypeFilter, q: string) => {
      setListLoading(true);
      try {
        const res = await adminListFeedback({
          type: type === 'all' ? undefined : type,
          q: q.trim() === '' ? undefined : q.trim(),
          page: targetPage,
          pageSize: ADMIN_LIST_PAGE_SIZE,
        });
        setItems(res.data.items);
        setTotal(res.data.total);
        setPage(res.data.page);
      } catch (e) {
        if (e instanceof AdminApiError && e.code === 4012) {
          applySessionExpired();
          return;
        }
        if (e instanceof AdminApiError && e.code === 4011) {
          applySessionExpired();
          setLoginError(adminErrorMessage(e.code));
          return;
        }
        showToast(adminErrorMessage(e instanceof AdminApiError ? e.code : 0));
      } finally {
        setListLoading(false);
      }
    },
    [applySessionExpired, showToast],
  );

  // 登录成功或页面首次带令牌进入时加载列表
  useEffect(() => {
    if (token) {
      void loadList(1, filterType, searchQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleLogin = useCallback(async () => {
    if (loginLoading) return;
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await adminLogin(password);
      setAdminToken(res.data.token, res.data.expires_at);
      setToken(res.data.token);
      setPassword('');
    } catch (e) {
      const err = e instanceof AdminApiError ? e : null;
      setLoginError(adminErrorMessage(err?.code ?? 0, err?.retryAfterSec));
    } finally {
      setLoginLoading(false);
    }
  }, [loginLoading, password]);

  const handleQuery = useCallback(() => {
    void loadList(1, filterType, searchQ);
  }, [loadList, filterType, searchQ]);

  const handleRefreshKb = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await adminRefreshKb();
      showToast('知识库已刷新');
    } catch (e) {
      if (e instanceof AdminApiError && e.code === 4012) {
        applySessionExpired();
        return;
      }
      showToast('刷新失败，请稍后重试');
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, applySessionExpired, showToast]);

  const handleLogout = useCallback(() => {
    // 退出 = 前端清令牌（D5：服务端不维护全局黑名单，靠 TTL）
    void adminLogout().catch(() => undefined);
    clearAdminToken();
    setToken(null);
    setPassword('');
    setLoginError(null);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / ADMIN_LIST_PAGE_SIZE));

  // —— 未登录：登录卡（不渲染任何业务数据，AC-A1.1）——
  if (!token) {
    return (
      <AppShell title="吉小农·反馈管理后台">
        <div className="page-pad">
          <div className="admin-card">
            <p className="admin-card-title">反馈管理后台</p>
            <p className="admin-card-hint">仅限运营人员访问</p>
            <label className="admin-field-label" htmlFor="admin-password">
              密码
            </label>
            <input
              id="admin-password"
              className="form-input"
              type="password"
              value={password}
              autoComplete="current-password"
              placeholder="请输入管理密码"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleLogin();
              }}
            />
            {loginError && <p className="form-error" role="alert">{loginError}</p>}
            <button
              className="btn btn-primary btn-block"
              type="button"
              disabled={loginLoading || password.length === 0}
              onClick={() => void handleLogin()}
            >
              {loginLoading ? '登录中…' : '登录'}
            </button>
          </div>
        </div>
        {toastNode}
      </AppShell>
    );
  }

  // —— 已登录：列表页 ——
  return (
    <AppShell
      title="吉小农·反馈管理后台"
      right={
        <>
          <button
            className="nav-action"
            type="button"
            aria-label="刷新知识库"
            disabled={refreshing}
            onClick={() => void handleRefreshKb()}
          >
            <Icon name="RefreshCw" size="button" />
          </button>
          <button className="nav-action" type="button" aria-label="退出" onClick={handleLogout}>
            <Icon name="X" size="button" />
          </button>
        </>
      }
    >
      <div className="page-scroll">
        {/* 筛选区：type 分段 + note 搜索（A-5/A-7） */}
        <div className="admin-filter">
          <div className="admin-seg" role="group" aria-label="按类型筛选">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`btn btn-ghost${filterType === opt.value ? ' admin-seg-active' : ''}`}
                type="button"
                onClick={() => setFilterType(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="admin-search">
            <input
              className="form-input"
              value={searchQ}
              placeholder="搜备注…"
              aria-label="按备注搜索"
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleQuery();
              }}
            />
            <button className="btn btn-quiet" type="button" onClick={handleQuery}>
              查询
            </button>
          </div>
        </div>

        {/* 列表区（A-1/A-2） */}
        {listLoading ? (
          <p className="admin-empty">加载中…</p>
        ) : items.length === 0 ? (
          <p className="admin-empty">暂无反馈记录</p>
        ) : (
          <ul className="admin-list">
            {items.map((it) => (
              <li key={it._id} className="admin-row">
                <details>
                  <summary className="admin-summary">
                    <span className={`admin-badge ${it.type}`}>{typeLabel(it.type)}</span>
                    <span className="admin-note">{it.note ?? '无备注'}</span>
                    <span className="admin-meta">
                      {it.scenario_id} · {formatTime(it.created_at)}
                    </span>
                  </summary>
                  <div className="admin-expanded">
                    {it.snapshot ? (
                      <>
                        <p className="admin-snap-title">问题</p>
                        <p className="admin-snap-text">{it.snapshot.question}</p>
                        <p className="admin-snap-title">回答</p>
                        <p className="admin-snap-text">{it.snapshot.answer}</p>
                      </>
                    ) : (
                      <p className="admin-snap-empty">该反馈无问答快照（升级前数据）</p>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}

        {/* 分页区（A-6） */}
        {total > 0 && (
          <div className="admin-pager">
            <button
              className="btn btn-ghost"
              type="button"
              disabled={page <= 1 || listLoading}
              onClick={() => void loadList(page - 1, filterType, searchQ)}
            >
              上一页
            </button>
            <span className="admin-pager-info">
              {page} / {totalPages}
            </span>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={page >= totalPages || listLoading}
              onClick={() => void loadList(page + 1, filterType, searchQ)}
            >
              下一页
            </button>
          </div>
        )}
      </div>
      {toastNode}
    </AppShell>
  );
}
