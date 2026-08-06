// 绩点估算模块页。
// ------------------------------------------------------------------
// 课程表存本机 localStorage（key jxn-gpa），不上传、不跨设备
// （PRD-P2-03 AC①：隐私中心必须出现 2 个新条目之一）。
//
// 计算口径：按学分加权平均原始分与加权绩点，换算表住在 modules/gpa/data.ts
// （PRD-P2-03 §5 Q2 单点可替换）。除零 / 脏数据由 lib/gpa.ts 的 calcGpa 兜底，
// 无法计算时页面渲染 '--'，绝不出现 NaN（AC④）。
//
// 用色配额：结果横幅用唯一的 --grain-soft 底；--accent 仅用于「添加课程」主按钮。
// ------------------------------------------------------------------

import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/NavBar';
import { Icon } from '../../components/Icon';
import { FormRow } from '../../components/FormRow';
import { DangerConfirmButton } from '../../components/DangerConfirmButton';
import { useToast } from '../../components/Toast';
import {
  GPA_CREDIT_MAX,
  GPA_CREDIT_MIN,
  GPA_CREDIT_STEP,
  GPA_DECIMALS,
  GPA_EMPTY_DESC,
  GPA_EMPTY_TITLE,
  GPA_EMPTY_NAME_HINT,
  GPA_FULL_HINT,
  GPA_INVALID_CREDIT_HINT,
  GPA_INVALID_SCORE_HINT,
  GPA_SAVED_HINT,
  GPA_SCALE_DISCLAIMER,
  GPA_SCALE_NAME,
  GPA_SCORE_MAX,
  GPA_SCORE_MIN,
  GPA_STORAGE_FAILED_HINT,
  GPA_REMOVED_HINT,
  GPA_CLEARED_HINT,
} from '../../modules/gpa/data';
import type { GpaCourse } from '../../types/local';
import {
  addGpaCourse,
  calcGpa,
  clearGpaCourses,
  formatCredit,
  formatGpaNumber,
  readGpaCourses,
  removeGpaCourse,
  scoreToPoint,
} from '../../lib/gpa';

export function GpaModulePage() {
  const navigate = useNavigate();
  const { toastNode, showToast } = useToast();

  const [name, setName] = useState('');
  const [credit, setCredit] = useState('');
  const [score, setScore] = useState('');
  const [courses, setCourses] = useState<GpaCourse[]>(() => readGpaCourses());

  const reload = useCallback(() => {
    setCourses(readGpaCourses());
  }, []);

  const result = useMemo(() => calcGpa(courses), [courses]);

  const handleAdd = useCallback(() => {
    const creditNum = Number(credit);
    const scoreNum = Number(score);
    const res = addGpaCourse({ name: name.trim(), credit: creditNum, score: scoreNum });
    if (res === 'ok') {
      showToast(GPA_SAVED_HINT);
      setName('');
      setCredit('');
      setScore('');
      reload();
      return;
    }
    if (res === 'empty') showToast(GPA_EMPTY_NAME_HINT);
    else if (res === 'invalid-credit') showToast(GPA_INVALID_CREDIT_HINT);
    else if (res === 'invalid-score') showToast(GPA_INVALID_SCORE_HINT);
    else if (res === 'full') showToast(GPA_FULL_HINT);
    else if (res === 'storage-failed') showToast(GPA_STORAGE_FAILED_HINT);
  }, [name, credit, score, showToast, reload]);

  const handleRemove = useCallback(
    (id: string) => {
      if (removeGpaCourse(id)) {
        showToast(GPA_REMOVED_HINT);
        reload();
      }
    },
    [showToast, reload],
  );

  const handleClearAll = useCallback(() => {
    if (clearGpaCourses()) {
      showToast(GPA_CLEARED_HINT);
      reload();
    }
  }, [showToast, reload]);

  return (
    <AppShell title="绩点估算" onBack={() => navigate(-1)}>
      <div className="page-scroll">
        <div className="page-pad">
          <div className="screen-header">
            <div className="screen-title">绩点估算</div>
            <div className="screen-sub">填上学分和成绩，自动帮你算加权绩点。</div>
          </div>

          <div className="section">
            <div className="gpa-banner">
              <div className="gpa-banner-grid">
                <div className="gpa-metric">
                  <div className="gpa-metric-label">加权平均分</div>
                  <div className="gpa-metric-num">{formatGpaNumber(result.weightedScore, GPA_DECIMALS)}</div>
                </div>
                <div className="gpa-metric">
                  <div className="gpa-metric-label">加权平均绩点</div>
                  <div className="gpa-metric-num">{formatGpaNumber(result.weightedGpa, GPA_DECIMALS)}</div>
                </div>
                <div className="gpa-metric">
                  <div className="gpa-metric-label">总学分</div>
                  <div className="gpa-metric-num">{formatCredit(result.totalCredit)}</div>
                </div>
              </div>
              <div className="gpa-scale-name">{GPA_SCALE_NAME}</div>
              <div className="gpa-banner-sub">按学分加权平均</div>
            </div>
          </div>

          <div className="section">
            <div className="section-label">添加课程</div>
            <form
              className="gpa-add"
              onSubmit={(e) => {
                e.preventDefault();
                handleAdd();
              }}
            >
              <FormRow label="课程" htmlFor="gpa-name">
                <input
                  id="gpa-name"
                  className="form-input"
                  placeholder="如 高等数学"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </FormRow>
              <FormRow label="学分" htmlFor="gpa-credit">
                <input
                  id="gpa-credit"
                  className="form-input"
                  type="number"
                  inputMode="decimal"
                  min={GPA_CREDIT_MIN}
                  max={GPA_CREDIT_MAX}
                  step={GPA_CREDIT_STEP}
                  placeholder="0–20"
                  value={credit}
                  onChange={(e) => setCredit(e.target.value)}
                />
              </FormRow>
              <FormRow label="成绩" htmlFor="gpa-score">
                <input
                  id="gpa-score"
                  className="form-input"
                  type="number"
                  inputMode="numeric"
                  min={GPA_SCORE_MIN}
                  max={GPA_SCORE_MAX}
                  step={1}
                  placeholder="0–100"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                />
              </FormRow>
              <div className="gpa-add-actions">
                <button type="submit" className="gpa-add-btn">
                  <Icon name="Plus" size="inline" />
                  添加课程
                </button>
              </div>
            </form>
          </div>

          <div className="section">
            <div className="section-label">课程（{courses.length}）</div>
            {courses.length > 0 ? (
              <>
                <div className="gpa-head">
                  <span className="gpa-head-name">课程</span>
                  <span className="gpa-head-num">学分</span>
                  <span className="gpa-head-point">绩点</span>
                  <span className="gpa-head-gap" />
                </div>
                <div className="gpa-list">
                  {courses.map((c) => (
                    <div className="gpa-row" key={c.id}>
                      <span className="gpa-row-name">{c.name}</span>
                      <span className="gpa-row-num">{formatCredit(c.credit)}</span>
                      <span className="gpa-row-point">{formatGpaNumber(scoreToPoint(c.score), 1)}</span>
                      <button
                        type="button"
                        className="gpa-row-del"
                        aria-label={`删除 ${c.name}`}
                        onClick={() => handleRemove(c.id)}
                      >
                        <Icon name="Trash2" size="inline" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="screen-sub">{GPA_EMPTY_TITLE}</p>
                <p className="meta-note">{GPA_EMPTY_DESC}</p>
              </>
            )}
          </div>

          <div className="section">
            <DangerConfirmButton
              label="清空全部"
              confirmLabel="确定清空？"
              className="btn-block-danger"
              disabled={courses.length === 0}
              onConfirm={handleClearAll}
            />
            <div className="privacy-note">{GPA_SCALE_DISCLAIMER}</div>
          </div>
        </div>
      </div>
      {toastNode}
    </AppShell>
  );
}
