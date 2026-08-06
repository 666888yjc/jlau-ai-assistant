# -*- coding: utf-8 -*-
"""十轮探测：历史沿革页面正文结构。"""
import re, html, urllib.request, ssl
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
def fetch(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        r = urllib.request.urlopen(req, timeout=12, context=CTX)
        raw = r.read(); enc = r.headers.get_content_charset() or 'utf-8'
        try: return raw.decode('utf-8-sig' if 'utf' in enc.lower() else enc, errors='ignore')
        except: return raw.decode('utf-8', errors='ignore')
    except Exception as e: return 'ERR:'+str(e)[:60]

t = fetch('https://www.jlau.edu.cn/xxgk/lsyg.htm')
# 找 zy_right / zy_con 内容
for pat in [r'class=["\']zy_right["\']', r'class=["\']zy_con["\']', r'id=["\']vsb_content_11416_u91["\']']:
    m = re.search(pat, t)
    print(pat, '→', 'found at', m.start() if m else None)
# 打印 zy_right 附近内容
m = re.search(r'class=["\']zy_right["\']', t)
if m:
    seg = t[m.start():m.start()+3000]
    txt = re.sub(r'<script.*?</script>|<style.*?</style>', '', seg, flags=re.S)
    txt = re.sub(r'<[^>]+>', '\n', txt)
    txt = re.sub(r'\n{2,}', '\n', html.unescape(txt)).strip()
    print('zy_right 附近文本:', txt[:500].replace(chr(10), ' | '))
# 也看看整个页面的 ul/li 结构
print()
print('页面里所有含年份的 li:')
for li in re.findall(r'<li[^>]*>(.*?)</li>', t, re.S|re.I)[:20]:
    txt = html.unescape(re.sub(r'<[^>]+>', '', li)).strip()
    if re.search(r'19\d\d|20\d\d', txt):
        print('  ', txt[:60])
