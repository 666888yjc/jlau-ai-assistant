# -*- coding: utf-8 -*-
"""十二轮探测：debug 两个 0 篇栏目。"""
import sys, re
sys.path.insert(0, 'server/kb-source')
import fetch_sites as fs

for name, u in [('本科教学质量报告','https://xxgk.jlau.edu.cn/xxgklm1/jxzlxx/bkjxzlbg.htm'),
                ('制定的各项规章制度','https://xxgk.jlau.edu.cn/xxgklm1/jbxx/zddgxgzzd.htm')]:
    ok, t, err = fs.Fetcher().fetch(u)
    print(f'=== {name} === 入口ok={ok} err={err}')
    links = fs.extract_category_links(t, u)
    print(f'  列表项 {len(links)}:')
    for lu, la in links[:8]:
        ok2, t2, err2 = fs.Fetcher().fetch(lu)
        if ok2:
            title, body = fs.extract_article(t2)
            print(f'    {la[:22]:<24} {lu[-45:]} → title={title[:20]!r} body={len(body)}')
        else:
            print(f'    {la[:22]:<24} {lu[-45:]} → FETCH FAIL {err2}')
