const BASE = 'https://yjc-d0gvjkk8tae8bf1ad-1411562898.ap-shanghai.app.tcloudbase.com';
try {
  const r = await fetch(`${BASE}/api/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario_id: 'baodao', message: '保研率是多少', history: [], conversation_id: 'test-'+Date.now() }),
  });
  console.log('HTTP', r.status);
  if (!r.ok) { console.log(await r.text().slice(0,200)); process.exit(0); }
  const reader = r.body.getReader();
  const dec = new TextDecoder('utf-8');
  let buf='', sources='';
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    buf += dec.decode(value,{stream:true});
    let idx;
    while ((idx=buf.indexOf('\n'))>=0) {
      const line = buf.slice(0,idx).trim(); buf=buf.slice(idx+1);
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim();
      if (!d || d==='[DONE]') continue;
      try { const ev=JSON.parse(d); if(ev.type==='sources') sources=JSON.stringify(ev.items); } catch {}
    }
  }
  console.log('SRC:', sources.slice(0,400));
} catch(e){ console.log('ERR', e.message); }
