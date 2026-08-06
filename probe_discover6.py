# -*- coding: utf-8 -*-
"""五轮探测：xxgk 栏目页列表容器结构 + 主站 title 标签。"""
import re, html, urllib.request, ssl
from urllib.parse import urljoin
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

print('=== A) 主站各页 <title> ===')
for name, u in [('学校简介','https://www.jlau.edu.cn/xxgk/xxjj.htm'),
                ('历史沿革','https://www.jlau.edu.cn/xxgk/lsyg.htm'),
                ('大学章程','https://www.jlau.edu.cn/xxgk/dxzc.htm'),
                ('学校定位','https://www.jlau.edu.cn/xxgk/xxdw.htm')]:
    t = fetch(u)
    m = re.search(r'<title[^>]*>(.*?)</title>', t, re.S|re.I)
    print(f'  {name}: <title>={m.group(1).strip() if m else "?"}')

print()
print('=== B) xxgk 栏目页列表结构（学籍管理） ===')
t = fetch('https://xxgk.jlau.edu.cn/xxgklm1/xsglfwxx/xjglbf.htm')
# 打印所有含 /info/ 链接的父容器线索：找 a 标签前后文
print('--- info 链接上下文（前120字符） ---')
for m in re.finditer(r'<a[^>]+href=["\']([^"\']*info[^"\']*)["\'][^>]*>(.*?)</a>', t, re.S|re.I):
    ctx = t[max(0, m.start()-80):m.start()]
    ctx = re.sub(r'\s+', ' ', ctx)
    print(f'  前文: ...{ctx[-70:]}')
    print(f'  链接: {m.group(1)[:60]} 锚: {html.unescape(re.sub(chr(60)+r"[^>"+chr(62)+r"]+"+chr(62), "", m.group(2))).strip()[:30]}')
# 找列表容器 id/class
print('--- 容器候选 ---')
for m in re.finditer(r'<(div|ul|section)[^>]*(id|class)=["\']([^"\']*)["\'][^>]*>', t):
    tag, attr, val = m.group(1), m.group(2), m.group(3)
    if any(k in val.lower() for k in ['list', 'lm', 'nr', 'con', 'article', 'news', 'xw', 'wz', 'text']):
        print(f'  <{tag} {attr}={val}>')

print()
print('=== C) 十四五规划栏目页 info 链接 ===')
t = fetch('https://xxgk.jlau.edu.cn/xxgklm1/jbxx/xx_ssw_gh1.htm')
for m in re.finditer(r'<a[^>]+href=["\']([^"\']*info[^"\']*)["\'][^>]*>(.*?)</a>', t, re.S|re.I):
    anchor = html.unescape(re.sub(r'<[^>]+>', '', m.group(2))).strip()
    ctx = re.sub(r'\s+', ' ', t[max(0, m.start()-60):m.start()])[-50:]
    print(f'  锚:{anchor[:24]:<26} URL:{m.group(1)[:50]:<52} 前文:{ctx}')
