# -*- coding: utf-8 -*-
"""十一轮探测：定位 vsb_content_11416_u91 容器边界。"""
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
# 找该容器开始位置
for m in re.finditer(r'<div[^>]*\bid=["\']vsb_content_11416_u91["\'][^>]*>', t):
    start = m.end()
    print('容器开始于', start)
    # 取后 3000 字符看结构
    seg = t[start:start+2000]
    print('前600字:', re.sub(r'\s+', ' ', seg)[:600])
    # 平衡扫描
    depth = 1; pos = start
    while pos < len(t) and depth > 0:
        om = re.search(r'<div\b', t[pos:], re.I)
        cm = re.search(r'</div>', t[pos:], re.I)
        if not om and not cm: break
        if cm and (not om or cm.start() < om.start()):
            depth -= 1; pos += cm.end()
        else:
            depth += 1; pos += om.end()
    inner = t[start:pos]
    txt = re.sub(r'<script.*?</script>|<style.*?</style>', '', inner, flags=re.S)
    txt = re.sub(r'<[^>]+>', '\n', txt)
    txt = re.sub(r'\n{2,}', '\n', html.unescape(txt)).strip()
    print(f'平衡扫描 inner 长度 {len(inner)}, 文本 {len(txt)}字')
    print('文本开头:', txt[:300].replace(chr(10), ' | '))
    break
