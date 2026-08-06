# -*- coding: utf-8 -*-
"""快速探测：锁定各来源的真实入口 URL（供 fetch_sites.py 配置使用）。"""
import re, html, json, urllib.request, ssl

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


def show_links(txt, label, limit=40, only_html=True):
    """打印链接+锚文本。"""
    seen = {}
    for m in re.finditer(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', txt, re.S | re.I):
        u = m.group(1).strip()
        t = html.unescape(re.sub(r'<[^>]+>', '', m.group(2))).strip()
        if not u or u.startswith('#') or u.startswith('javascript'):
            continue
        if only_html and not (u.endswith(('.htm', '.html', '.shtml')) or '/info/' in u):
            continue
        if any(x in u for x in ['.css', '.js', '.png', '.jpg', '.gif', '.ico', 'login']):
            continue
        full = u if u.startswith('http') else None
        if full is None:
            continue
        seen.setdefault(full, t)
    print(f'--- {label}: {len(seen)} 条 ---')
    for u, t in sorted(seen.items())[:limit]:
        print(f'  {t[:26]:<28} {u[:90]}')
    return seen


print('=' * 20, '1) 主站首页 → 部门/栏目入口', '=' * 20)
t = fetch('https://www.jlau.edu.cn/')
if t.startswith('ERR'):
    print(t)
else:
    show_links(t, '主站首页 html 链接', limit=50)

print()
print('=' * 20, '2) 主站 xxgk 栏目页（学校概况）', '=' * 20)
for col in ['https://www.jlau.edu.cn/xxgk/xxgk.htm', 'https://www.jlau.edu.cn/xxgk/dxzc.htm']:
    t = fetch(col)
    if t.startswith('ERR'):
        print(col, '→', t)
    else:
        links = show_links(t, col, limit=15)
        print(f'  大小 {len(t)//1024}KB')

print()
print('=' * 20, '3) 信息公开首页 → 栏目/文章链接', '=' * 20)
t = fetch('https://xxgk.jlau.edu.cn/')
if t.startswith('ERR'):
    print(t)
else:
    show_links(t, '信息公开首页 html', limit=60)

print()
print('=' * 20, '4) 教务处列表页 → 找 API/JSON', '=' * 20)
t = fetch('http://jwc.jlau.edu.cn/portal/index/list?id=57944687eeeb4cc6bfdda961eac5efa5')
if t.startswith('ERR'):
    print(t)
else:
    print('大小', len(t) // 1024, 'KB')
    # 找 JS 里的 api 路径
    apis = set(re.findall(r'["\'](/portal/[a-zA-Z0-9_/.-]*api[a-zA-Z0-9_/.-]*)["\']', t))
    apis |= set(re.findall(r'["\'](/portal/[a-zA-Z0-9_/.-]*(?:getList|list|detail|json)[a-zA-Z0-9_/.-]*)["\']', t))
    print('API 候选:', sorted(apis)[:20] if apis else '无')
    scripts = set(re.findall(r'src=["\']([^"\']+\.js[^"\']*)["\']', t))
    print('JS 文件:', sorted(scripts)[:15])
    # 直接试常见 API
    for api in ['/portal/api/index/getList', '/portal/index/getList', '/portal/index/listData']:
        u = 'http://jwc.jlau.edu.cn' + api + '?id=57944687eeeb4cc6bfdda961eac5efa5&page=1'
        r = fetch(u)
        if not r.startswith('ERR') and len(r) > 100:
            print('  ✔', u, '→', len(r), 'B', r[:200].replace('\n', ' '))
        else:
            print('  ✘', u, '→', r[:40])

print()
print('=' * 20, '5) 招生站 → 详情页模式探测', '=' * 20)
for u in ['http://zhaosheng.jlau.edu.cn/zsw/zyjs_gk_view.html?id=1',
          'http://zhaosheng.jlau.edu.cn/zsw/info/1001/1001.htm',
          'http://zhaosheng.jlau.edu.cn/info/1001/1001.htm',
          'http://zhaosheng.jlau.edu.cn/zsw/zyjs_gk_list.html']:
    r = fetch(u)
    tmpl = '{{$' in r
    print(f'  {u[:70]} → {len(r)//1024}KB 模板壳={tmpl} {"ERR" if r.startswith("ERR") else "OK"}')

print()
print('=' * 20, '6) 图书馆/就业 备选路径', '=' * 20)
for u in ['http://lib.jlau.edu.cn/', 'http://lib.jlau.edu.cn/zyfw.htm', 'http://zhjy.jlau.edu.cn/', 'http://zhjy.jlau.edu.cn/jyxx.htm']:
    r = fetch(u)
    print(f'  {u[:60]} → {len(r)//1024}KB {"ERR" if r.startswith("ERR") else "OK"} 模板壳={"{{$" in r}')
