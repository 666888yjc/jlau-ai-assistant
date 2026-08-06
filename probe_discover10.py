# -*- coding: utf-8 -*-
"""九轮探测：主站各容器候选的文本长度/链接数。"""
import sys, re
sys.path.insert(0, 'server/kb-source')
import fetch_sites as fs

for name, u in [('历史沿革','https://www.jlau.edu.cn/xxgk/lsyg.htm'),
                ('学校标识','https://www.jlau.edu.cn/xxgk/xxbs.htm'),
                ('领导题词','https://www.jlau.edu.cn/xxgk/ldtc.htm'),
                ('学校简介','https://www.jlau.edu.cn/xxgk/xxjj.htm')]:
    ok, t, err = fs.Fetcher().fetch(u)
    containers = fs._all_container_inner(t)
    print(f'=== {name} ===')
    for c in containers:
        text = fs.html_to_text(c)
        nlinks = len(re.findall(r'<a\b', c, re.I))
        print(f'  len={len(text):<6} links={nlinks:<3} 开头: {text[:50].replace(chr(10)," / ")}')
