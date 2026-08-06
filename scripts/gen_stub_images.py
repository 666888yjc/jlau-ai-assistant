import base64, os
from PIL import Image, ImageDraw, ImageFont

OUT = r"c:/Users/34686/WorkBuddy/2026-07-30-15-35-58/jlau-ai-assistant/docs/yuanqi/images-stub"
os.makedirs(OUT, exist_ok=True)

def font(size):
    try:
        return ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", size)
    except Exception:
        try:
            return ImageFont.truetype("arial.ttf", size)
        except Exception:
            return ImageFont.load_default()

def make_stub(title, subtitle, color):
    w, h = 800, 500
    img = Image.new("RGB", (w, h), color)
    d = ImageDraw.Draw(img)
    d.rectangle([12, 12, w - 12, h - 12], outline=(255, 255, 255), width=4)
    f = font(40)
    b = d.textbbox((0, 0), title, font=f)
    d.text(((w - (b[2] - b[0])) / 2, h / 2 - 70), title, font=f, fill=(255, 255, 255))
    f2 = font(22)
    b2 = d.textbbox((0, 0), subtitle, font=f2)
    d.text(((w - (b2[2] - b2[0])) / 2, h / 2 + 10), subtitle, font=f2, fill=(235, 238, 242))
    tag = "【占位图】待你拍摄真实校园照片后替换"
    f3 = font(18)
    b3 = d.textbbox((0, 0), tag, font=f3)
    d.text(((w - (b3[2] - b3[0])) / 2, h - 64), tag, font=f3, fill=(255, 226, 140))
    return img

specs = [
    ("dorm", "宿舍 外观 / 内景 占位图", "吉林农业大学 学生宿舍", (64, 110, 165)),
    ("canteen", "食堂 / 餐饮 占位图", "校内食堂 就餐区", (186, 118, 58)),
    ("gate_lake", "校门 / 蓝湖 占位图", "吉林农业大学校门 · 蓝湖", (54, 142, 110)),
    ("map", "周边交通 / 地图 占位图", "校区周边公交 · 地标", (122, 88, 150)),
]
imgs = {}
for key, title, sub, col in specs:
    p = os.path.join(OUT, f"{key}-stub.png")
    make_stub(title, sub, col).save(p)
    imgs[key] = p
    print("saved", p)

def b64(p):
    with open(p, "rb") as f:
        return base64.b64encode(f.read()).decode()

sections = [
    ("宿舍住宿", "dorm",
     "吉林农业大学新生宿舍多为6-8人间，公共澡堂（部分楼栋配独立卫浴，以录取通知书为准）。洗澡可通过「完美校园」APP预约。床上用品学校通常统一代购，也可自带；具体分配以学院通知为准。",
     "03-宿舍住宿.md / 12-长春气候与四季穿衣.md"),
    ("食堂餐饮", "canteen",
     "校内有多个食堂（一食堂至五食堂等），提供家常菜、面食、清真窗口。周边农大北路、迅驰广场有火锅鸡、李季酱骨头等餐馆，人均约30-50元。",
     "09-食堂餐饮.md / 14-周边美食餐厅.md"),
    ("校门与蓝湖", "gate_lake",
     "吉林农业大学位于长春净月，校门为标志性建筑；校内蓝湖是新生打卡地。图书馆藏书303.8万册，是自习与查阅文献的主要场所。",
     "10-校园地标.md"),
    ("周边交通", "map",
     "从长春站乘115路公交约2元直达学校；轻轨4号线到东北师大站转公交可达；龙嘉机场打车约120-150元。校内可骑共享单车。",
     "02-交通到达.md / 16-校内外交通与公交.md"),
]

html = """<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>吉小农图文知识库样张（占位图验证版）</title></head><body>
<h1>吉小农图文知识库样张（占位图验证版）</h1>
<p>说明：本文件用于验证腾讯元器知识库「回答带图」机制。图片均为占位图，待你拍摄真实校园照片后替换即可（见《配图指南》）。</p>
"""
for title, key, text, src in sections:
    html += f"<h2>{title}</h2>\n"
    html += f"<img src='data:image/png;base64,{b64(imgs[key])}' alt='{title}占位图' style='max-width:480px;'/>\n"
    html += f"<p>{text}</p>\n"
    html += f"<p><small>来源：{src}</small></p>\n"
html += "</body></html>"

html_path = r"c:/Users/34686/WorkBuddy/2026-07-30-15-35-58/jlau-ai-assistant/docs/yuanqi/图文知识库样张-占位图.html"
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)
print("saved", html_path)
