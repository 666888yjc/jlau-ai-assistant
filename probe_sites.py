# -*- coding: utf-8 -*-
import re, urllib.request, ssl
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
SITES = {
  '招生站': ['http://zhaosheng.jlau.edu.cn/zsw/zyjs_gk_list.html', 'http://zhaosheng.jlau.edu.cn/'],
  '教务处': ['http://jwc.jlau.edu.cn/', 'https://jwc.jlau.edu.cn/'],
  '信息公开': ['http://xxgk.jlau.edu.cn/', 'https://xxgk.jlau.edu.cn/'],
  '图书馆': ['http://lib.jlau.edu.cn/', 'https://lib.jlau.edu.cn/'],
  '就业站': ['http://zhjy.jlau.edu.cn/', 'https://zhjy.jlau.edu.cn/'],
}
def fetch(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        r = urllib.request.urlopen(req, timeout=12, context=ctx)
        raw = r.read()
        enc = r.headers.get_content_charset() or 'utf-8'
        try: txt = raw.decode(enc, errors='ignore')
        except: txt = raw.decode('utf-8', errors='ignore')
        return len(raw), txt
    except Exception as e:
        return 0, 'ERR:' + str(e)[:80]
for name, urls in SITES.items():
    for u in urls:
        size, txt = fetch(u)
        if size == 0:
            print(f'[{name}] {u} → 失败 {txt[:60]}')
            continue
        is_template = ('{{$' in txt) or ('{{out(' in txt)
        links = set(re.findall(r'href=[\"\']([^\"\']+)[\"\']', txt))
        html_links = [l for l in links if l.endswith(('.html','.htm','.shtml')) or '/info/' in l or 'zsw' in l]
        kw = [k for k in ['入学须知','招生','新生','通知','公告','选课','学籍','借阅','开放时间','就业','专业'] if k in txt]
        print(f'[{name}] {u[:45]} → {size//1024}KB, 模板壳={is_template}, 静态文章链={len(html_links)}, 关键词={kw[:5]}')
        if html_links and not is_template:
            for l in sorted(html_links)[:4]: print('    例:', l[:90])
        break  # 每站测第一个可用 URL 即可
