import { useMemo } from 'react';
import type { ReactNode } from 'react';

/**
 * 轻量 Markdown 渲染（零依赖手写解析，React 元素输出，杜绝 dangerouslySetInnerHTML 的 XSS 面）。
 * 覆盖聊天场景常用语法：标题(#/##/###)、无序列表(- / *)、有序列表(1.)、
 * 加粗(**)、斜体(*)、行内代码(`)、行内链接([t](url))、裸 URL(http/https)。
 * 其余一律按纯文本原样输出（含【】、～等中文标点），换行由 CSS white-space: pre-wrap 保留。
 *
 * XSS 策略：
 * - 全部内容以 React 文本节点/元素渲染，特殊字符由 React 自动转义；
 * - 链接 href 仅允许 http/https，其余协议（javascript: 等）降级为纯文本。
 */

interface BlockHeading {
  type: 'heading';
  level: 1 | 2 | 3;
  content: string;
}
interface BlockList {
  type: 'ul' | 'ol';
  items: string[];
}
interface BlockPara {
  type: 'p';
  lines: string[];
}
type Block = BlockHeading | BlockList | BlockPara;

/** 行内 token 匹配源：链接 | 加粗 | 行内代码 | 斜体 | 裸 URL（顺序即优先级） */
const INLINE_TOKEN_SOURCE =
  '\\[([^\\]]+)\\]\\(([^)]*)\\)' + // [文字](url)
  '|\\*\\*([^*]+)\\*\\*' + // **加粗**
  '|`([^`]+)`' + // `行内代码`
  '|\\*([^*]+)\\*' + // *斜体*
  '|(https?:\\/\\/[^\\s()（）【】。，,；;！!]+)'; // 裸 URL

/** 仅允许 http/https 链接；其余协议返回 null（不渲染 <a>） */
function safeHref(url: string): string | null {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

/** 块级解析：把多行文本切成 标题 / 无序列表 / 有序列表 / 段落 四种块 */
function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  const flush = () => {
    if (current) {
      blocks.push(current);
      current = null;
    }
  };
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, content: heading[2] });
      continue;
    }
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    if (ul) {
      if (!current || current.type !== 'ul') {
        flush();
        current = { type: 'ul', items: [] };
      }
      current.items.push(ul[1]);
      continue;
    }
    const ol = /^\s*(\d+)[.、)]\s+(.*)$/.exec(line);
    if (ol) {
      if (!current || current.type !== 'ol') {
        flush();
        current = { type: 'ol', items: [] };
      }
      current.items.push(ol[2]);
      continue;
    }
    if (!current || current.type !== 'p') {
      flush();
      current = { type: 'p', lines: [] };
    }
    current.lines.push(line);
  }
  flush();
  return blocks;
}

/** 行内解析：把单个块的内容渲染为 React 元素数组（递归支持加粗/斜体/链接内嵌） */
function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = new RegExp(INLINE_TOKEN_SOURCE, 'g');
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i++}`;
    const linkText: string | undefined = m[1];
    const linkUrl: string | undefined = m[2];
    const boldText: string | undefined = m[3];
    const codeText: string | undefined = m[4];
    const emText: string | undefined = m[5];
    const urlText: string | undefined = m[6];
    if (linkText !== undefined && linkUrl !== undefined) {
      const href = safeHref(linkUrl);
      if (href) {
        nodes.push(
          <a key={key} href={href} target="_blank" rel="noreferrer">
            {parseInline(linkText, key)}
          </a>,
        );
      } else {
        // 不安全的链接（非 http/https）：降级为纯文本，不渲染 <a>
        nodes.push(parseInline(`${linkText}（${linkUrl}）`, key));
      }
    } else if (boldText !== undefined) {
      nodes.push(<strong key={key}>{parseInline(boldText, key)}</strong>);
    } else if (codeText !== undefined) {
      nodes.push(<code key={key}>{codeText}</code>);
    } else if (emText !== undefined) {
      nodes.push(<em key={key}>{parseInline(emText, key)}</em>);
    } else if (urlText !== undefined) {
      const href = safeHref(urlText);
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer">
            {href}
          </a>
        ) : (
          urlText
        ),
      );
    } else {
      nodes.push(m[0]);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * 轻量 Markdown 文本组件：AI 气泡内容走此渲染，user / error 气泡不经过本组件。
 */
export function MarkdownText({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          const content = parseInline(block.content, `h${i}`);
          return block.level === 1 ? (
            <h1 key={i}>{content}</h1>
          ) : block.level === 2 ? (
            <h2 key={i}>{content}</h2>
          ) : (
            <h3 key={i}>{content}</h3>
          );
        }
        if (block.type === 'ul' || block.type === 'ol') {
          const Tag = block.type === 'ul' ? 'ul' : 'ol';
          return (
            <Tag key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{parseInline(item, `${block.type}${i}-${j}`)}</li>
              ))}
            </Tag>
          );
        }
        // 排除 heading / ul / ol 后，剩余必为段落块
        const para = block as BlockPara;
        return <p key={i}>{parseInline(para.lines.join('\n'), `p${i}`)}</p>;
      })}
    </>
  );
}
