# -*- coding: utf-8 -*-
"""三轮探测：验证 xxgk 栏目页文章 + jwc 渲染 JS 找接口 + 招生站 api。"""
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


def links_with_anchor(txt, base, limit=100):
    seen = {}
    for m in re.finditer(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', txt, re.S | re.I):
        u = m.group(1).strip()
        t = html.unescape(re.sub(r'<[^>]+>', '', m.group(2))).strip()
        if not u or u.startswith('#') or u.startswith('javascript'):
            continue
        if any(x in u for x in ['.css', '.js', '.png', '.jpg', '.gif', '.ico', '.svg', 'login', 'mailto']):
            continue
        seen.setdefault(urljoin(base, u), t)
    return seen


print('=' * 20, 'A) xxgk 栏目页文章验证', '=' * 20)
for name, u in [('学校章程', 'https://xxgk.jlau.edu.cn/xxgklm1/jbxx/xxzc.htm'),
                ('规章制度', 'https://xxgk.jlau.edu.cn/xxgklm1/jbxx/zddgxgzzd.htm'),
                ('学籍管理', 'https://xxgk.jlau.edu.cn/xxgklm1/xsglfwxx/xjglbf.htm'),
                ('招生章程', 'https://xxgk.jlau.edu.cn/xxgklm1/zsksxx/zszcjtslxzsbf.htm')]:
    t = fetch(u)
    if t.startswith('ERR'):
        print(f'[{name}] {u[:60]} → {t}')
        continue
    seen = links_with_anchor(t, u)
    info = {x: y for x, y in seen.items() if '/info/' in x}
    print(f'[{name}] {u[:65]} → 总链 {len(seen)} info文章 {len(info)}')
    for x, y in sorted(info.items())[:8]:
        print(f'    {y[:24]:<26} {x[:80]}')

print()
print('=' * 20, 'B) jwc 首页 JS 清单', '=' * 20)
t = fetch('http://jwc.jlau.edu.cn/')
if not t.startswith('ERR'):
    for s in sorted(set(re.findall(r'src=["\']([^"\']+\.js[^"\']*)["\']', t))):
        print('  ', s)
    # 找 iframe / 数据区
    ifr = set(re.findall(r'<iframe[^>]+src=["\']([^"\']+)["\']', t))
    print('  iframes:', list(ifr)[:5])

print()
print('=' * 20, 'C) jwc 常见渲染 JS 探接口', '=' * 20)
for js_url in ['http://jwc.jlau.edu.cn/static/simpleboot3/public/assets/js/home.js',
               'http://jwc.jlau.edu.cn/static/js/main.js',
               'http://jwc.jlau.edu.cn/portal/index/index']:
    js = fetch(js_url)
    if js.startswith('ERR') or len(js) < 200:
        print(f'  {js_url[:70]} → 无 {js[:40]}')
        continue
    print(f'  {js_url[:70]} → {len(js)//1024}KB')
    for pat in [r'url\s*[:=]\s*["\']([^"\']+)["\']', r'ajax\s*\(\s*["\']([^"\']+)["\']',
                r'["\'](/portal/[a-zA-Z0-9_/.-]+)["\']', r'\.get\(["\']([^"\']+)["\']']:
        hits = set(re.findall(pat, js))
        if hits:
            print('      ', sorted(hits)[:10])

print()
print('=' * 20, 'D) 招生站 api 探测', '=' * 20)
for u in ['http://zhaosheng.jlau.edu.cn/zsw/api/list',
          'http://zhaosheng.jlau.edu.cn/zsw/list.html',
          'http://zhaosheng.jlau.edu.cn/zsw/zyjs_gk_view.html?id=3',
          'http://zhaosheng.jlau.edu.cn/zsw/zyjs_view.html?id=1']:
    r = fetch(u)
    print(f'  {u[:75]} → {len(r)//1024}KB {"ERR:"+r[:40] if r.startswith("ERR") else ("模板壳=" + ("{{$" in r))}')

print()
print('=' * 20, 'E) 主站学校简介/概况栏目', '=' * 20)
for u in ['https://www.jlau.edu.cn/xxgk/xxjj.htm', 'https://www.jlau.edu.cn/info/1008/11415.htm',
          'https://www.jlau.edu.cn/xxgk/ldjg.htm', 'https://www.jlau.edu.cn/xxgk/lsyg.htm']:
    t = fetch(u)
    if t.startswith('ERR'):
        print(f'  {u[:60]} → {t}')
        continue
    body = re.sub(r'<script.*?</script>|<style.*?</style>', '', t, flags=re.S)
    body = re.sub(r'<[^>]+>', '\n', body)
    body = re.sub(r'\n{2,}', '\n', html.unescape(body)).strip()
    print(f'  {u[:60]} → {len(t)//1024}KB 正文约{len(body)}字 开头: {body[:50].replace(chr(10)," | ")}')
