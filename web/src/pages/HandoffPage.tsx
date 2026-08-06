import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/NavBar';
import { Icon } from '../components/Icon';
import { Illustration } from '../components/Illustration';
import { Toast } from '../components/Toast';
import { AppFooter } from '../components/AppFooter';
import { postHumanHandoff } from '../lib/api';

const XIAOGONG_PHONE = '0431-84532980';

/**
 * 转人工页。
 * 改动要点：把「一张浮起介绍卡 + 两块浮起联系人卡 + 一坨表单」拆成有层级的分区——
 * 联系人是「现在就能用」的即时通道，表单是「留资等回访」的异步通道，
 * 两者用分区标签和发丝线分开，用户不必读完全部才知道该走哪条。
 */
export function HandoffPage() {
  const navigate = useNavigate();
  const [college, setCollege] = useState('');
  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copyText = (text: string) => {
    if (navigator.clipboard) void navigator.clipboard.writeText(text);
  };

  const submit = async () => {
    if (!question.trim()) {
      setInvalid(true);
      setError('请填写你的问题描述');
      return;
    }
    setInvalid(false);
    setError(null);
    setSubmitting(true);
    try {
      await postHumanHandoff({
        scenario_id: 'baodao',
        question: question.trim(),
        contact: college.trim() || undefined,
      });
      setSubmitted(true);
    } catch {
      setError('提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell title="转人工 / 联系学工" onBack={() => navigate('/chat?scenario=baodao')}>
      <div className="page-scroll">
        <div className="page-pad">
          <div className="intro-block">
            <Illustration name="handoff" width={112} />
            <div className="intro-title">没有解决你的问题？</div>
            <div className="intro-desc">
              可直接联系学工处或辅导员；不着急的话，也可以留下问题由学长学姐跟进处理。
            </div>
          </div>

          <div className="section">
            <div className="section-label">学工处（学生工作部）</div>
            <div className="contact-row">
              <span className="contact-ico">
                <Icon name="Phone" size="inline" />
              </span>
              <div className="contact-main">
                <span className="contact-name">{XIAOGONG_PHONE}</span>
                <span className="contact-sub">工作日 8:30–11:30 / 14:00–17:00</span>
              </div>
              <a className="contact-action" href={`tel:${XIAOGONG_PHONE}`}>
                拨打
              </a>
            </div>
          </div>

          <div className="section">
            <div className="section-label">辅导员（所在学院学工办）</div>
            <div className="contact-row">
              <span className="contact-ico">
                <Icon name="HelpCircle" size="inline" />
              </span>
              <div className="contact-main">
                <span className="contact-name">联系所在学院学工办</span>
                <span className="contact-sub">学院分配以录取专业为准，可到校后查询</span>
              </div>
              <button
                className="contact-action"
                type="button"
                onClick={() => copyText('联系所在学院学工办')}
              >
                复制
              </button>
            </div>
          </div>

          <div className="section">
            <div className="section-label">留资转人工（选填）</div>
            <div className="field-stack">
              <input
                className="form-input"
                placeholder="你的学院 / 专业（选填）"
                value={college}
                onChange={(e) => setCollege(e.target.value)}
                aria-label="学院或专业"
              />
              <textarea
                className={invalid ? 'form-textarea invalid' : 'form-textarea'}
                placeholder="描述你的问题…"
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  if (invalid && e.target.value.trim()) setInvalid(false);
                }}
                aria-label="问题描述"
              />
            </div>

            {error && <p className="form-error">{error}</p>}

            <div className="submit-row">
              <button
                className="btn btn-primary btn-block"
                type="button"
                onClick={submit}
                disabled={submitting}
              >
                {submitting ? (
                  <Icon name="LoaderCircle" size="button" className="spin" />
                ) : (
                  <>
                    <Icon name="Send" size="button" /> 提交并转人工
                  </>
                )}
              </button>
            </div>

            {submitted && <Toast>已提交，学工处会尽快与你联系</Toast>}
          </div>

          <div className="section">
            <AppFooter />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
