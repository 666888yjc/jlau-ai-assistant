const BASE = 'https://yjc-d0gvjkk8tae8bf1ad-1411562898.ap-shanghai.app.tcloudbase.com/api';
async function get(path){ const r = await fetch(BASE+path); const t = await r.text(); return {status:r.status, text:t.slice(0,400)}; }
for (const sid of ['baodao','xuanke','kaoyan','shenghuo']) {
  const f = await get('/features?scenario_id='+sid);
  console.log('features['+sid+']:', f.status, f.text.slice(0,200));
}
const sc = await get('/scenarios');
console.log('\nscenarios:', sc.status, sc.text.slice(0,200));
