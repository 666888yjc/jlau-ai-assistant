/**
 * 合规脚注。
 * 字号/字色与全站三级说明文字对齐（--text-xs / --meta），
 * 位置由外层容器决定，组件自身不再撑额外的顶部外边距。
 */
export function AppFooter({ text, center = false }: { text?: string; center?: boolean }) {
  return (
    <p className={center ? 'compliance-footer center' : 'compliance-footer'}>
      {text ?? 'AI 生成内容仅供参考，重要事项以官方通知为准'}
    </p>
  );
}
