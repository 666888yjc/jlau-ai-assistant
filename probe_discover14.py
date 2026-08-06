# -*- coding: utf-8 -*-
"""十三轮探测：补充候选栏目。"""
import sys, re
sys.path.insert(0, 'server/kb-source')
import fetch_sites as fs

cands = [
    ('学术委员会相关制度', 'https://xxgk.jlau.edu.cn/xxgklm1/jbxx/xswyhxgzd.htm'),
    ('教职工代表大会工作报告', 'https://xxgk.jlau.edu.cn/xxgklm1/jbxx/jzgdbdhgzbg.htm'),
    ('分批次分科类招生计划', 'https://xxgk.jlau.edu.cn/xxgklm1/zsksxx/fpc_fklzsjh.htm'),
    ('招生咨询及考生申诉渠道', 'https://xxgk.jlau.edu.cn/xxgklm1/zsksxx/zszxjksssqd.htm'),
    ('本科生占在校生比例等', 'https://xxgk.jlau.edu.cn/xxgklm1/jxzlxx/bkszqrzzxszsdbl_jssljjg.htm'),
    ('学校十四五规划', 'https://xxgk.jlau.edu.cn/xxgklm1/jbxx/xx_ssw_gh1.htm'),
]
for name, u in cands:
    ok, t, err = fs.Fetcher().fetch(u)
    if not ok:
        print(f'[{name}] FETCH FAIL {err}')
        continue
    links = fs.extract_category_links(t, u)
    print(f'[{name}] line_u 列表 {len(links)} 项:')
    for lu, la in links[:6]:
        print(f'    {la[:24]:<26} {lu[-45:]}')
    if not links:
        title, body = fs.extract_article(t)
        print(f'    单页正文: {title[:24]} len={len(body)}')
