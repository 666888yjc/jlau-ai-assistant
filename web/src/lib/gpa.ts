// 绩点估算（jxn-gpa）· 领域层
// ------------------------------------------------------------------
// 职责：
//   1. scoreToPoint 单点换算（换算表本身住在 modules/gpa/data.ts，本文件只引用 + 再导出）；
//   2. calcGpa 纯函数：脏数据过滤 + 加权平均分 / 加权绩点；
//   3. 课程表读写，上限 GPA_COURSE_MAX 门。
//
// 硬约束：
//   - 不直接碰 localStorage，一律经 lib/storage.ts；
//   - calcGpa 对任意输入（空数组 / NaN / 学分 0 / 全脏）都返回确定结果，
//     绝不产生 NaN / Infinity —— 无法计算时返回 null，由页面渲染占位文案。
// ------------------------------------------------------------------

import { EMPTY_GPA, GPA_COURSE_MAX, GPA_NAME_MAX, isGpaData } from '../types/local';
import type { GpaCourse, GpaData } from '../types/local';
import {
  GPA_CREDIT_MAX,
  GPA_CREDIT_MIN,
  GPA_SCALE,
  GPA_SCORE_MAX,
  GPA_SCORE_MIN,
} from '../modules/gpa/data';
import { KEY_GPA, readJson, writeJson } from './storage';

/* ================================================================
   1. 换算表（再导出，保持「单点可替换」）
   ================================================================ */

// 换算表定义在 modules/gpa/data.ts（PRD-P2-03 §5 Q2 协议）。
// 这里再导出一次，让调用方既可以从数据层拿，也可以从领域层拿，替换点仍只有一处。
export { GPA_SCALE, GPA_SCALE_NAME, GPA_SCALE_DISCLAIMER } from '../modules/gpa/data';
export type { GpaScaleSegment } from '../modules/gpa/data';

/**
 * 分数 → 单科绩点。
 * 用「下界降序扫描」而非 min/max 双边界：成绩未必是整数，
 * 双边界会让 89.5 这类值掉出所有区间而返回 undefined → NaN。
 * 任意有限数输入均返回确定点值，永不 undefined。
 */
export function scoreToPoint(score: number): number {
  if (!Number.isFinite(score)) return 0;
  for (const seg of GPA_SCALE) {
    if (score >= seg.min) return seg.point;
  }
  return 0;
}

/* ================================================================
   2. 计算
   ================================================================ */

export interface GpaResult {
  /** 参与计算的有效课程数（credit / score 均为有限数） */
  courseCount: number;
  /** 有效课程的学分之和（负学分按 0 计） */
  totalCredit: number;
  /** 加权平均原始分；无法计算时为 null */
  weightedScore: number | null;
  /** 加权平均绩点（4.0 制）；无法计算时为 null */
  weightedGpa: number | null;
}

/**
 * 加权绩点计算（纯函数，无副作用）。
 *
 * 过滤规则：credit 或 score 不是有限数的课程整条剔除（NaN / Infinity / undefined）。
 * 除零保护：有效课程为 0 门、或总学分为 0 时，两项结果均为 null（页面渲染 '--'）。
 */
export function calcGpa(courses: readonly GpaCourse[]): GpaResult {
  const valid = (courses ?? []).filter(
    (c) => c && Number.isFinite(c.credit) && Number.isFinite(c.score),
  );
  const totalCredit = valid.reduce((s, c) => s + (c.credit > 0 ? c.credit : 0), 0);
  if (valid.length === 0 || totalCredit === 0) {
    return { courseCount: valid.length, totalCredit, weightedScore: null, weightedGpa: null };
  }
  let sumScore = 0;
  let sumPoint = 0;
  for (const c of valid) {
    const w = c.credit > 0 ? c.credit : 0;
    sumScore += c.score * w;
    sumPoint += scoreToPoint(c.score) * w;
  }
  return {
    courseCount: valid.length,
    totalCredit,
    weightedScore: sumScore / totalCredit,
    weightedGpa: sumPoint / totalCredit,
  };
}

/* ================================================================
   3. 持久化
   ================================================================ */

/** 读取课程表；无数据 / 非法 JSON / 守卫不过一律回落空表 */
export function readGpaCourses(): GpaCourse[] {
  return readJson<GpaData>(KEY_GPA, isGpaData, EMPTY_GPA).courses;
}

/** 覆盖写入课程表；超过 GPA_COURSE_MAX 的部分截断（保留先录入的） */
export function writeGpaCourses(courses: readonly GpaCourse[]): boolean {
  const trimmed = courses.slice(0, GPA_COURSE_MAX);
  return writeJson(KEY_GPA, { version: 1, courses: trimmed } satisfies GpaData);
}

/** 新增结果；页面据此给出 Toast 文案 */
export type GpaAddResult = 'ok' | 'empty' | 'invalid-credit' | 'invalid-score' | 'full' | 'storage-failed';

/** 新增时页面提供的字段（id / createdAt / term 由本模块补齐） */
export interface GpaCourseInput {
  name: string;
  credit: number;
  score: number;
}

/** id 递增序号，避免同一毫秒内连续新增产生重复 id */
let gpaSeq = 0;

/** 学分是否落在 [GPA_CREDIT_MIN, GPA_CREDIT_MAX]（0 合法） */
export function isValidCredit(credit: number): boolean {
  return Number.isFinite(credit) && credit >= GPA_CREDIT_MIN && credit <= GPA_CREDIT_MAX;
}

/** 成绩是否落在 [GPA_SCORE_MIN, GPA_SCORE_MAX] */
export function isValidScore(score: number): boolean {
  return Number.isFinite(score) && score >= GPA_SCORE_MIN && score <= GPA_SCORE_MAX;
}

/**
 * 新增一门课程。
 * 校验顺序：课程名空白 → 学分越界 → 成绩越界 → 已满 → 写入。
 * 课程名超长不拒绝，截断到 GPA_NAME_MAX 字后照常写入。
 */
export function addGpaCourse(input: GpaCourseInput): GpaAddResult {
  const name = (typeof input.name === 'string' ? input.name : '').trim();
  if (name.length === 0) return 'empty';
  if (!isValidCredit(input.credit)) return 'invalid-credit';
  if (!isValidScore(input.score)) return 'invalid-score';

  const courses = readGpaCourses();
  if (courses.length >= GPA_COURSE_MAX) return 'full';

  gpaSeq += 1;
  const next: GpaCourse = {
    id: `gpa-${Date.now()}-${gpaSeq}`,
    name: name.length > GPA_NAME_MAX ? name.slice(0, GPA_NAME_MAX) : name,
    credit: input.credit,
    score: input.score,
    term: '',
    createdAt: Date.now(),
  };
  return writeGpaCourses([...courses, next]) ? 'ok' : 'storage-failed';
}

/** 删除一门课程；id 不存在时静默返回 false */
export function removeGpaCourse(id: string): boolean {
  const courses = readGpaCourses();
  const next = courses.filter((c) => c.id !== id);
  if (next.length === courses.length) return false;
  return writeGpaCourses(next);
}

/** 清空课程表 */
export function clearGpaCourses(): boolean {
  return writeGpaCourses([]);
}

/** 数字 → 固定小数位字符串；null 渲染占位符 '--'（避免页面出现 NaN） */
export function formatGpaNumber(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '--';
  return value.toFixed(digits);
}

/** 学分展示：整数不带小数点，0.5 步长保留一位（4 → '4'，4.5 → '4.5'） */
export function formatCredit(credit: number): string {
  if (!Number.isFinite(credit)) return '--';
  return Number.isInteger(credit) ? String(credit) : credit.toFixed(1);
}
