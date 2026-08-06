// 失物招领模块页。
// ------------------------------------------------------------------
// 数据全部存本机 localStorage（key jxn-lostfound），不上传、不跨设备
// （PRD-P2-02 AC①：隐私中心必须出现 2 个新条目之一）。
//
// 「类型」用文字 + 2px 左边框双通道区分（红=我丢了 / 米色=我捡到），
// 已解决时左边框转灰、徽标改为「已解决」——不靠颜色单通道（PRD-P2-02 AC②）。
//
// 已解决切换是 32px 图标按钮（.lf-act），删除是就地二次确认危险按钮（.danger-btn）。
// ------------------------------------------------------------------

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/NavBar';
import { Icon } from '../../components/Icon';
import { FormRow, PillRadio } from '../../components/FormRow';
import { DangerConfirmButton } from '../../components/DangerConfirmButton';
import { useToast } from '../../components/Toast';
import {
  LOSTFOUND_KIND_LABEL,
  LOSTFOUND_KIND_OPTIONS,
  LOSTFOUND_PLACEHOLDER,
  LOSTFOUND_PRIVACY_NOTE,
  LOSTFOUND_SAVED_HINT,
  LOSTFOUND_EMPTY_TITLE,
  LOSTFOUND_EMPTY_DESC,
  LOSTFOUND_EMPTY_TITLE_HINT,
  LOSTFOUND_FULL_HINT,
  LOSTFOUND_STORAGE_FAILED_HINT,
  LOSTFOUND_REMOVED_HINT,
  LOSTFOUND_CLEARED_HINT,
  badgeLabel,
  formatMonthDay,
  kindFromLabel,
} from '../../modules/lostfound/data';
import type { LostFoundKind, LostFoundStatus } from '../../types/local';
import {
  addLostFoundItem,
  clearLostFound,
  readLostFound,
  removeLostFoundItem,
  reopenLostFoundItem,
  resolveLostFoundItem,
  sortedLostFound,
  todayIso,
} from '../../lib/lostfound';

function LostFoundCard({
  item,
  onToggle,
  onRemove,
}: {
  item: LostFoundItemView;
  onToggle: (id: string, status: LostFoundStatus) => void;
  onRemove: (id: string) => void;
}) {
  const done = item.status === 'done';
  const kindClass = item.kind === 'lost' ? 'is-lost' : 'is-found';
  const cardClass = done ? `lf-card ${kindClass} is-done` : `lf-card ${kindClass}`;
  return (
    <div className={cardClass}>
      <div className="lf-card-top">
        <span className="lf-badge">{badgeLabel(item.kind, item.status)}</span>
        <span className="lf-title">{item.title}</span>
      </div>
      <div className="lf-meta">
        {item.place && <span className="lf-line">{item.place}</span>}
        <span className="lf-meta-date">{formatMonthDay(item.date)}</span>
        {item.contact && <span className="lf-line">{item.contact}</span>}
      </div>
      {item.note && <p className="lf-line">{item.note}</p>}
      <div className="lf-actions">
        <button
          type="button"
          className={done ? 'lf-act is-on' : 'lf-act'}
          aria-label={done ? '撤销已解决' : '标记为已解决'}
          onClick={() => onToggle(item.id, item.status)}
        >
          <Icon name="CheckCircle" size="inline" />
        </button>
        <DangerConfirmButton
          label="删除"
          confirmLabel="确定删除？"
          onConfirm={() => onRemove(item.id)}
        />
      </div>
    </div>
  );
}

export function LostFoundModulePage() {
  const navigate = useNavigate();
  const { toastNode, showToast } = useToast();

  const [kind, setKind] = useState<LostFoundKind>('lost');
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [date, setDate] = useState(() => todayIso());
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState(() => sortedLostFound(readLostFound().items));

  const reload = useCallback(() => {
    setItems(sortedLostFound(readLostFound().items));
  }, []);

  const handleAdd = useCallback(() => {
    const result = addLostFoundItem({ kind, title, place, date, contact, note });
    if (result === 'ok') {
      showToast(LOSTFOUND_SAVED_HINT);
      setTitle('');
      setPlace('');
      setContact('');
      setNote('');
      setDate(todayIso());
      reload();
      return;
    }
    if (result === 'empty') showToast(LOSTFOUND_EMPTY_TITLE_HINT);
    else if (result === 'full') showToast(LOSTFOUND_FULL_HINT);
    else if (result === 'storage-failed') showToast(LOSTFOUND_STORAGE_FAILED_HINT);
  }, [kind, title, place, date, contact, note, showToast, reload]);

  const handleToggle = useCallback(
    (id: string, status: LostFoundStatus) => {
      if (status === 'open') resolveLostFoundItem(id);
      else reopenLostFoundItem(id);
      reload();
    },
    [reload],
  );

  const handleRemove = useCallback(
    (id: string) => {
      if (removeLostFoundItem(id)) {
        showToast(LOSTFOUND_REMOVED_HINT);
        reload();
      }
    },
    [showToast, reload],
  );

  const handleClearAll = useCallback(() => {
    if (clearLostFound()) {
      showToast(LOSTFOUND_CLEARED_HINT);
      reload();
    }
  }, [showToast, reload]);

  return (
    <AppShell title="失物招领" onBack={() => navigate(-1)}>
      <div className="page-scroll">
        <div className="page-pad">
          <div className="screen-header">
            <div className="screen-title">失物招领</div>
            <div className="screen-sub">随手记一笔，别让线索溜走。</div>
          </div>

          <div className="section">
            <div className="section-label">记一笔</div>
            <form
              className="lf-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleAdd();
              }}
            >
              <FormRow label="类型">
                <PillRadio
                  options={LOSTFOUND_KIND_OPTIONS}
                  value={LOSTFOUND_KIND_LABEL[kind]}
                  onChange={(label) => setKind(kindFromLabel(label))}
                  groupLabel="记录类型"
                />
              </FormRow>
              <FormRow label="物品" htmlFor="lf-title">
                <input
                  id="lf-title"
                  className="form-input"
                  placeholder={LOSTFOUND_PLACEHOLDER.title}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </FormRow>
              <FormRow label="地点" htmlFor="lf-place">
                <input
                  id="lf-place"
                  className="form-input"
                  placeholder={LOSTFOUND_PLACEHOLDER.place}
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                />
              </FormRow>
              <FormRow label="日期" htmlFor="lf-date">
                <input
                  id="lf-date"
                  className="form-input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </FormRow>
              <FormRow label="联系方式" htmlFor="lf-contact">
                <input
                  id="lf-contact"
                  className="form-input"
                  placeholder={LOSTFOUND_PLACEHOLDER.contact}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
              </FormRow>
              <FormRow label="备注" htmlFor="lf-note">
                <input
                  id="lf-note"
                  className="form-input"
                  placeholder={LOSTFOUND_PLACEHOLDER.note}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </FormRow>
              <div className="lf-form-actions">
                <button type="submit" className="btn btn-quiet">
                  记一笔
                </button>
              </div>
            </form>
          </div>

          <div className="section">
            <div className="section-label">我的记录（{items.length}）</div>
            {items.length > 0 ? (
              <div className="lf-list">
                {items.map((item) => (
                  <LostFoundCard
                    key={item.id}
                    item={item}
                    onToggle={handleToggle}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            ) : (
              <>
                <p className="screen-sub">{LOSTFOUND_EMPTY_TITLE}</p>
                <p className="meta-note">{LOSTFOUND_EMPTY_DESC}</p>
              </>
            )}
          </div>

          <div className="section">
            <DangerConfirmButton
              label="清空全部"
              confirmLabel="确定清空？"
              className="btn-block-danger"
              disabled={items.length === 0}
              onConfirm={handleClearAll}
            />
            <div className="privacy-note">{LOSTFOUND_PRIVACY_NOTE}</div>
          </div>
        </div>
      </div>
      {toastNode}
    </AppShell>
  );
}

/** 视图层用到的条目形状（与 LostFoundItem 一致，仅在此处别名以明确职责） */
type LostFoundItemView = ReturnType<typeof readLostFound>['items'][number];
