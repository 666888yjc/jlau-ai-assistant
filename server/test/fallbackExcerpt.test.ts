import { describe, it, expect } from 'vitest';
import { formatKbExcerpt, cleanExcerptBody } from '../src/llm/siliconflow';

describe('formatKbExcerpt（降级摘录清理）', () => {
  it('去掉模板元信息行、分隔线与首行标题，保留可读正文', () => {
    const context = [
      '【周边美食与餐厅指南】',
      '# 周边美食与餐厅指南',
      '主题: 周边美食与餐厅（食）',
      '更新日期: 2026-07-30',
      '适用对象: 吉林农业大学新生',
      '来源: QQ 美食',
      '---',
      '校门口小吃街是新生聚餐首选，人均 30 元左右。',
      '',
      '【食堂评分】',
      '## 1. 评分规则',
      '重要提示: 人均价为参考，以到店为准。',
      '三食堂麻辣香锅口碑最好。',
    ].join('\n');

    const out = formatKbExcerpt(context);
    // 元信息与分隔线被清掉
    expect(out).not.toContain('主题:');
    expect(out).not.toContain('更新日期:');
    expect(out).not.toContain('适用对象:');
    expect(out).not.toContain('来源:');
    expect(out).not.toContain('---');
    // 标题块渲染、正文与小标题保留
    expect(out).toContain('▸ 周边美食与餐厅指南');
    expect(out).toContain('校门口小吃街是新生聚餐首选，人均 30 元左右。');
    expect(out).toContain('## 1. 评分规则');
    expect(out).toContain('三食堂麻辣香锅口碑最好。');
    // 重要提示对用户有用，保留
    expect(out).toContain('重要提示: 人均价为参考，以到店为准。');
  });

  it('cleanExcerptBody：只删元信息行，正文原样保留', () => {
    const body = [
      '# 标题',
      '主题: 交通',
      '更新日期: 2026-07-30',
      '---',
      '正文第一行。',
      '',
      '正文第二行。',
    ].join('\n');
    const out = cleanExcerptBody(body);
    expect(out).toBe('正文第一行。\n\n正文第二行。');
  });
});
