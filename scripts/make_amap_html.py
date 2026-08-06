import base64
from pathlib import Path

project = Path(__file__).parent.parent
img_path = project / "docs/yuanqi/images-amap/jlau-campus-precise.png"
out_path = project / "docs/yuanqi/图文知识库样张-高德地图.html"

png_bytes = img_path.read_bytes()
b64 = base64.b64encode(png_bytes).decode("ascii")

html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>吉林农业大学校园导览（高德地图）</title>
<style>
  body {{ font-family: "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.7; color: #222; max-width: 720px; margin: 0 auto; padding: 20px; }}
  h1 {{ color: #2E7D32; font-size: 22px; border-bottom: 2px solid #C8E6C9; padding-bottom: 8px; }}
  h2 {{ color: #1B5E20; font-size: 18px; margin-top: 28px; }}
  img {{ max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px; margin: 12px 0; }}
  .tip {{ background: #E8F5E9; border-left: 4px solid #43A047; padding: 10px 14px; border-radius: 4px; margin: 12px 0; }}
  .src {{ font-size: 12px; color: #666; }}
  ul {{ margin: 8px 0; }}
</style>
</head>
<body>
<h1>吉林农业大学校园导览（高德地图）</h1>
<p>本文档把高德地图截取的校园位置图与文字信息结合，可上传到元器/Coze 知识库，让吉小农回答带图的校园问题。地图来源：高德静态地图 API；文字来源：学校团委官网新生攻略、2026 招生章程等官方公开信息。</p>

<h2>一、校园位置总览</h2>
<img src="data:image/png;base64,{b64}" alt="吉林农业大学校园地图（A 标注为第三食堂，周边可见学生公寓与运动场）">
<p>图中 A 标注点为校内第三食堂，周边分布有：</p>
<ul>
  <li><strong>学生公寓区</strong>：A3-A8 号楼（西侧）、B2-B7 号楼（东侧），是学校主要宿舍区。</li>
  <li><strong>食堂</strong>：3 食堂在标注点附近；学校另有多个食堂供选择。</li>
  <li><strong>运动场地</strong>：第一运动场（北侧）、第二运动场（西南侧）、足球场、体育馆。</li>
  <li><strong>学院建筑</strong>：经济管理学院、国际足球教育学院等。</li>
</ul>
<div class="tip">
  <strong>新生报到怎么走？</strong> 学校地址：吉林省长春市长春净月高新技术产业开发区德正街道农大社区新城大街 2888 号。从长春站乘地铁 1 号线到卫星广场，换乘轻轨 3 号线在「福祉大路/净月大街」一带下车，再打车约 10 元；或直接打车 50 元左右。报到当天从校门进入后，一般会有学长学姐引导至宿舍区。
</div>
<p class="src">来源：吉林农业大学 2026 年招生章程；长春交通公开信息；高德地图。</p>

<h2>二、宿舍区（位置图 + 文字）</h2>
<p>宿舍位于图中第一/第二运动场以东、3 食堂以北/以南的公寓楼群内。学校宿舍分为四人寝、六人寝和八人寝，多为六人间上下铺，住宿费约 750 元/年（具体以录取通知书为准）。</p>
<ul>
  <li>宿舍没有独立卫生间，每层设有公共卫生间，一楼配有洗衣机、吹风机和晾衣房。</li>
  <li>各宿舍楼一楼有洗衣房，可用微信支付或校园卡；吹风机为微信支付，0.5 元/3 分钟。</li>
  <li>床上用品一般在新生报到时统一购买；军训期间需统一化。</li>
  <li>宿舍早上约 5 点给电，晚上 11 点断电；女生寝室约 10:30 封寝。</li>
</ul>
<p class="src">来源：吉林农业大学团委官网《新生秘籍之玩转大学！》https://tuanwei.jlau.edu.cn/a/zhaoshengxinxi/1017.html</p>

<h2>三、食堂餐饮</h2>
<p>校内主要食堂包括三食堂（鸿之桐）、四食堂（鸿之泽）、五食堂（鸿之磐），菜系覆盖较广。四食堂三楼有小火锅，三/四食堂二楼有面食。学校还有"浓渡"咖啡厅供交流休闲。</p>
<p class="src">来源：吉林农业大学团委官网《新生秘籍之玩转大学！》https://tuanwei.jlau.edu.cn/a/zhaoshengxinxi/1017.html</p>

<h2>四、运动场与校园地标</h2>
<p>第一运动场、第二运动场、蓝湖是学校常见地标。蓝湖位于校园内，是拍照打卡点。体育馆门、各学院楼沿主路分布。</p>
<p class="src">来源：吉林农业大学团委官网《新生攻略||我在吉林农业大学等你！》https://tuanwei.jlau.edu.cn/a/zhaoshengjiuye/1003.html</p>

<h2>五、使用说明（给运营同学）</h2>
<p>本文档中的地图截图通过高德静态地图 API 生成，坐标取自校内真实 POI（第三食堂），地图真实可信。宿舍内部照片、食堂内部照片等实拍图因涉及版权和真实性，本文档未直接放入；如需补充，请使用学校官网、官微或招生办发布的图片，或自行拍摄后替换。</p>
</body>
</html>"""

out_path.write_text(html, encoding="utf-8")
print(f"generated {out_path}")
