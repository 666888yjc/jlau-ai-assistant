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
    except Exception as e: return 'ERR:'+str(e)[:60]

# 1) 信息公开站：抓全部 info 链接（标题+URL）
txt = fetch('http://xxgk.jlau.edu.cn/')
pairs = {}
for m in re.finditer(r'<a[^>]+href=[\"\']([^\"\']+)[\"\'][^>]*>(.*?)</a>', txt, re.S|re.I):
    u, t = m.group(1).strip(), html.unescape(re.sub(r'<[^>]+>', '', m.group(2))).strip()
    if '/info/' in u and t and len(t) >= 3:
        pairs.setdefault(u, t)
print('信息公开站 info 文章链接:', len(pairs))
for u, t in list(sorted(pairs.items()))[:15]:
    print(f'  {t[:28]:<30} {u[:70]}')

# 2) 抓一个详情页验证正文可提取
if pairs:
    u0 = sorted(pairs.items())[0]
    print('\n详情页样例:', u0[1][:20], u0[0])
    dtxt = fetch(u0[0])
    body = re.sub(r'<script.*?</script>|<style.*?</style>', '', dtxt, flags=re.S)
    body = re.sub(r'<[^>]+>', '\n', body)
    body = re.sub(r'\n{2,}', '\n', html.unescape(body)).strip()
    print('正文提取长度:', len(body), '字')
    print('正文开头 300 字:', body[:300].replace(chr(10), ' | '))
