# -*- coding: utf-8 -*-
"""检查 lsyg/xxbs/ldtc 页面正文容器，确定回退策略。"""
import re, urllib.request, ssl
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
def fetch(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        r = urllib.request.urlopen(req, timeout=12, context=CTX)
        raw = r.read(); enc = r.headers.get_content_charset() or 'utf-8'
        try: return raw.decode('utf-8-sig' if 'utf' in enc.lower() else enc, errors='ignore')
        except: return raw.decode('utf-8', errors='ignore')
    except Exception as e: return 'ERR:'+str(e)[:60]

for name, u in [('历史沿革','https://www.jlau.edu.cn/xxgk/lsyg.htm'),
                ('学校标识','https://www.jlau.edu.cn/xxgk/xxbs.htm'),
                ('领导题词','https://www.jlau.edu.cn/xxgk/ldtc.htm')]:
    t = fetch(u)
    print('='*20, name, u, len(t)//1024, 'KB')
    if t.startswith('ERR'): print(t); continue
    # 找正文容器
    for m in re.finditer(r'<div[^>]*(id|class)=["\']([^"\']*)["\'][^>]*>', t):
        a, v = m.group(1), m.group(2)
        if any(k in v.lower() for k in ['content','article','text','detail','nr','wz','main','zy']):
            print('  容器:', a, '=', v)
    # 统计各 vsb_content 内容长度
    for m in re.finditer(r'<div[^>]*id=["\']vsb_content[^"\']*["\'][^>]*>(.*?)</div>\s*</div>', t, re.S|re.I):
        print('  vsb_content 片段长度:', len(m.group(1)))
    # 全页去标签后的长度
    body = re.sub(r'<script.*?</script>|<style.*?</style>', '', t, flags=re.S)
    body = re.sub(r'<[^>]+>', '\n', body)
    body = re.sub(r'\n{2,}', '\n', body).strip()
    print('  全页文本长度:', len(body))
