const API = 'https://yjc-d0gvjkk8tae8bf1ad-1411562898.ap-shanghai.app.tcloudbase.com/api/v1';
const WEB = 'https://yjc-d0gvjkk8tae8bf1ad-1411562898.tcloudbaseapp.com';

async function chat(q, sid){
  const r = await fetch(API + '/chat', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ scenario_id: sid, message: q, history: [], conversation_id: 'vr2-'+Date.now() }) });
  const reader = r.body.getReader(); const dec = new TextDecoder('utf-8');
  let buf='', ans='', srcs='', hasFallback=false, guessLen=null, contact='';
  while(true){ const {done,value}=await reader.read(); if(done) break;
    buf += dec.decode(value,{stream:true});
    let i; while((i=buf.indexOf('\n'))>=0){ const line=buf.slice(0,i).trim(); buf=buf.slice(i+1);
      if(!line.startsWith('data:')) continue; const d=line.slice(5).trim(); if(!d||d==='[DONE]') continue;
      try{ const ev=JSON.parse(d);
        if(ev.type==='token') ans+=ev.content;
        else if(ev.type==='sources') srcs=ev.items.map(x=>x.title).join(' / ');
        else if(ev.type==='fallback'){ hasFallback=true; guessLen=(ev.guesses||[]).length; contact=(ev.contact&&ev.contact.name)+' '+(ev.contact&&ev.contact.phone); }
      }catch{} } }
  return { ans, srcs, hasFallback, guessLen, contact };
}

// ① 转人工
const r1 = await chat('我要转人工，紧急情况', 'baodao');
console.log('=== ①转人工 ===');
console.log('A:', r1.ans.slice(0,150).replace(/\n/g,' '));
console.log('fallback:', r1.hasFallback, '| guesses数:', r1.guessLen, '| contact:', r1.contact, '| SRC:', r1.srcs||'无');

// ② 地图来源纯净
const r2 = await chat('从学校怎么去长春西站', 'baodao');
console.log('\n=== ②地图来源纯净 ===');
console.log('SRC:', r2.srcs);
console.log('  只含高德:', r2.srcs === '高德地图实时数据', '| 混入气候指南:', r2.srcs.includes('气候'));
console.log('A:', r2.ans.slice(0,120).replace(/\n/g,' '));

// ③ 前端产物
const html = await (await fetch(WEB + '/')).text();
const js = html.match(/assets\/[^"']+\.js/);
console.log('\n=== ③前端产物 ===');
console.log('JS:', js && js[0]);
if (js) {
  const jsc = await (await fetch(WEB + '/' + js[0])).text();
  console.log('  含 jxn-theme:', jsc.includes('jxn-theme'), '| 含 jxn-conv:', jsc.includes('jxn-conv'), '| 含 kexue:', jsc.includes('kexue'));
}

// ④ 常规回归
const r3 = await chat('保研率是多少', 'baodao');
console.log('\n=== ④常规回归·保研率 ===');
console.log('SRC:', r3.srcs);
