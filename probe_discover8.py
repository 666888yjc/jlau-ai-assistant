# -*- coding: utf-8 -*-
"""七轮探测：直接调用提取函数看 lsyg 输出 + xxgk line_u 列表正则。"""
import sys, re, html, urllib.request, ssl
sys.path.insert(0, 'server/kb-source')
import fetch_sites as fs

print('=== A) 主站 lsyg/xxbs/ldtc 提取结果 ===')
for name, u in [('历史沿革','https://www.jlau.edu.cn/xxgk/lsyg.htm'),
                ('学校标识','https://www.jlau.edu.cn/xxgk/xxbs.htm'),
                ('领导题词','https://www.jlau.edu.cn/xxgk/ldtc.htm')]:
    ok, t, err = fs.Fetcher().fetch(u)
    title, body = fs.extract_article(t)
    print(f'  [{name}] title={title!r} body_len={len(body)} 开头: {body[:80].replace(chr(10)," / ")}')

print()
print('=== B) xxgk 十四五规划：line_u 列表 + 全页 info 链接 ===')
u = 'https://xxgk.jlau.edu.cn/xxgklm1/jbxx/xx_ssw_gh1.htm'
ok, t, err = fs.Fetcher().fetch(u)
lis = re.findall(r'<li[^>]*id=["\']line_u\d+_\d+["\'][^>]*>(.*?)</li>', t, re.S|re.I)
print(f'  line_u 列表项: {len(lis)}')
for li in lis[:10]:
    m = re.search(r'href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', li, re.S|re.I)
    if m:
        print(f'    {html.unescape(re.sub(chr(60)+r"[^>"+chr(62)+r"]+"+chr(62), "", m.group(2))).strip()[:24]:<26} {m.group(1)[:40]}')
# 全部 info 链接（含侧栏）
pairs = fs.extract_article_links(t, u)
print(f'  extract_article_links 结果: {len(pairs)}')
for x, y in pairs[:10]:
    print(f'    {y[:24]:<26} {x[:60]}')
# 页面本身当文章的正文长度
title, body = fs.extract_article(t)
print(f'  页面自身正文: title={title!r} len={len(body)} 开头: {body[:80].replace(chr(10)," / ")}')
