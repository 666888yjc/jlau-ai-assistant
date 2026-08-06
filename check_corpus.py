# -*- coding: utf-8 -*-
"""语料质量检查：HTML 残留 / 乱码 / 实体未解码 / 空文件。"""
import glob, re, os

files = sorted(glob.glob('server/kb-source/main/*.md') + glob.glob('server/kb-source/xxgk/*.md'))
issues = []
total_wc = 0
for f in files:
    txt = open(f, encoding='utf-8').read()
    body = txt.split('---', 2)[2] if txt.startswith('---') else txt
    wc = len(body.replace('\n', '').replace(' ', ''))
    total_wc += wc
    if re.search(r'<[a-zA-Z/][^>]*>', body):
        issues.append((f, 'HTML残留'))
    if '\ufffd' in body:
        issues.append((f, '乱码U+FFFD'))
    if re.search(r'&[a-zA-Z#0-9]+;', body):
        issues.append((f, '实体未解码'))
    if wc == 0:
        issues.append((f, '空文件'))

print('检查文件数:', len(files))
print('总字数:', total_wc)
print('问题数:', len(issues))
for f, p in issues[:30]:
    print('  ', os.path.basename(f), p)

# 检查 CATALOG 与文件数一致性
cat = open('server/kb-source/00-CATALOG.md', encoding='utf-8').read()
rows = [l for l in cat.splitlines() if l.startswith('| ') and not l.startswith('| 序号')]
print('CATALOG 行数:', len(rows))
print('CATALOG 与文件数一致:', len(rows) == len(files))
