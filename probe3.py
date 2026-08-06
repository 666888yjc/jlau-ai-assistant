# -*- coding: utf-8 -*-
import re, html, urllib.request, ssl, json
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
def fetch(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        r = urllib.request.urlopen(req, timeout=12, context=ctx)
        raw = r.read(); enc = r.headers.get_content_charset() or 'utf-8'
        return raw.decode(enc, errors='ignore'), r.headers.get('Content-Type','')
    except Exception as e: return 'ERR:'+str(e)[:60], ''

# 教务处学籍管理栏目列表
for label, u in [('学籍管理','http://jwc.jlau.edu.cn/portal/index/list?id=57944687eeeb4cc6bfdda961eac5efa5'),
                 ('吉农校历','http://jwc.jlau.edu.cn/portal/index/list?id=da327428b6184156a43d0d4d47ec6f28')]:
    t, ct = fetch(u)
    if t.startswith('ERR'): print(f'[{label}] ERR {t}'); continue
    print(f'=== [{label}] Content-Type: {ct[:40]} | 大小 {len(t)//1024}KB ===')
    # JSON?
    if t.strip().startswith('{') or t.strip().startswith('['):
        try:
            j = json.loads(t)
            print('  JSON 结构:', str(j)[:400])
        except: print('  前300:', t[:300])
    else:
        links = re.findall(r'href=[\"\']([^\"\']+)[\"\'][^>]*>([^<]{4,40})', t)
        print('  文章链接数:', len(links))
        for u2, tx in links[:8]:
            if not any(x in u2 for x in ['.css','.js','.png','.jpg','login','list']):
                print(f'    {html.unescape(tx)[:24]:<26} {u2[:80]}')
