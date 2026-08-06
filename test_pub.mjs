const BASE = 'https://yjc-d0gvjkk8tae8bf1ad-1411562898.ap-shanghai.app.tcloudbase.com';
const questions = ['学校周边有什么好吃的', '从学校到长春西站怎么走', '保研率是多少', '新生报到要带什么材料'];
for (const q of questions) {
  try {
    const r = await fetch(`${BASE}/api/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_id: 'baodao', message: q, history: [], conversation_id: 'test-'+Date.now() }),
    });
    console.log(`\n=== Q: ${q}  [HTTP ${r.status}] ===`);
    if (!r.ok) { console.log('  !! 非 200'); const t = await r.text(); console.log(t.slice(0,300)); continue; }
    const reader = r.body.getReader();
    const dec = new TextDecoder('utf-8');
    let buf = '';
    let full = '';
    let sources = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const ev = JSON.parse(data);
          if (ev.type === 'token') full += ev.content;
          else if (ev.type === 'sources') sources = JSON.stringify(ev.items);
          else if (ev.type === 'error') full += ` [ERROR:${ev.message}]`;
        } catch {}
      }
    }
    console.log('  A: ' + full.slice(0, 260).replace(/\n/g, ' '));
    if (sources) console.log('  SRC: ' + sources.slice(0, 360));
  } catch (e) {
    console.log(`  !! 异常: ${e.message}`);
  }
}
