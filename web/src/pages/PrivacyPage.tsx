// 隐私中心。
// ------------------------------------------------------------------
// 三件事：看得见（inventory）、拿得走（exportAll → Blob 下载）、删得掉（clearById / clearAll）。
//
// 关键实现约束：
//   1. 清单完全由 lib/storage 的运行时扫描产出，本页不硬编码任何键名 —— 漏键不可能发生。
//   2. 导出走 Blob + <a download>，零网络请求（这是「本地数据」承诺的技术证明）。
//   3. clearAll() 会连 jxn-theme 一起清掉，因此必须随后 applyTheme(getSystemTheme())
//      复位 <html>.dark，否则 DOM 上的 class 会与存储不一致。
// ------------------------------------------------------------------

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/NavBar';
import { DangerConfirmButton } from '../components/DangerConfirmButton';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { applyTheme, getSystemTheme } from '../lib/theme';
import { clearAll, clearById, exportAll, exportFileName, inventory } from '../lib/storage';
import type { InventoryEntry } from '../lib/storage';

/** 触发浏览器下载；全程本地，无任何网络请求 */
function downloadJson(fileName: string, payload: unknown): boolean {
  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

function StorageRow({ entry, onClear }: { entry: InventoryEntry; onClear: () => void }) {
  return (
    <div className="storage-row">
      <div className="storage-row-main">
        <div className="storage-row-name">
          <span>{entry.label}</span>
          <span className="storage-row-sum">{entry.summary}</span>
        </div>
        <div className="storage-row-purpose">{entry.purpose}</div>
      </div>
      <DangerConfirmButton
        label="清除"
        confirmLabel="确定清除？"
        disabled={entry.empty}
        onConfirm={onClear}
      />
    </div>
  );
}

export function PrivacyPage() {
  const navigate = useNavigate();
  const { toastNode, showToast } = useToast();
  const [entries, setEntries] = useState<InventoryEntry[]>(() => inventory());

  const refresh = useCallback(() => {
    setEntries(inventory());
  }, []);

  const handleExport = useCallback(() => {
    const bundle = exportAll();
    if (bundle.items.length === 0) {
      showToast('本机还没有可导出的数据');
      return;
    }
    const ok = downloadJson(exportFileName(), bundle);
    showToast(ok ? '已导出到你的下载目录' : '导出失败，请检查浏览器下载权限');
  }, [showToast]);

  const handleClearOne = useCallback(
    (entry: InventoryEntry) => {
      clearById(entry.id);
      refresh();
      showToast(`已清除「${entry.label}」`);
    },
    [refresh, showToast],
  );

  const handleClearAll = useCallback(() => {
    clearAll();
    // jxn-theme 也被清掉了，用系统主题复位 <html>.dark，避免 DOM 与存储不一致
    applyTheme(getSystemTheme());
    refresh();
    showToast('已清除全部数据');
  }, [refresh, showToast]);

  const allEmpty = entries.every((e) => e.empty);

  return (
    <AppShell title="隐私中心" onBack={() => navigate(-1)}>
      <div className="page-scroll">
        <div className="page-pad">
          <div className="privacy-note">
            吉小农记住的所有内容都只存在这台设备的浏览器里，不会上传服务器，也不会同步到你的其他设备。
            换设备、换浏览器或清空浏览器数据后，这些内容会一并消失。
          </div>

          <div className="section">
            <div className="section-label">本机存了什么</div>
            <div className="storage-list">
              {entries.map((entry) => (
                <StorageRow
                  key={entry.id}
                  entry={entry}
                  onClear={() => handleClearOne(entry)}
                />
              ))}
            </div>
          </div>

          <div className="section">
            <div className="section-label">带走你的数据</div>
            <button
              type="button"
              className="btn btn-quiet btn-block"
              onClick={handleExport}
              disabled={allEmpty}
            >
              <Icon name="Download" size="button" />
              导出全部数据（JSON）
            </button>
            <div className="meta-note" style={{ marginTop: 'var(--space-2)' }}>
              导出过程完全在本机完成，不会发起任何网络请求。文件可以直接用文本编辑器打开。
            </div>
          </div>

          <div className="section">
            <div className="section-label">清除</div>
            <DangerConfirmButton
              label="清除全部数据"
              confirmLabel="确定清除全部数据？此操作不可撤销"
              disabled={allEmpty}
              className="btn-block-danger"
              onConfirm={handleClearAll}
            />
            <div className="meta-note" style={{ marginTop: 'var(--space-2)' }}>
              会一并清掉档案、记忆、模块开关、对话记录与主题偏好，清除后应用回到初次打开的状态。
            </div>
          </div>

          {toastNode}
        </div>
      </div>
    </AppShell>
  );
}
