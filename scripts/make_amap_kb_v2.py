# -*- coding: utf-8 -*-
"""把 images-amap 目录下所有 PNG 合成一份可直接上传元器的图文知识库 HTML。"""
import os, base64

ROOT = r"C:/Users/34686/WorkBuddy/2026-07-30-15-35-58/jlau-ai-assistant"
IMGDIR = os.path.join(ROOT, "docs", "yuanqi", "images-amap")
OUT = os.path.join(ROOT, "docs", "yuanqi", "图文知识库样张-高德地图-全场景.html")

def b64(p):
    with open(p, "rb") as f:
        return base64.b64encode(f.read()).decode()

SECTIONS = [
    ('map_campus.png', '校园总览地图', '以吉林农业大学第三食堂为中心（真实校内 POI）的校园地图，可见运动场、图书馆、青湖/蓝湖及各学院楼。新生问「学校在哪/宿舍食堂怎么走」时，可引用本图。'),
    ('map_food.png', '周边美食地图', '农大周边主要餐饮集中区域：迅驰广场、农大北路、大学城后街、李季酱骨头等。新生问「附近吃什么」时引用。注：B/C/D/E 标记为大致方位，具体店铺以实地为准。'),
    ('map_shopping.png', '周边购物地图', '主要购物点：校门口周边小型便利店、校内一站式购物中心、迅驰广场沃尔玛。'),
    ('map_train.png', '长春站到校地图', '长春站位于市区北部，农大位于净月新城大街 2888 号。火车站打车约 50 元/40 分钟；公交 115 路约 2 元/70 分钟。'),
    ('map_airport.png', '龙嘉机场到校地图', '长春龙嘉国际机场位于市区东北部，距农大较远。机场大巴到市区后转轻轨/公交或打车直达学校。'),
    ('map_hotel.png', '家长住宿地图', '北门外及周边是家长送新生时较近的住宿聚集区，经济型宾馆 40–150 元为主。'),
    ('map_jingdian.png', '周边景点地图', '农大周边主要周末去处：净月潭国家森林公园（学生票约 15 元）、长影世纪城，均位于校园东南方向。'),
    ('map_report.png', '报到路线地图', '新生报到一般由新城大街校门进入校园。'),
]

html = '''<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>吉小农-高德地图图片知识库</title></head>
<body style="font-family:sans-serif;max-width:800px;margin:40px auto;line-height:1.7;color:#333;">
<h1>吉小农 · 高德地图图片知识库</h1>
<p>本文件图片由高德地图静态 API 基于真实坐标生成，用于元器/Coze 等知识库「回答带图」。</p>
<p><strong>坐标说明</strong>：A 标注点为吉林农业大学（以校内真实 POI「第三食堂」125.410115,43.809345 为中心）；其余周边 POI 为基于公开信息的估算坐标，仅作方向/范围参考，具体以实地为准。</p>
<hr>
'''

for fname, title, desc in SECTIONS:
    p = os.path.join(IMGDIR, fname)
    if not os.path.exists(p):
        continue
    img = b64(p)
    html += f'''
<h2>{title}</h2>
<p>{desc}</p>
<img src="data:image/png;base64,{img}" style="max-width:100%;border:1px solid #ddd;border-radius:8px;" alt="{title}">
<hr>
'''

html += '<p><em>地图审图号：GS(2018)1709 号（高德地图）</em></p></body></html>'

with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)

print("written", OUT, "bytes", os.path.getsize(OUT))
