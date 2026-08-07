import { ErrorCode } from '../errors';
import { config } from '../config';
import type { ChatInput } from '../coze/client';
import type { FeedbackSnapshot } from '../types';

type Fail = { ok: false; code: number; message: string };

function fail(code: number, message: string): Fail {
  return { ok: false, code, message };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** POST /api/v1/chat 请求体校验（openapi ChatRequest）。 */
export function validateChatBody(body: unknown): { ok: true; value: ChatInput } | Fail {
  if (!isObject(body)) return fail(ErrorCode.INVALID_REQUEST, '请求体必须为 JSON 对象');

  const { scenario_id, message, conversation_id, history } = body;

  if (typeof scenario_id !== 'string' || scenario_id.trim() === '') {
    return fail(ErrorCode.INVALID_REQUEST, '缺少必填字段 scenario_id');
  }
  if (typeof message !== 'string' || message.length < 1 || message.length > 2000) {
    return fail(ErrorCode.INVALID_REQUEST, 'message 必须为 1-2000 字字符串');
  }
  if (typeof conversation_id !== 'string' || conversation_id.trim() === '') {
    return fail(ErrorCode.INVALID_REQUEST, '缺少必填字段 conversation_id');
  }

  let safeHistory: ChatInput['history'] = [];
  if (history !== undefined && history !== null) {
    if (!Array.isArray(history)) return fail(ErrorCode.INVALID_REQUEST, 'history 必须为数组');
    for (const h of history) {
      if (!isObject(h)) return fail(ErrorCode.INVALID_REQUEST, 'history 元素必须为对象');
      if (h.role !== 'user' && h.role !== 'assistant') {
        return fail(ErrorCode.INVALID_REQUEST, 'history.role 仅支持 user / assistant');
      }
      if (typeof h.content !== 'string') {
        return fail(ErrorCode.INVALID_REQUEST, 'history.content 必须为字符串');
      }
    }
    safeHistory = history as ChatInput['history'];
  }

  return {
    ok: true,
    value: { scenario_id, message, conversation_id, history: safeHistory },
  };
}

export interface FeedbackValue {
  message_id: string;
  type: 'helpful' | 'reported';
  note: string | null;
  scenario_id?: string;
  /** A-2：可选快照；不传/传 null 时旧路径逐字节不变（AC-A2.2） */
  snapshot?: FeedbackSnapshot | null;
}

/** POST /api/v1/feedback 请求体校验（openapi FeedbackRequest）。 */
export function validateFeedbackBody(body: unknown): { ok: true; value: FeedbackValue } | Fail {
  if (!isObject(body)) return fail(ErrorCode.INVALID_REQUEST, '请求体必须为 JSON 对象');

  const { message_id, type, note, scenario_id, snapshot } = body;

  if (typeof message_id !== 'string' || message_id.trim() === '') {
    return fail(ErrorCode.INVALID_REQUEST, '缺少必填字段 message_id');
  }
  if (type !== 'helpful' && type !== 'reported') {
    return fail(ErrorCode.INVALID_FEEDBACK_TYPE, '反馈类型非法，仅支持 helpful / reported');
  }

  let safeNote: string | null = null;
  if (note !== undefined && note !== null) {
    if (typeof note !== 'string' || note.length > 500) {
      return fail(ErrorCode.INVALID_REQUEST, 'note 必须为不超过 500 字的字符串');
    }
    safeNote = note;
  }

  let safeScenario: string | undefined;
  if (scenario_id !== undefined && scenario_id !== null) {
    if (typeof scenario_id !== 'string') {
      return fail(ErrorCode.INVALID_REQUEST, 'scenario_id 必须为字符串');
    }
    safeScenario = scenario_id;
  }

  // —— A-2 快照分支（后置追加，不改变上面既有字段的判定顺序与结果；架构 §7.4）——
  // 仅在「存在且非 null」时校验；缺省 → safeSnapshot 保持 null，行为与旧版一致。
  let safeSnapshot: FeedbackSnapshot | null = null;
  if (snapshot !== undefined && snapshot !== null) {
    if (!isObject(snapshot)) {
      return fail(ErrorCode.INVALID_REQUEST, 'snapshot 必须为对象');
    }
    const { question, answer } = snapshot;
    if (typeof question !== 'string' || typeof answer !== 'string') {
      return fail(ErrorCode.INVALID_REQUEST, 'snapshot 缺少 question/answer 字段');
    }
    if (question.length > config.admin.snapshotQuestionMax) {
      return fail(
        ErrorCode.SNAPSHOT_TOO_LONG,
        `快照 question 超过 ${config.admin.snapshotQuestionMax} 字符上限`,
      );
    }
    if (answer.length > config.admin.snapshotAnswerMax) {
      return fail(
        ErrorCode.SNAPSHOT_TOO_LONG,
        `快照 answer 超过 ${config.admin.snapshotAnswerMax} 字符上限`,
      );
    }
    safeSnapshot = { question, answer };
  }

  return {
    ok: true,
    value: { message_id, type, note: safeNote, scenario_id: safeScenario, snapshot: safeSnapshot },
  };
}

export interface HandoffValue {
  scenario_id: string;
  question: string;
  contact: string | null;
}

/** 隐私字段正则：手机号 / 18 位身份证（合规：contact 仅粗粒度标识）。 */
const PHONE_RE = /1[3-9]\d{9}/;
const ID_CARD_RE = /\d{17}[\dXx]/;

/** POST /api/v1/human-handoff 请求体校验（openapi HumanHandoffRequest）。 */
export function validateHandoffBody(body: unknown): { ok: true; value: HandoffValue } | Fail {
  if (!isObject(body)) return fail(ErrorCode.INVALID_REQUEST, '请求体必须为 JSON 对象');

  const { scenario_id, question, contact } = body;

  if (typeof scenario_id !== 'string' || scenario_id.trim() === '') {
    return fail(ErrorCode.INVALID_REQUEST, '缺少必填字段 scenario_id');
  }
  if (typeof question !== 'string' || question.length < 1 || question.length > 2000) {
    return fail(ErrorCode.INVALID_REQUEST, 'question 必须为 1-2000 字字符串');
  }

  let safeContact: string | null = null;
  if (contact !== undefined && contact !== null) {
    if (typeof contact !== 'string' || contact.length > 100) {
      return fail(ErrorCode.INVALID_REQUEST, 'contact 必须为不超过 100 字的字符串');
    }
    if (PHONE_RE.test(contact) || ID_CARD_RE.test(contact)) {
      return fail(ErrorCode.INVALID_REQUEST, 'contact 不得包含手机号或身份证号等隐私字段');
    }
    safeContact = contact;
  }

  return { ok: true, value: { scenario_id, question, contact: safeContact } };
}
