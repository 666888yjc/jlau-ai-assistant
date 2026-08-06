const BASE = 'https://yjc-d0gvjkk8tae8bf1ad-1411562898.ap-shanghai.app.tcloudbase.com/api';
const tests = [
  { q: '保研率是多少', tag: '①URL修正(应干净单链接)' },
  { q: '从学校到长春西站怎么走', tag: '②地图来源(首项应=高德地图实时数据)' },
  { q: '学校周边有什么好吃的', tag: '③空URL(应返回空串不报错)' },
  { q: '新生报到要带什么材料', tag: '④常规KB(来源应正常)' },
];
for (const t of tests) {
  try {
    const r = await fetch(`${BASE}/v1/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_id: 'baodao', message: t.q, history: [], conversation_id: 'verify-'+Date.now() }),
    });
    if (!r.ok) { console.log(`\n[${t.tag}] HTTP ${r.status}`); continue; }
    const reader = r.body.getReader(); const dec = new TextDecoder('utf-8');
    let buf='', sources='', status='';
    while (true) {
      const {done,value}=await reader.read(); if (done) break;
      buf += dec.decode(value,{stream:true});
      let idx;
      while ((idx=buf.indexOf('\n'))>=0) {
        const line=buf.slice(0,idx).trim(); buf=buf.slice(idx+1);
        if (!line.startsWith('data:')) continue;
        const d=line.slice(5).trim(); if(!d||d==='[DONE]') continue;
        try { const ev=JSON.parse(d);
          if(ev.type==='sources') sources=JSON.stringify(ev.items,null,0);
          else if(ev.type==='done'||ev.type==='finish') status=ev.type;
        } catch {}
      }
    }
    console.log(`\n=== ${t.tag} ===`);
    console.log('SRC:', (sources||'无').slice(0,360));
  } catch(e){ console.log(`\n[${t.tag}] ERR ${e.message}`); }
}
