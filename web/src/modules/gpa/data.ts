// 绩点估算 · 静态常量（换算表的唯一事实源）
// ------------------------------------------------------------------
// PRD-P2-03 §5 Q2 的「占位标注 + 低成本替换」协议要求：
//   换算表必须作为独立导出的常量数组存放于本文件，
//   拿到官方口径后**只改这一个数组**，lib/gpa.ts 与页面代码零改动。
//
// 因此换算表定义在这里（最底层、零 import），由 lib/gpa.ts 引用并再导出，
// 不会形成环：data.ts（无依赖）← lib/gpa.ts ← GpaModulePage.tsx。
// ------------------------------------------------------------------

/** 换算表的一段：分数 ≥ min 即取 point（区间上界由上一段的 min 隐含） */
export interface GpaScaleSegment {
  min: number;
  point: number;
}

// 4.0 分段制换算表。
// ⚠️ [占位·未经吉林农业大学教务处核实] 采用国内高校通行的 4.0 分段口径。
// ⚠️ 必须保持 min 降序排列 —— scoreToPoint 依赖此顺序做「下界降序扫描」。
export const GPA_SCALE: readonly GpaScaleSegment[] = [
  { min: 90, point: 4.0 },
  { min: 85, point: 3.7 },
  { min: 82, point: 3.3 },
  { min: 78, point: 3.0 },
  { min: 75, point: 2.7 },
  { min: 72, point: 2.3 },
  { min: 68, point: 2.0 },
  { min: 64, point: 1.5 },
  { min: 60, point: 1.0 },
  { min: 0, point: 0 },
];

/** 算法名，结果区必须显式标注（PRD-P2-03 AC⑦） */
export const GPA_SCALE_NAME = '4.0 分段制';

/** 免责说明，页面底部必须展示（PRD-P2-03 AC⑦） */
export const GPA_SCALE_DISCLAIMER =
  '本页采用 4.0 分段制换算，仅供参考，实际绩点以教务处认定为准。课程数据只保存在这台设备上。';

/* ================================================================
   输入范围（PRD-P2-03 AC⑤）
   学分 0–20（允许 0.5 步长）；成绩 0–100。
   注意：学分允许为 0 —— AC④ 明确要求「所有课程学分填 0」时不出现 NaN，
   说明 0 学分是合法输入，由 calcGpa 的除零保护兜底，而不是在录入侧拦截。
   ================================================================ */
export const GPA_CREDIT_MIN = 0;
export const GPA_CREDIT_MAX = 20;
export const GPA_CREDIT_STEP = 0.5;
export const GPA_SCORE_MIN = 0;
export const GPA_SCORE_MAX = 100;

/** 学期标签候选。P0 恒为 ''（为 P1 PRD-P2-06 分组预留，守卫必须接受空串） */
export const GPA_TERMS: readonly string[] = [''];

/** 结果数字保留的小数位（PRD-P2-03 AC②） */
export const GPA_DECIMALS = 2;

/* ---------------- 文案（页面提示与 Toast） ---------------- */

export const GPA_EMPTY_TITLE = '还没有课程。';
export const GPA_EMPTY_DESC = '填上学分和成绩，自动帮你算加权绩点。';

export const GPA_EMPTY_NAME_HINT = '课程名称不能为空。';
export const GPA_INVALID_CREDIT_HINT = '学分需在 0–20 之间。';
export const GPA_INVALID_SCORE_HINT = '成绩需在 0–100 之间。';
export const GPA_FULL_HINT = '课程已达上限，先删几门再添加。';
export const GPA_STORAGE_FAILED_HINT = '这台设备的存储空间写不进去了，清理一些数据再试。';
export const GPA_SAVED_HINT = '已添加。';
export const GPA_REMOVED_HINT = '已删除。';
export const GPA_CLEARED_HINT = '已清空全部课程。';
