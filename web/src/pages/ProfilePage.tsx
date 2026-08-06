// 学生档案 + 关于我。
// ------------------------------------------------------------------
// 档案三项（昵称 / 专业 / 年级）与记忆列表都只落本机 localStorage，
// 不参与任何网络请求 —— 它们唯一的用途是让对话空态的问候语更贴人。
//
// 用色配额：--accent 实色 2 处（年级选中 pill + 保存 CTA）；--grain 1 处（brand-rule）。
// ------------------------------------------------------------------

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/NavBar';
import { DangerConfirmButton } from '../components/DangerConfirmButton';
import { FormRow, PillRadio } from '../components/FormRow';
import { Icon } from '../components/Icon';
import { Mascot } from '../components/Mascot';
import { NoteImportPanel } from '../components/NoteImportPanel';
import { useToast } from '../components/Toast';
import {
  addMemory,
  isMemoryTextTruncated,
  readMemory,
  readProfile,
  removeMemory,
  writeProfile,
} from '../lib/profile';
import type { MemoryAddResult } from '../lib/profile';
import {
  GRADE_OPTIONS,
  MEMORY_MAX,
  MEMORY_TEXT_MAX,
  PROFILE_MAJOR_MAX,
  PROFILE_NICKNAME_MAX,
} from '../types/local';
import type { Grade, MemoryItem } from '../types/local';

/** 五种写入结果对应的用户可读提示（§2.9） */
export function memoryToastText(result: MemoryAddResult, truncated: boolean): string {
  switch (result) {
    case 'ok':
      return truncated ? `太长啦，已保留前 ${MEMORY_TEXT_MAX} 字` : '已记住';
    case 'empty':
      return '内容是空的，先写点什么吧';
    case 'duplicate':
      return '这条已经记住啦';
    case 'full':
      return `记忆已满 ${MEMORY_MAX} 条，先删几条吧`;
    case 'storage-failed':
    default:
      return '保存失败，可能是浏览器隐私模式';
  }
}

export function ProfilePage() {
  const navigate = useNavigate();
  const { toastNode, showToast } = useToast();

  const [initial] = useState(() => readProfile());
  const [nickname, setNickname] = useState<string>(initial.nickname);
  const [major, setMajor] = useState<string>(initial.major);
  const [grade, setGrade] = useState<Grade>(initial.grade);

  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>(() => readMemory().items);
  const [draft, setDraft] = useState<string>('');

  const refreshMemory = useCallback(() => {
    setMemoryItems(readMemory().items);
  }, []);

  const handleSave = useCallback(() => {
    const ok = writeProfile({ nickname, major, grade });
    if (!ok) {
      showToast('保存失败，可能是浏览器隐私模式');
      return;
    }
    // 回读一次，让输入框展示真正落盘的（可能已被截断的）值
    const saved = readProfile();
    setNickname(saved.nickname);
    setMajor(saved.major);
    setGrade(saved.grade);
    showToast('已保存');
  }, [nickname, major, grade, showToast]);

  const handleAddMemory = useCallback(() => {
    const truncated = isMemoryTextTruncated(draft);
    const result = addMemory(draft, 'manual');
    showToast(memoryToastText(result, truncated));
    if (result === 'ok') {
      setDraft('');
      refreshMemory();
    }
  }, [draft, showToast, refreshMemory]);

  const handleRemoveMemory = useCallback(
    (id: string) => {
      removeMemory(id);
      refreshMemory();
      showToast('已删除');
    },
    [refreshMemory, showToast],
  );

  const canAdd = draft.trim().length > 0 && memoryItems.length < MEMORY_MAX;

  return (
    <AppShell title="学生档案" onBack={() => navigate(-1)}>
      <div className="page-scroll">
        <div className="page-pad">
          <div className="intro-block">
            <Mascot size="lg" expression="happy" label="吉小农" />
            <div className="brand-rule" />
            <div className="intro-title">让吉小农更懂你</div>
            <div className="intro-desc">
              下面这些内容只存在你这台设备上，不会上传，也不会出现在提问里。留空也完全可以用。
            </div>
          </div>

          <div className="section">
            <div className="section-label">基本信息</div>
            <FormRow label="昵称" htmlFor="profile-nickname">
              <input
                id="profile-nickname"
                className="form-input"
                type="text"
                value={nickname}
                maxLength={PROFILE_NICKNAME_MAX}
                placeholder={`怎么称呼你（${PROFILE_NICKNAME_MAX} 字以内）`}
                onChange={(e) => setNickname(e.target.value)}
              />
            </FormRow>
            <FormRow label="专业" htmlFor="profile-major">
              <input
                id="profile-major"
                className="form-input"
                type="text"
                value={major}
                maxLength={PROFILE_MAJOR_MAX}
                placeholder={`比如 动物医学（${PROFILE_MAJOR_MAX} 字以内）`}
                onChange={(e) => setMajor(e.target.value)}
              />
            </FormRow>
            <FormRow label="年级">
              <PillRadio
                options={GRADE_OPTIONS}
                value={grade}
                groupLabel="年级"
                onChange={(next) => setGrade(next === grade ? '' : next)}
              />
            </FormRow>
            <div className="meta-note" style={{ marginTop: 'var(--space-2)' }}>
              年级再点一次可取消选择。
            </div>
          </div>

          <div className="section">
            <div className="section-label">
              关于我（{memoryItems.length} / {MEMORY_MAX}）
            </div>
            <div className="intro-desc">
              记下一些小事，吉小农打招呼时会提一句。比如「我不太能吃辣」。
            </div>

            <div className="memory-add">
              <input
                className="form-input"
                type="text"
                value={draft}
                maxLength={MEMORY_TEXT_MAX}
                placeholder={`写一条关于你的小事（${MEMORY_TEXT_MAX} 字以内）`}
                aria-label="新增一条关于我的记忆"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canAdd) handleAddMemory();
                }}
              />
              <button
                type="button"
                className="memory-add-btn"
                disabled={!canAdd}
                onClick={handleAddMemory}
                aria-label="添加这条记忆"
              >
                <Icon name="Plus" size="button" />
              </button>
            </div>

            {memoryItems.length === 0 ? (
              <div className="meta-note" style={{ marginTop: 'var(--space-3)' }}>
                还没有记录。你也可以在对话里点自己消息下方的「记住这条」。
              </div>
            ) : (
              <div className="memory-list" style={{ marginTop: 'var(--space-2)' }}>
                {memoryItems.map((item) => (
                  <div className="memory-row" key={item.id}>
                    <span className="memory-text">{item.text}</span>
                    <button
                      type="button"
                      className="memory-del"
                      aria-label="删除这条记忆"
                      onClick={() => handleRemoveMemory(item.id)}
                    >
                      <Icon name="X" size="inline" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <NoteImportPanel
            remaining={MEMORY_MAX - memoryItems.length}
            onImported={refreshMemory}
            showToast={showToast}
          />

          <div className="section">
            <div className="section-label">清理</div>
            <DangerConfirmButton
              label="清空全部记忆"
              confirmLabel="确定清空全部记忆？"
              disabled={memoryItems.length === 0}
              className="btn-block-danger"
              onConfirm={() => {
                for (const item of memoryItems) removeMemory(item.id);
                refreshMemory();
                showToast('已清空全部记忆');
              }}
            />
            <div className="meta-note" style={{ marginTop: 'var(--space-2)' }}>
              想查看或导出全部本机数据，去
              <button
                type="button"
                className="btn-ghost"
                onClick={() => navigate('/privacy')}
                style={{ padding: '0 var(--space-1)' }}
              >
                隐私中心
              </button>
            </div>
          </div>

          {toastNode}
        </div>
      </div>

      <div className="page-cta">
        <button className="btn btn-primary btn-block" type="button" onClick={handleSave}>
          保存
        </button>
      </div>
    </AppShell>
  );
}
