# -*- coding: utf-8 -*-
"""二轮探测：信息公开相对链接 + 教务处 second.js 找数据接口 + 主站栏目页文章链接。"""
import re, html, urllib.request, ssl
from urllib.parse import urljoin

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


def links_with_anchor(txt, base, limit=80):
    """提取所有 href+锚文本，相对路径用 urljoin 解析。"""
    seen = {}
    for m in re.finditer(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', txt, re.S | re.I):
        u = m.group(1).strip()
        t = html.unescape(re.sub(r'<[^>]+>', '', m.group(2))).strip()
        if not u or u.startswith('#') or u.startswith('javascript'):
            continue
        if any(x in u for x in ['.css', '.js', '.png', '.jpg', '.gif', '.ico', '.svg', 'login', 'mailto']):
            continue
        full = urljoin(base, u)
        seen.setdefault(full, t)
    return seen


print('=' * 20, '信息公开首页全部链接（相对解析）', '=' * 20)
t = fetch('https://xxgk.jlau.edu.cn/')
base = 'https://xxgk.jlau.edu.cn/'
seen = links_with_anchor(t, base, limit=200)
print('总数:', len(seen))
for u, tx in sorted(seen.items()):
    if tx and len(tx) >= 2:
        print(f'  {tx[:22]:<24} {u[:95]}')

print()
print('=' * 20, '主站 xxgk/dxzc.htm 栏目页文章链接', '=' * 20)
t = fetch('https://www.jlau.edu.cn/xxgk/dxzc.htm')
seen = links_with_anchor(t, 'https://www.jlau.edu.cn/xxgk/dxzc.htm')
art = {u: tx for u, tx in seen.items() if '/info/' in u}
print('info 文章链接:', len(art))
for u, tx in sorted(art.items())[:20]:
    print(f'  {tx[:28]:<30} {u[:90]}')

print()
print('=' * 20, '教务处 second.js 找数据接口', '=' * 20)
js = fetch('http://jwc.jlau.edu.cn/static/simpleboot3/public/assets/js/second.js')
print('JS 大小:', len(js))
if not js.startswith('ERR'):
    # 找 ajax / url / getList / api
    for pat in [r'url\s*[:=]\s*["\']([^"\']+)["\']', r'ajax\s*\(\s*["\']([^"\']+)["\']',
                r'["\'](/portal/[^"\']+)["\']', r'["\'](https?://[^"\']+)["\']']:
        hits = set(re.findall(pat, js))
        if hits:
            print('  pattern', pat[:40], '→', sorted(hits)[:15])
    print('--- 含 getList/list/api 关键行 ---')
    for line in js.splitlines():
        if re.search(r'getList|listData|/api/|\.json|ajax|url\s*[:=]', line, re.I):
            print('  ', line.strip()[:160])
