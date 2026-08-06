# -*- coding: utf-8 -*-
import re, html, urllib.request, ssl
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
def fetch(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        r = urllib.request.urlopen(req, timeout=12, context=ctx)
        raw = r.read(); enc = r.headers.get_content_charset() or 'utf-8'
        try: return raw.decode(enc, errors='ignore')
        except: return raw.decode('utf-8', errors='ignore')
    except Exception as e: return 'ERR:'+str(e)[:50]

# 招生站：列表页里链接全貌
print('=== 招生站 zyjs_gk_list.html ===')
t = fetch('http://zhaosheng.jlau.edu.cn/zsw/zyjs_gk_list.html')
if t.startswith('ERR'): print(t)
else:
    for m in sorted(set(re.findall(r'href=[\"\']([^\"\']+)[\"\']', t)))[:30]:
        if not any(x in m for x in ['.css','.js','.png','.jpg','.ico','.svg']): print('  ', m[:90])

# 教务处：文章链接格式
print('\n=== 教务处首页链接 ===')
t = fetch('http://jwc.jlau.edu.cn/')
if t.startswith('ERR'): print(t)
else:
    n = 0
    for m in re.finditer(r'<a[^>]+href=[\"\']([^\"\']+)[\"\'][^>]*>(.*?)</a>', t, re.S|re.I):
        u, tx = m.group(1).strip(), html.unescape(re.sub(r'<[^>]+>','',m.group(2))).strip()
        if ('info' in u or 'jwc' in u or u.startswith('/')) and tx and len(tx)>=3 and not any(x in u for x in ['.css','.js','.png','.jpg','login']):
            print(f'  {tx[:22]:<24} {u[:80]}'); n+=1
            if n>=15: break

# 信息公开栏目页（大学章程等）
print('\n=== 信息公开 xxgk/dxzc.htm ===')
t = fetch('https://www.jlau.edu.cn/xxgk/dxzc.htm')
print('大小:', len(t), '首100字:', t[:100].replace(chr(10),' '))
