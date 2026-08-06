# -*- coding: utf-8 -*-
"""八轮探测：本科教学质量报告/教代会制度 列表结构 + xxgk 详情页 title。"""
import sys, re, html, urllib.request, ssl
sys.path.insert(0, 'server/kb-source')
import fetch_sites as fs

for name, u in [('本科教学质量报告','https://xxgk.jlau.edu.cn/xxgklm1/jxzlxx/bkjxzlbg.htm'),
                ('教职工代表大会制度','https://xxgk.jlau.edu.cn/xxgklm1/jbxx/jzgdbdhzd.htm'),
                ('制定的各项规章制度','https://xxgk.jlau.edu.cn/xxgklm1/jbxx/zddgxgzzd.htm')]:
    ok, t, err = fs.Fetcher().fetch(u)
    lis = re.findall(r'<li[^>]*id=["\']line_u\d+_\d+["\'][^>]*>(.*?)</li>', t, re.S|re.I)
    lis2 = re.findall(r'<li[^>]*>(.*?\[20\d\d[-\/]\d{1,2}[-\/]\d{1,2}\].*?)</li>', t, re.S|re.I)
    print(f'[{name}] line_u={len(lis)} 带日期li={len(lis2)}')
    for li in (lis or lis2)[:6]:
        m = re.search(r'href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', li, re.S|re.I)
        if m:
            anchor = html.unescape(re.sub(r'<[^>]+>', '', m.group(2))).strip()
            print(f'    {anchor[:26]:<28} {m.group(1)[:45]}')
    title, body = fs.extract_article(t)
    print(f'    页面自身: title={title!r} len={len(body)} 开头: {body[:60].replace(chr(10)," / ")}')

print()
print('=== xxgk 详情页 title 检查 ===')
for u in ['https://xxgk.jlau.edu.cn/info/1075/2145.htm',
          'https://xxgk.jlau.edu.cn/info/1021/1744.htm']:
    ok, t, err = fs.Fetcher().fetch(u)
    m = re.search(r'<title[^>]*>(.*?)</title>', t, re.S|re.I)
    h1 = re.findall(r'<h[12][^>]*>(.*?)</h[12]>', t, re.S|re.I)
    print(f'  {u[-30:]}: <title>={m.group(1).strip() if m else "?"!r} h1/h2={[html.unescape(re.sub(chr(60)+r"[^>"+chr(62)+r"]+"+chr(62), "", x)).strip() for x in h1[:3]]}')
