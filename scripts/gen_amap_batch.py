# -*- coding: utf-8 -*-
"""批量生成吉小农高德静态地图 + 合成元器图文知识库样张。
坐标来源：真实 POI（三食堂）+ OSM 免费地理编码兜底（国内网络偶发失败时回落预估坐标）。
"""
import os, base64, urllib.parse, urllib.request, json

ROOT = r"C:/Users/34686/WorkBuddy/2026-07-30-15-35-58/jlau-ai-assistant"
ENV = os.path.join(ROOT, "server", ".env")
OUTDIR = os.path.join(ROOT, "docs", "yuanqi", "images-amap")
os.makedirs(OUTDIR, exist_ok=True)

# 读 key
amap_key = ""
for line in open(ENV, encoding="utf-8"):
    if line.startswith("AMAP_API_KEY"):
        amap_key = line.split("=", 1)[1].strip()
print("key prefix:", amap_key[:8])

# 坐标：真实 POI + 预估兜底
COORD = {
    "campus":   (125.410115, 43.809345),  # 真实：三食堂 POI
    "xunchi":   (125.4205, 43.8120),      # 迅驰广场（估）
    "huoguo":   (125.4150, 43.8150),      # 农大北路火锅鸡（估）
    "houjie":   (125.4050, 43.8050),      # 大学城后街（估）
    "lijijiang":(125.4180, 43.8100),      # 李季酱骨头（估）
    "mall_in":  (125.4120, 43.8105),      # 校内一站式购物中心（估）
    "changchunzhan": (125.3135, 43.9006), # 长春站（估）
    "longjia":  (125.6840, 43.9920),      # 龙嘉机场（估）
    "jingyuetan": (125.4300, 43.7700),    # 净月潭（估）
    "changying": (125.4300, 43.7480),     # 长影世纪城（估）
    "beimen":   (125.4080, 43.8120),      # 北门外宾馆区（估）
    "xincheng": (125.4100, 43.8085),      # 新城大街校门（估）
}

def geocode_osm(query):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": query, "format": "json", "limit": 1})
    req = urllib.request.Request(url, headers={"User-Agent": "jlau-helper/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            d = json.load(r)
            if d:
                return float(d[0]["lon"]), float(d[0]["lat"])
    except Exception as e:
        print("  osm fail:", query, e)
    return None

# 用 OSM 修正几个关键坐标
fix = {
    "xunchi": "迅驰广场 长春",
    "changchunzhan": "长春站",
    "longjia": "长春龙嘉国际机场",
    "jingyuetan": "净月潭国家森林公园",
    "changying": "长影世纪城",
}
for k, q in fix.items():
    c = geocode_osm(q)
    if c:
        COORD[k] = c
        print("  osm ok:", k, c)

def staticmap(center, zoom, markers, fname, size="800*500"):
    params = {
        "location": f"{center[0]},{center[1]}",
        "zoom": str(zoom),
        "size": size,
        "key": amap_key,
        "markers": markers,
    }
    url = "https://restapi.amap.com/v3/staticmap?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            data = r.read()
    except Exception as e:
        print("  staticmap fail:", fname, e)
        return False
    out = os.path.join(OUTDIR, fname)
    with open(out, "wb") as f:
        f.write(data)
    ok = data[:4] == b"\x89PNG"
    print(f"  {'OK' if ok else 'FAIL'} {fname} bytes={len(data)}")
    return ok

def mk(lbl, lng, lat):
    return f"mid,,{lbl}:{lng},{lat}"

# 1) 校园位置图
staticmap(COORD["campus"], 16, mk("A", *COORD["campus"]), "map_campus.png")
# 2) 周边美食
staticmap(COORD["campus"], 15,
          "|".join([mk("A", *COORD["campus"]), mk("B", *COORD["xunchi"]),
                    mk("C", *COORD["huoguo"]), mk("D", *COORD["houjie"]),
                    mk("E", *COORD["lijijiang"])]),
          "map_food.png")
# 3) 购物
staticmap(COORD["campus"], 15,
          "|".join([mk("A", *COORD["campus"]), mk("B", *COORD["xunchi"]),
                    mk("C", *COORD["mall_in"])]),
          "map_shopping.png")
# 4) 交通-长春站
cz = ((COORD["changchunzhan"][0] + COORD["campus"][0]) / 2,
      (COORD["changchunzhan"][1] + COORD["campus"][1]) / 2)
staticmap(cz, 11,
          "|".join([mk("A", *COORD["changchunzhan"]), mk("B", *COORD["campus"])]),
          "map_train.png")
# 5) 交通-龙嘉机场
cz2 = ((COORD["longjia"][0] + COORD["campus"][0]) / 2,
       (COORD["longjia"][1] + COORD["campus"][1]) / 2)
staticmap(cz2, 10,
          "|".join([mk("A", *COORD["longjia"]), mk("B", *COORD["campus"])]),
          "map_airport.png")
# 6) 家长宾馆
staticmap(COORD["campus"], 15,
          "|".join([mk("A", *COORD["campus"]), mk("B", *COORD["beimen"])]),
          "map_hotel.png")
# 7) 景点
staticmap((125.42, 43.78), 12,
          "|".join([mk("A", *COORD["campus"]), mk("B", *COORD["jingyuetan"]),
                    mk("C", *COORD["changying"])]),
          "map_jingdian.png")
# 8) 报到路线（新城大街校门）
staticmap(COORD["campus"], 16,
          "|".join([mk("A", *COORD["campus"]), mk("B", *COORD["xincheng"])]),
          "map_report.png")

print("ALL DONE")
