import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { addMemoryBatch } from '../lib/profile';

interface NoteImportPanelProps {
  /** 剩余可导入条数（= MEMORY_MAX - 已用） */
  remaining: number;
  /** 导入成功后回调，父级据此刷新记忆列表 */
  onImported: () => void;
  /** 轻提示 */
  showToast: (msg: string) => void;
}

/**
 * 按换行 / 空行切分；去首尾空白；保留每行原文字。
 * 设计硬约束 D4：仅纯文本、不做任何语义解析，原文一字不改存入记忆。
 */
function splitNotes(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * 纯文本笔记导入（P1）。
 * 流程：粘贴 → 实时预览条数 → 二次确认 → addMemoryBatch 一次性写入。
 * 触顶时只导入前 N 条、已导入部分不回滚（架构 T5.6）。
 */
export function NoteImportPanel({ remaining, onImported, showToast }: NoteImportPanelProps) {
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState(false);

  const lines = useMemo(() => splitNotes(draft), [draft]);
  const lineCount = lines.length;
  const willImport = Math.min(lineCount, Math.max(remaining, 0));
  const empty = lineCount === 0;
  const capped = willImport < lineCount;

  const closeConfirm = () => setConfirming(false);

  const handleConfirm = () => {
    const result = addMemoryBatch(lines, 'note');
    if (result.added === 0) {
      showToast('没有可导入的内容（可能都已存在或记忆已满）');
    } else {
      const skippedNote = result.skipped > 0 ? `，跳过 ${result.skipped} 条` : '';
      showToast(`已导入 ${result.added} 条${skippedNote}`);
    }
    setDraft('');
    closeConfirm();
    onImported();
  };

  return (
    <div className="section">
      <div className="section-label">从笔记导入</div>
      <div className="intro-desc">
        把写好的纯文本笔记粘进来，每行一条，帮你存成本机记忆。只存文字、不做任何解析。
      </div>
      <textarea
        className="form-textarea"
        value={draft}
        rows={4}
        placeholder={'每行一条，例如：\n我不太能吃辣\n周三下午没课'}
        aria-label="粘贴纯文本笔记，每行一条"
        onChange={(e) => {
          setDraft(e.target.value);
          if (confirming) setConfirming(false);
        }}
      />

      {confirming ? (
        <div className="confirm-inline">
          <p className="meta-note">
            确认导入这 {willImport} 条？
            {capped && `（记忆已满，还有 ${lineCount - willImport} 条不会被导入）`}
          </p>
          <div className="confirm-actions">
            <button type="button" className="btn btn-ghost" onClick={closeConfirm}>
              再看看
            </button>
            <button type="button" className="btn btn-primary" onClick={handleConfirm}>
              确认导入
            </button>
          </div>
        </div>
      ) : (
        <div className="note-import-foot">
          <span className="meta-note">
            {empty ? '先写点内容' : `将导入 ${willImport} 条（剩余容量 ${remaining}）`}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={empty || remaining <= 0}
            onClick={() => setConfirming(true)}
          >
            <Icon name="Download" size="inline" /> 导入
          </button>
        </div>
      )}
    </div>
  );
}
