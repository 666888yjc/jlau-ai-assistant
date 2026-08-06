const BASE = 'https://yjc-d0gvjkk8tae8bf1ad-1411562898.ap-shanghai.app.tcloudbase.com/api';
async function get(path){ const r = await fetch(BASE+path); return {status:r.status, body: await r.json().catch(()=>null)}; }
const sc = await get('/v1/scenarios');
console.log('== /v1/scenarios ==', sc.status);
console.log(JSON.stringify(sc.body, null, 1).slice(0, 1200));
for (const sid of ['kexue','xuanke']) {
  const f = await get('/v1/scenarios/'+sid+'/features');
  console.log('\n== features['+sid+'] ==', f.status);
  console.log(JSON.stringify(f.body, null, 0).slice(0, 500));
}
