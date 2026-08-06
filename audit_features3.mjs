const BASE = 'https://yjc-d0gvjkk8tae8bf1ad-1411562898.ap-shanghai.app.tcloudbase.com/api/v1';
async function get(path){ const r = await fetch(BASE+path); const t = await r.text(); return {status:r.status, text:t.slice(0,600)}; }
for (const sid of ['baodao','xuanke','kaoyan','shenghuo']) {
  const f = await get('/features?scenario_id='+sid);
  const n = f.text.match(/"data":\[[^\]]*\]/);
  console.log('features['+sid+']:', f.status, n ? n[0].slice(0,180) : f.text.slice(0,120));
}
