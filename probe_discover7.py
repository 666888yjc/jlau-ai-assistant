# -*- coding: utf-8 -*-
"""六轮探测：调试主站 dropped 页面 + xxgk 列表容器正则。"""
import re, html, urllib.request, ssl
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

def html_to_text(fragment):
    text = fragment
    text = re.sub(r'</(p|div|li|tr|h[1-6]|table|ul|ol|blockquote|section)>', '\n', text, flags=re.I)
    text = re.sub(r'<(p|div|li|tr|h[1-6]|table|ul|ol|blockquote|section)[^>]*>', '\n', text, flags=re.I)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.I)
    text = re.sub(r'<[^>]+>', '', text)
    text = html.unescape(text)
    lines = [ln.strip() for ln in text.splitlines()]
    out, blank = [], 0
    for ln in lines:
        if not ln:
            blank += 1
            if blank >= 2: continue
            out.append('')
        else:
            blank = 0
            out.append(re.sub(r'[ \t\u3000]+', ' ', ln))
    while out and not out[0]: out.pop(0)
    while out and not out[-1]: out.pop()
    return '\n'.join(out)

print('=== A) 主站 dropped 页面 vsb_content 文本 ===')
for name, u in [('历史沿革','https://www.jlau.edu.cn/xxgk/lsyg.htm'),
                ('学校标识','https://www.jlau.edu.cn/xxgk/xxbs.htm'),
                ('领导题词','https://www.jlau.edu.cn/xxgk/ldtc.htm')]:
    t = fetch(u)
    m = re.search(r'<div[^>]*\bid=["\']vsb_content["\'][^>]*>(.*?)</div>\s*</div>', t, re.S|re.I)
    if m:
        txt = html_to_text(m.group(1))
        print(f'  {name}: vsb_content 文本 {len(txt)}字 | 开头: {txt[:120].replace(chr(10)," / ")}')

print()
print('=== B) xxgk 列表容器 line_u5 正则 ===')
for name, u in [('学籍管理','https://xxgk.jlau.edu.cn/xxgklm1/xsglfwxx/xjglbf.htm'),
                ('十四五规划','https://xxgk.jlau.edu.cn/xxgklm1/jbxx/xx_ssw_gh1.htm'),
                ('招生章程','https://xxgk.jlau.edu.cn/xxgklm1/zsksxx/zszcjtslxzsbf.htm')]:
    t = fetch(u)
    lis = re.findall(r'<li[^>]*id=["\']line_u\d+_\d+["\'][^>]*>(.*?)</li>', t, re.S|re.I)
    print(f'  [{name}] line_u5 列表项: {len(lis)}')
    for li in lis[:8]:
        m = re.search(r'href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', li, re.S|re.I)
        if m:
            anchor = html.unescape(re.sub(r'<[^>]+>', '', m.group(2))).strip()
            print(f'    {anchor[:24]:<26} {m.group(1)[:40]}')
    # 也试试通用 li 带日期的
    lis2 = re.findall(r'<li[^>]*>(.*?\[20\d\d[-\/]\d{1,2}[-\/]\d{1,2}\].*?)</li>', t, re.S|re.I)
    print(f'  [{name}] 带日期 li: {len(lis2)}')
