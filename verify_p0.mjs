const API = 'https://yjc-d0gvjkk8tae8bf1ad-1411562898.ap-shanghai.app.tcloudbase.com/api/v1';
const WEB = 'https://yjc-d0gvjkk8tae8bf1ad-1411562898.tcloudbaseapp.com';

// ① 地图问题：应含多方案真实数据、不编造
async function chat(q, sid){
  const r = await fetch(API + '/chat', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ scenario_id: sid, message: q, history: [], conversation_id: 'vp0-'+Date.now() }) });
  const reader = r.body.getReader(); const dec = new TextDecoder('utf-8');
  let buf='', ans='', srcs='';
  while(true){ const {done,value}=await reader.read(); if(done) break;
    buf += dec.decode(value,{stream:true});
    let i; while((i=buf.indexOf('\n'))>=0){ const line=buf.slice(0,i).trim(); buf=buf.slice(i+1);
      if(!line.startsWith('data:')) continue; const d=line.slice(5).trim(); if(!d||d==='[DONE]') continue;
      try{ const ev=JSON.parse(d); if(ev.type==='token') ans+=ev.content; else if(ev.type==='sources') srcs=ev.items.map(x=>x.title).join(' / '); }catch{} } }
  return { ans, srcs };
}

const r1 = await chat('从学校怎么去长春西站', 'baodao');
console.log('=== ①地图·多方案 ===');
console.log('A:', r1.ans.slice(0, 420).replace(/\n/g,' '));
console.log('  含【步行方案】:', r1.ans.includes('步行'), '| 含【公交方案】:', r1.ans.includes('公交'), '| 含【驾车方案】:', r1.ans.includes('驾车'));
console.log('  含编造 103路:', r1.ans.includes('103'), '| 含编造 159路:', r1.ans.includes('159'));
console.log('SRC:', r1.srcs);

// ② 前端产物：新 JS 应含 xuanke / markdown 渲染
const html = await (await fetch(WEB + '/')).text();
const js = html.match(/assets\/[^"']+\.js/);
console.log('\n=== ②前端产物 ===');
console.log('JS:', js && js[0]);
if (js) {
  const jsc = await (await fetch(WEB + '/' + js[0])).text();
  console.log('  含 xuanke:', jsc.includes('xuanke'), '| 含 kexue:', jsc.includes('kexue'));
  console.log('  含 markdown 渲染痕迹(noreferrer):', jsc.includes('noreferrer'));
}

// ③ 常规回归
const r2 = await chat('保研率是多少', 'baodao');
console.log('\n=== ③常规回归·保研率 ===');
console.log('A:', r2.ans.slice(0,120).replace(/\n/g,' '));
console.log('SRC:', r2.srcs);
