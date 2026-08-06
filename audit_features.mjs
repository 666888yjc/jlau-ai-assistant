const BASE = 'https://yjc-d0gvjkk8tae8bf1ad-1411562898.ap-shanghai.app.tcloudbase.com/api';
async function get(path){ const r = await fetch(BASE+path); return {status:r.status, body: await r.json().catch(()=>null)}; }
for (const sid of ['baodao','xuanke','kexue','kaoyan','shenghuo']) {
  const f = await get('/features?scenario_id='+sid);
  const n = f.body && f.body.data ? f.body.data.length : null;
  console.log('features['+sid+']:', f.status, 'count='+n, n!==null ? JSON.stringify(f.body.data.slice(0,2)).slice(0,160) : '');
}
