# -*- coding: utf-8 -*-
"""四轮探测：看正文容器结构，确定提取策略。"""
import re, urllib.request, ssl
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'


def fetch(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        r = urllib.request.urlopen(req, timeout=12, context=CTX)
        raw = r.read()
        enc = r.headers.get_content_charset() or 'utf-8'
        try:
            return raw.decode(enc, errors='ignore')
        except Exception:
            return raw.decode('utf-8', errors='ignore')
    except Exception as e:
        return 'ERR:' + str(e)[:60]


print('=== A) 主站学校简介 xxjj.htm 结构 ===')
t = fetch('https://www.jlau.edu.cn/xxgk/xxjj.htm')
# 找正文容器
for m in re.finditer(r'<(div|section)[^>]*(id|class)=["\']([^"\']*)["\'][^>]*>', t):
    tag, attr, val = m.group(1), m.group(2), m.group(3)
    if any(k in val.lower() for k in ['content', 'article', 'text', 'detail', 'body', 'nr', 'wz', 'main']):
        print(f'  容器: <{tag} {attr}={val}>')
# 找标题标签
print('  标题标签样例:', re.findall(r'<h[12][^>]*>([^<]{4,40})', t)[:5])
# 找 info 链接附近的日期格式
print('  日期样例:', re.findall(r'20\d{2}[-年/]\d{1,2}[-月/]\d{1,2}', t)[:5])

print()
print('=== B) xxgk 文章详情页结构 ===')
t = fetch('https://xxgk.jlau.edu.cn/info/1075/1956.htm')
if not t.startswith('ERR'):
    print('  大小', len(t) // 1024, 'KB')
    for m in re.finditer(r'<(div|section)[^>]*(id|class)=["\']([^"\']*)["\'][^>]*>', t):
        tag, attr, val = m.group(1), m.group(2), m.group(3)
        if any(k in val.lower() for k in ['content', 'article', 'text', 'detail', 'body', 'nr', 'wz', 'main', 'v_news']):
            print(f'  容器: <{tag} {attr}={val}>')
    print('  标题标签样例:', re.findall(r'<h[12][^>]*>([^<]{4,40})', t)[:5])
    # 正文可能在某 div 里，看 v_news_content 之类
    m = re.search(r'class=["\']v_news_content["\']', t)
    print('  有 v_news_content:', bool(m))
    m2 = re.search(r'id=["\']vsb_content["\']', t)
    print('  有 vsb_content:', bool(m2))

print()
print('=== C) jwc index.js 找接口 ===')
js = fetch('http://jwc.jlau.edu.cn/static/simpleboot3/public/assets/js/index.js')
print('  index.js 大小', len(js))
if not js.startswith('ERR'):
    for pat in [r'url\s*[:=]\s*["\']([^"\']+)["\']', r'ajax\s*\(\s*["\']([^"\']+)["\']',
                r'["\'](/portal/[a-zA-Z0-9_/.-]+)["\']', r'getJSON\s*\(\s*["\']([^"\']+)["\']']:
        hits = set(re.findall(pat, js))
        if hits:
            print('   ', sorted(hits)[:15])
    # 找 js 里引入的其他 js
    for s in sorted(set(re.findall(r'["\']([^"\']+\.js[^"\']*)["\']', js)))[:20]:
        print('    js ref:', s)

print()
print('=== D) 主站大学章程 dxzc.htm 正文结构 ===')
t = fetch('https://www.jlau.edu.cn/xxgk/dxzc.htm')
if not t.startswith('ERR'):
    for m in re.finditer(r'<(div|section)[^>]*(id|class)=["\']([^"\']*)["\'][^>]*>', t):
        tag, attr, val = m.group(1), m.group(2), m.group(3)
        if any(k in val.lower() for k in ['content', 'article', 'text', 'detail', 'body', 'nr', 'wz', 'main']):
            print(f'  容器: <{tag} {attr}={val}>')
    print('  标题标签样例:', re.findall(r'<h[12][^>]*>([^<]{4,40})', t)[:5])
