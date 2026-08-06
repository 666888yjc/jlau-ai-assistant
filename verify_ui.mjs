const BASE = 'https://yjc-d0gvjkk8tae8bf1ad-1411562898.tcloudbaseapp.com';
try {
  const r = await fetch(BASE + '/');
  console.log('首页 HTTP', r.status);
  const html = await r.text();
  const cssMatch = html.match(/assets\/[^"']+\.css/);
  const jsMatch = html.match(/assets\/[^"']+\.js/);
  console.log('CSS 引用:', cssMatch ? cssMatch[0] : '未找到');
  console.log('JS 引用:', jsMatch ? jsMatch[0] : '未找到');
  if (cssMatch) {
    const cr = await fetch(BASE + '/' + cssMatch[0]);
    const css = await cr.text();
    const checks = ['--gradient-brand', '--radius-2xl', '--elev-soft', 'welcome-hero', 'welcome-halo', 'msg-in', 'source-chip.static', 'typing .dot'];
    console.log('CSS 大小:', (css.length/1024).toFixed(1) + 'kB');
    for (const c of checks) {
      console.log(`  ${c}: ${css.includes(c) ? '✅ 在' : '❌ 缺失'}`);
    }
  }
} catch (e) { console.log('ERR', e.message); }
