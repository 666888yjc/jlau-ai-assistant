export interface SseEvent {
  event: string;
  data: any;
}

/** 解析 SSE 文本流为事件数组（按空行 \n\n 分块）。 */
export function parseSSE(text: string): SseEvent[] {
  const out: SseEvent[] = [];
  for (const block of text.split('\n\n')) {
    if (!block.trim()) continue;
    let event = '';
    let data: any = undefined;
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) {
        const raw = line.slice(5).trim();
        if (raw) {
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
        }
      }
    }
    if (event) out.push({ event, data });
  }
  return out;
}
