const BASE = 'https://yjc-d0gvjkk8tae8bf1ad-1411562898.ap-shanghai.app.tcloudbase.com/api';
const tests = [
  { s:'baodao',  q: '新生报到要带什么材料', tag: '①报到·材料' },
  { s:'baodao',  q: '从学校怎么去长春西站', tag: '②地图·路线' },
  { s:'shenghuo',q: '学校周边有什么好吃的', tag: '③地图·周边' },
  { s:'kaoyan',  q: '保研需要什么条件',     tag: '④考研·保研' },
  { s:'baodao',  q: '我要转人工，有紧急问题', tag: '⑤转人工/fallback' },
  { s:'shenghuo',q: '学校快递站在哪里',     tag: '⑥生活·快递' },
  { s:'xuanke',  q: '怎么选课',             tag: '⑦选课·课业' },
];
for (const t of tests) {
  try {
    const r = await fetch(BASE + '/v1/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_id: t.s, message: t.q, history: [], conversation_id: 'audit-' + Date.now() }),
    });
    if (!r.ok) { console.log('\n[' + t.tag + '] HTTP ' + r.status); continue; }
    const reader = r.body.getReader(); const dec = new TextDecoder('utf-8');
    let buf='', sources='', answer='', types=[];
    while (true) {
      const {done,value}=await reader.read(); if (done) break;
      buf += dec.decode(value,{stream:true});
      let idx;
      while ((idx=buf.indexOf('\n'))>=0) {
        const line=buf.slice(0,idx).trim(); buf=buf.slice(idx+1);
        if (!line.startsWith('data:')) continue;
        const d=line.slice(5).trim(); if(!d||d==='[DONE]') continue;
        try { const ev=JSON.parse(d); types.push(ev.type);
          if(ev.type==='sources') sources=ev.items.map(function(i){return i.title;}).join(' / ');
          else if(ev.type==='token') answer+=ev.content;
          else if(ev.type==='error') answer+=' [ERROR:'+ev.message+']';
        } catch {}
      }
    }
    const mdStar = Math.round((answer.match(/\*\*/g)||[]).length/2);
    console.log('\n=== ' + t.tag + ' [事件:' + types.join(',') + '] ===');
    console.log('A:', (answer||'<空>').slice(0,180).replace(/\n/g,' '));
    console.log('SRC: ' + (sources||'无') + '  |  **星号数:' + mdStar);
  } catch(e){ console.log('\n[' + t.tag + '] ERR ' + e.message); }
}
