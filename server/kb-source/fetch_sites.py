# -*- coding: utf-8 -*-
"""
吉小农 · 官网信息抓取器（原始语料采集，纯标准库）

作用：抓取吉林农业大学官网可直抓来源的栏目/文章正文，输出为 markdown 原始语料，
     供后续知识库整理入库使用。本脚本不修改 server/kb/（正式知识库）。

来源与模式：
  - main  主站 www.jlau.edu.cn    ：概况类单页（direct）
  - xxgk  信息公开 xxgk.jlau.edu.cn：栏目页 → 文章详情（category，正文容器 #vsb_content* / .v_news_content）
  - jwc   教务处（SPA，探测数据接口，找不到则待办）
  - zhaosheng 招生站（模板壳，探测详情页模式，找不到则待办）
  - lib/zhjy 图书馆/就业（空壳，标注待办）

输出：
  server/kb-source/<来源>/<两位序号>-<标题>.md   （frontmatter: 标题/来源/栏目/抓取日期）
  server/kb-source/00-CATALOG.md                （清单表格）

约束：
  - 仅标准库（urllib/re/html/ssl/…），不装第三方包
  - SSL 校验关闭（Windows 证书吊销检查绕过）
  - 请求间隔 >= 0.5s，超时 12s，失败重试 1 次
  - 正文 < 200 字丢弃；去重；过滤 css/js/图片/登录/内网链接
"""
import datetime
import html as html_mod
import os
import re
import ssl
import sys
import time
import urllib.request
from urllib.parse import urljoin, urlparse

# ---------- 基础配置 ----------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = SCRIPT_DIR   # 输出到脚本所在目录 server/kb-source/ 下
TODAY = datetime.date.today().isoformat()         # 2026-08-05
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
REQUEST_INTERVAL = 0.6   # 秒，>= 0.5
TIMEOUT = 12
RETRY = 1                # 失败重试次数
MIN_BODY_LEN = 200       # 正文最小字数（丢弃过短）
GLOBAL_CAP = 70          # 全局文章总数上限

# 目录键：来源目录名 -> 来源标签
SOURCE_LABELS = {
    'main': '主站',
    'xxgk': '信息公开',
    'jwc': '教务处',
    'zhaosheng': '招生站',
    'lib': '图书馆',
    'zhjy': '就业站',
}

# 正文容器候选模式（取其中文本最长的作为正文，规避空壳 wrapper）
CONTAINER_PATTERNS = [
    r'<div[^>]*\bid=["\']vsb_content[^"\']*["\'][^>]*>',
    r'<div[^>]*\bclass=["\'][^"\']*v_news_content[^"\']*["\'][^>]*>',
    r'<div[^>]*\bclass=["\'][^"\']*zy_con[^"\']*["\'][^>]*>',
    r'<div[^>]*\bid=["\']content["\'][^>]*>',
    r'<div[^>]*\bclass=["\'][^"\']*article[^"\']*["\'][^>]*>',
]

# 标题后缀清理
TITLE_SUFFIXES = [
    '-吉林农业大学', '_吉林农业大学', '| 吉林农业大学', '-学校概况', '-信息公开',
    '-吉林农业大学信息公开', '_吉林农业大学信息公开', ' - 吉林农业大学', ' | 吉林农业大学',
    '-信息公开网', '_信息公开网',
]

# 页面里常见的导航/无效链接关键词（href 过滤）
LINK_BLOCKLIST = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
                  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar',
                  'login', 'logout', 'javascript:', 'mailto:', 'tel:',
                  '10.', '192.168.', '127.0.0.1', 'localhost', 'gongkai.jlu.edu.cn']

# 可抓取入口配置：source / 栏目 / 模式 / URL / 该栏目最多取几篇
ENTRIES = [
    # ---- 主站（direct：页面本身就是文章） ----
    ('main', '学校简介', 'direct', 'https://www.jlau.edu.cn/xxgk/xxjj.htm'),
    ('main', '历史沿革', 'direct', 'https://www.jlau.edu.cn/xxgk/lsyg.htm'),
    ('main', '大学章程', 'direct', 'https://www.jlau.edu.cn/xxgk/dxzc.htm'),
    ('main', '学校定位', 'direct', 'https://www.jlau.edu.cn/xxgk/xxdw.htm'),
    ('main', '校情统计', 'direct', 'https://www.jlau.edu.cn/xxgk/xqtj.htm'),
    ('main', '学校标识', 'direct', 'https://www.jlau.edu.cn/xxgk/xxbs.htm'),
    ('main', '领导题词', 'direct', 'https://www.jlau.edu.cn/xxgk/ldtc.htm'),
    ('main', '历任领导', 'direct', 'https://www.jlau.edu.cn/xxgk/lrld.htm'),
    # ---- 信息公开（category：栏目页 → 文章详情） ----
    ('xxgk', '学校章程', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/jbxx/xxzc.htm'),
    ('xxgk', '制定的各项规章制度', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/jbxx/zddgxgzzd.htm'),
    ('xxgk', '学籍管理办法', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/xsglfwxx/xjglbf.htm'),
    ('xxgk', '学生奖励处罚办法', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/xsglfwxx/xsjlcfbf.htm'),
    ('xxgk', '学生申诉办法', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/xsglfwxx/xsssbf.htm'),
    ('xxgk', '学生资助管理', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/xsglfwxx/xsjxj_zxj_xfjm_zxdk_qgjxdsqyglgd.htm'),
    ('xxgk', '招生章程及特殊类型招生办法', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/zsksxx/zszcjtslxzsbf.htm'),
    ('xxgk', '研究生招生', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/zsksxx/yjszsjz_zszyml_fslqbfgy_x_s_hxk_zyzsyjsrs.htm'),
    ('xxgk', '办学基本情况', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/jbxx/bxjbqk.htm'),
    ('xxgk', '学校十四五规划', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/jbxx/xx_ssw_gh1.htm'),
    ('xxgk', '本科教学质量报告', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/jxzlxx/bkjxzlbg.htm'),
    ('xxgk', '毕业生就业质量年度报告', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/jxzlxx/gxbysjyzlndbg.htm'),
    ('xxgk', '艺术教育发展年度报告', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/jxzlxx/ysjyfzndbg.htm'),
    ('xxgk', '学风建设', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/xfjsxx/xfjs.htm'),
    ('xxgk', '学术规范', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/xfjsxx/xsgf.htm'),
    ('xxgk', '学术不端行为查处机制', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/xfjsxx/xsbdxwccjz.htm'),
    ('xxgk', '岗位设置管理与聘用办法', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/rsszxx/gwszglypybf.htm'),
    ('xxgk', '教职工代表大会制度', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/jbxx/jzgdbdhzd.htm'),
    ('xxgk', '学术委员会相关制度', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/jbxx/xswyhxgzd.htm'),
    ('xxgk', '教职工代表大会工作报告', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/jbxx/jzgdbdhgzbg.htm'),
    ('xxgk', '分批次分科类招生计划', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/zsksxx/fpc_fklzsjh.htm'),
    ('xxgk', '招生咨询及考生申诉渠道', 'category', 'https://xxgk.jlau.edu.cn/xxgklm1/zsksxx/zszxjksssqd.htm'),
    ('xxgk', '信息公开规定与制度', 'direct', 'https://xxgk.jlau.edu.cn/xxgkgdyzd.htm'),
    ('xxgk', '信息公开年度报告', 'direct', 'https://xxgk.jlau.edu.cn/xxgkndbg.htm'),
    ('xxgk', '信息公开指南', 'direct', 'https://xxgk.jlau.edu.cn/xxgkzn.htm'),
    ('xxgk', '信息公开目录', 'direct', 'https://xxgk.jlau.edu.cn/xxgkml.htm'),
    ('xxgk', '信息公开申请', 'direct', 'https://xxgk.jlau.edu.cn/xxgksq.htm'),
]

# 栏目级上限（category 模式每栏目最多取几篇）
CATEGORY_CAP = {
    'xxgk': 6,
}
SOURCE_CAP = {  # 每来源最多取几篇
    'main': 12,
    'xxgk': 65,
}

# 待办探测来源（SPA / 模板壳 / 空壳）：尝试，抓不到则标注待办
PROBE_ONLY = [
    ('jwc', '教务处', '学籍管理列表', 'http://jwc.jlau.edu.cn/portal/index/list?id=57944687eeeb4cc6bfdda961eac5efa5'),
    ('jwc', '教务处', '吉农校历列表', 'http://jwc.jlau.edu.cn/portal/index/list?id=da327428b6184156a43d0d4d47ec6f28'),
    ('zhaosheng', '招生站', '专业介绍列表', 'http://zhaosheng.jlau.edu.cn/zsw/zyjs_gk_list.html'),
    ('lib', '图书馆', '首页', 'http://lib.jlau.edu.cn/'),
    ('zhjy', '就业站', '首页', 'http://zhjy.jlau.edu.cn/'),
]


# ---------- 网络层 ----------
class Fetcher:
    """带 SSL 绕过、UA、频率控制、重试的抓取器。"""

    def __init__(self):
        self.ctx = ssl.create_default_context()
        self.ctx.check_hostname = False
        self.ctx.verify_mode = ssl.CERT_NONE
        self.last_request_at = 0.0
        self.stats = {'requests': 0, 'errors': 0}

    def _throttle(self):
        elapsed = time.time() - self.last_request_at
        if elapsed < REQUEST_INTERVAL:
            time.sleep(REQUEST_INTERVAL - elapsed)

    def fetch(self, url):
        """抓取并解码为文本；失败重试 RETRY 次。返回 (ok, text, error)。"""
        for attempt in range(RETRY + 1):
            self._throttle()
            self.last_request_at = time.time()
            self.stats['requests'] += 1
            try:
                req = urllib.request.Request(url, headers={'User-Agent': UA})
                resp = urllib.request.urlopen(req, timeout=TIMEOUT, context=self.ctx)
                raw = resp.read()
                enc = resp.headers.get_content_charset() or 'utf-8'
                try:
                    if enc.lower().replace('-', '') in ('utf8', 'utf8sig'):
                        text = raw.decode('utf-8-sig', errors='ignore')  # 处理 BOM
                    else:
                        text = raw.decode(enc, errors='ignore')
                except Exception:
                    text = raw.decode('utf-8', errors='ignore')
                return True, text, ''
            except Exception as e:  # noqa: BLE001
                self.stats['errors'] += 1
                last_err = str(e)[:100]
                if attempt < RETRY:
                    time.sleep(0.8)
        return False, '', last_err


# ---------- 正文/标题提取 ----------
def _find_container_end(html_text, start):
    """从容器开标签结束位置起，按 <div>/</div> 配对找到闭合位置（容忍少量不配对）。"""
    depth = 1
    pos = start
    while pos < len(html_text) and depth > 0:
        open_m = re.search(r'<div\b', html_text[pos:], re.I)
        close_m = re.search(r'</div>', html_text[pos:], re.I)
        if not open_m and not close_m:
            break
        if close_m and (not open_m or close_m.start() < open_m.start()):
            depth -= 1
            pos += close_m.end()
        else:
            depth += 1
            pos += open_m.end()
    return pos


def _all_container_inner(html_text):
    """返回所有候选容器的 inner HTML 列表（按出现顺序）。"""
    cleaned = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', html_text, flags=re.S | re.I)
    results = []
    for pat in CONTAINER_PATTERNS:
        for m in re.finditer(pat, cleaned, re.I):
            end = _find_container_end(cleaned, m.end())
            inner = cleaned[m.end():end]
            if inner and len(inner) > 50:
                results.append(inner)
    return results


def html_to_text(fragment):
    """HTML → 纯文本：块级标签换行、去标签、规范化空白，保留段落。"""
    if not fragment:
        return ''
    text = fragment
    # 块级标签前/后换行
    text = re.sub(r'</(p|div|li|tr|h[1-6]|table|ul|ol|blockquote|section)>',
                  '\n', text, flags=re.I)
    text = re.sub(r'<(p|div|li|tr|h[1-6]|table|ul|ol|blockquote|section)[^>]*>',
                  '\n', text, flags=re.I)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.I)
    text = re.sub(r'<[^>]+>', '', text)
    text = html_mod.unescape(text)
    # 规范化空白：每行去首尾空白，压缩连续空行
    lines = [ln.strip() for ln in text.splitlines()]
    out = []
    blank = 0
    for ln in lines:
        if not ln:
            blank += 1
            if blank >= 2:
                continue
            out.append('')
        else:
            blank = 0
            out.append(re.sub(r'[ \t\u3000]+', ' ', ln))
    # 去首尾空行
    while out and not out[0]:
        out.pop(0)
    while out and not out[-1]:
        out.pop()
    return '\n'.join(out)


def clean_title(raw_title):
    """清理标题：去站点后缀、去空白。"""
    if not raw_title:
        return ''
    title = raw_title.strip()
    for suf in TITLE_SUFFIXES:
        if title.endswith(suf):
            title = title[: -len(suf)].strip()
    title = re.sub(r'\s+', ' ', title)
    return title


def extract_title(html_text, container_html):
    """优先取 <title>（已清理站点后缀），其次正文容器内 h1/h2。"""
    m = re.search(r'<title[^>]*>(.*?)</title>', html_text, re.S | re.I)
    if m:
        t = clean_title(html_mod.unescape(re.sub(r'<[^>]+>', '', m.group(1))))
        if 4 <= len(t) <= 120:
            return t
    if container_html:
        for m in re.finditer(r'<h[12][^>]*>(.*?)</h[12]>', container_html, re.S | re.I):
            t = clean_title(html_mod.unescape(re.sub(r'<[^>]+>', '', m.group(1))))
            if 4 <= len(t) <= 120:
                return t
    # 兜底：页面内第一个足够长的 h1/h2
    for m in re.finditer(r'<h[12][^>]*>(.*?)</h[12]>', html_text, re.S | re.I):
        t = clean_title(html_mod.unescape(re.sub(r'<[^>]+>', '', m.group(1))))
        if 4 <= len(t) <= 120:
            return t
    return '未命名'


def extract_article(html_text):
    """从整页 HTML 提取 (title, body_text)。

    正文容器选择：取所有候选容器中「文本长度 - 链接惩罚」得分最高者，
    规避左/右侧导航容器（链接多、正文少）被误选。
    """
    containers = _all_container_inner(html_text)
    best_inner = ''
    best_score = float('-inf')
    for inner in containers:
        t = html_to_text(inner)
        nlinks = len(re.findall(r'<a\b', inner, re.I))
        score = len(t) - nlinks * 20  # 每个链接罚 20 字
        if score > best_score:
            best_score = score
            best_inner = inner
    title = extract_title(html_text, best_inner)
    body = html_to_text(best_inner) if best_inner else html_to_text(
        re.sub(r'<script.*?</script>|<style.*?</style>', ' ', html_text, flags=re.S | re.I))
    body = _strip_junk_lines(body)
    return title, body


def _strip_junk_lines(body):
    """去掉常见导航/版权/日期残渣行，避免污染正文。"""
    if not body:
        return body
    junk_patterns = [
        r'^版权所有.*$', r'^地址：.*$', r'^邮编.*$', r'^电话：.*$',
        r'^传真.*$', r'^邮箱.*$', r'^网站管理.*$', r'^技术支持.*$',
        r'^快速链接$', r'^学校概况$', r'^新闻中心$', r'^通知公告$',
        r'^组织机构$', r'^人才培养$', r'^科学研究$', r'^社会服务$',
        r'^合作交流$', r'^校园文化$', r'^信息公开$', r'^招生就业$',
        r'^人才招聘$', r'^校友总会$', r'^English$', r'^设为首页$',
        r'^加入收藏$', r'^上一篇.*$', r'^下一篇.*$', r'^上一条.*$', r'^下一条.*$',
        r'^更新时间[:：].*$', r'^发布人[:：].*$', r'^作者[:：].*$', r'^来源[:：].*$',
        r'^浏览次数.*$', r'^阅读次数.*$', r'^点击.*次$',
        r'^发表于[:：].*$', r'^点击[:：].*$', r'^正文$', r'^首页$', r'^农大首页$',
        r'^吉林农业大学本科招生信息网$', r'^信息公开栏目$', r'^基本信息$',
        r'^招生考试信息$', r'^教学质量信息$', r'^学生管理服务信息$',
        r'^学位、学科信息$', r'^财务、资产及收费信息$', r'^人事师资信息$',
        r'^对外交流与合作信息$', r'^巡视整改$', r'^突发事件$',
        r'^转换链接错误.*$', r'^wblanguage.*$',
        r'^var newimg\d+ = new Image\(\);?$', r'^newimg\d+\.src.*$',
    ]
    # 精确导航锚词（xxgk 侧边栏/顶栏，来自首页栏目清单），整行匹配即剔除
    nav_anchors = {
        '信息公开指南', '信息公开目录', '信息公开申请', '信息公开规定与制度',
        '信息公开年度报告', '信息公开网', '学校简介', '大学章程', '领导机构',
        '历史沿革', '校情统计', '学校标识', '学校定位', '领导题词', '历任领导',
        '办学基本情况', '学校章程', '制定的各项规章制度', '教职工代表大会制度',
        '教职工代表大会工作报告', '学术委员会相关制度', '学校“十四五”规划',
        '招生章程及特殊类型招生办法', '分批次、分科类招生计划',
        '保送、自主选拔录取、高水平运动员和艺术特长生招生等特殊类型招生入选考生资格及测试结果',
        '研究生招生', '招生咨询及考生申诉渠道', '学风建设', '学术规范',
        '学术不端行为查处机制', '岗位设置管理与聘用办法', '图书馆', '国际交流',
        '纪检监察', '采购招标', '招生信息', '校园网络', '语委会', '三江实验室',
        '学生奖励处罚办法', '学生申诉办法', '学生资助管理', '学籍管理办法',
        '本科教学质量报告', '毕业生就业质量年度报告', '艺术教育发展年度报告',
        '专业设置、当年新增专业、停招专业名单', '中外合作办学情况',
        '仪器设备、图书、药品等物资设备采购和重大基建工程的招投标',
        '促进毕业生就业的政策措施和指导服务', '债券信息公开', '农大首页',
        '分批次、分科类录取人数和录取最低分', '受捐赠财产的使用与管理情况',
        '参加研究生复试的考生成绩', '招聘信息', '拟录取研究生名单',
        '拟授予硕士博士学位同等学力人员资格审查和学力水平认定',
        '拟新增学位授权学科或专业学位授权点的申报及论证材料',
        '授予博士硕士学士学位的基本要求', '收支决算表', '收支预算表',
        '收费项目、收费依据、收费标准及投诉方式', '教职工争议解决办法',
        '新增硕士博士学位授权学科或专业学位授权点审核办法',
        '新生复查期间有关举报、调查及处理结果',
        '本科生占全日制在校生总数的比例、教师数量及结构', '来华留学生管理相关规定',
        '校内中层干部任免信息', '校办企业资产 、负债、国有资产保值增值等信息',
        '校级领导干部因公出国（境）情况', '校级领导干部社会兼职情况',
        '毕业生的规模、结构、就业率、就业流向', '研究生招生咨询及申诉渠道',
        '考生个人录取信息查询渠道和办法', '财务决算公开', '财务和资产管理制度',
        '财务预算公开', '首页', 'Next', 'Previous',
    }
    lines = body.split('\n')
    kept = []
    for ln in lines:
        s = ln.strip()
        if not s:
            kept.append(ln)
            continue
        if s in nav_anchors:
            continue
        if any(re.match(p, s) for p in junk_patterns):
            continue
        kept.append(ln)
    # 去掉首尾空行
    while kept and not kept[0].strip():
        kept.pop(0)
    while kept and not kept[-1].strip():
        kept.pop()
    return '\n'.join(kept)


def _is_stub_body(body):
    """正文疑似纯导航/占位 stub（真实内容在别处，如模板壳站点）：返回 True。"""
    if not body:
        return True
    lines = [l.strip() for l in body.splitlines() if l.strip()]
    if not lines:
        return True
    nav_markers = ('信息公开指南', '信息公开目录', '信息公开申请', '信息公开网',
                   '学校简介', '大学章程', '农大首页', '首页', '快速链接',
                   '信息公开栏目', '招生考试信息', '教学质量信息')
    nav_count = sum(1 for l in lines if l in nav_markers or l.startswith('转换链接错误'))
    return nav_count / len(lines) > 0.4


# ---------- 链接提取 ----------
def extract_category_links(html_text, base_url):
    """从栏目页提取文章链接。

    只认 CMS 列表项 <li id="line_uN_M">…</li>（真实文章列表），
    规避左侧/侧边栏相关推荐链接（如办学基本情况、信息公开指南等）。
    返回有序 [(url, anchor)]；无列表项时返回 []。
    """
    seen = {}
    for li in re.finditer(r'<li[^>]*\bid=["\']line_u\d+_\d+["\'][^>]*>(.*?)</li>',
                          html_text, re.S | re.I):
        inner = li.group(1)
        m = re.search(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', inner, re.S | re.I)
        if not m:
            continue
        href = m.group(1).strip()
        anchor = html_mod.unescape(re.sub(r'<[^>]+>', '', m.group(2))).strip()
        if not href or any(b in href.lower() for b in LINK_BLOCKLIST):
            continue
        full = urljoin(base_url, href)
        host = urlparse(full).netloc.lower()
        base_host = urlparse(base_url).netloc.lower()
        if host and host != base_host and not host.endswith('jlau.edu.cn'):
            continue
        if anchor and len(anchor) >= 2:
            seen.setdefault(full, anchor)
    return list(seen.items())


# ---------- 文件输出 ----------
def sanitize_filename(title):
    """标题 → 安全文件名（去非法字符、压缩、截断）。"""
    t = re.sub(r'[\\/:*?"<>|\r\n\t]', '', title).strip()
    t = re.sub(r'\s+', ' ', t)
    t = t.strip(' .')
    return t[:60] or 'untitled'


def write_article(source, column, url, title, body, seq):
    """写一篇 md 文件，返回 (filepath, word_count) 或 None（正文过短/纯导航 stub）。"""
    body = body.strip()
    wc = len(body.replace('\n', '').replace(' ', ''))
    if wc < MIN_BODY_LEN:
        return None
    if _is_stub_body(body):
        return None
    src_dir = os.path.join(OUT_DIR, source)
    os.makedirs(src_dir, exist_ok=True)
    fname = f'{seq:02d}-{sanitize_filename(title)}.md'
    fpath = os.path.join(src_dir, fname)
    content = (f'---\n'
               f'标题: {title}\n'
               f'来源: {url}\n'
               f'栏目: {column}\n'
               f'抓取日期: {TODAY}\n'
               f'---\n\n'
               f'{body}\n')
    with open(fpath, 'w', encoding='utf-8') as f:
        f.write(content)
    return fpath, wc


def _title_dedupe_key(title):
    """标题去重键：去标点空白，用于跨栏目去重。"""
    return re.sub(r'[\s（）()《》「」·,，。、\-—]', '', title)


# ---------- 采集流程 ----------
def crawl_entry(fetcher, source, column, mode, url, seq_holder, catalog, log, written_urls, seen_titles):
    """处理一个入口；返回本次新增篇数。seq_holder: {'seq': int} 全局序号。"""
    ok, text, err = fetcher.fetch(url)
    if not ok:
        log.append(f'  ✘ [{source}/{column}] 入口失败: {err} ({url})')
        return 0

    if mode == 'direct':
        title, body = extract_article(text)
        key = _title_dedupe_key(title)
        if key in seen_titles:
            log.append(f'  - [{source}/{column}] 标题重复，跳过: {title[:30]}')
            return 0
        res = write_article(source, column, url, title, body, seq_holder['seq'])
        if res:
            fpath, wc = res
            seq_holder['seq'] += 1
            catalog.append((source, title, url, wc, column))
            written_urls.add(url)
            seen_titles.add(key)
            log.append(f'  ✔ [{source}/{column}] {title[:30]} ({wc}字)')
            return 1
        log.append(f'  - [{source}/{column}] 正文过短，丢弃: {title[:30]}')
        return 0

    if mode == 'category':
        cap = CATEGORY_CAP.get(source, 8)
        links = extract_category_links(text, url)
        if not links:
            # 无 line_u 列表项 → 页面本身当作文章（如规章制度全文页/十四五规划导语页）
            title, body = extract_article(text)
            key = _title_dedupe_key(title)
            if key in seen_titles:
                log.append(f'  - [{source}/{column}] 标题重复，跳过单页: {title[:30]}')
                return 0
            res = write_article(source, column, url, title, body, seq_holder['seq'])
            if res:
                fpath, wc = res
                seq_holder['seq'] += 1
                catalog.append((source, title, url, wc, column))
                written_urls.add(url)
                seen_titles.add(key)
                log.append(f'  ✔ [{source}/{column}] 单页正文 {title[:30]} ({wc}字)')
                return 1
            log.append(f'  - [{source}/{column}] 无列表项且正文过短: {title[:30]}')
            return 0
        count = 0
        for link_url, anchor in links[:cap]:
            if link_url in written_urls:
                continue
            if seq_holder['seq'] > GLOBAL_CAP:
                break
            ok2, text2, err2 = fetcher.fetch(link_url)
            if not ok2:
                log.append(f'  ✘ 详情失败: {err2} ({link_url[:70]})')
                continue
            title, body = extract_article(text2)
            key = _title_dedupe_key(title)
            if key in seen_titles:
                log.append(f'  - 标题重复，跳过: {title[:28]}')
                continue
            res = write_article(source, column, link_url, title, body, seq_holder['seq'])
            if res:
                fpath, wc = res
                seq_holder['seq'] += 1
                count += 1
                catalog.append((source, title, link_url, wc, column))
                written_urls.add(link_url)
                seen_titles.add(key)
                log.append(f'  ✔ [{source}/{column}] {title[:28]} ({wc}字)')
        return count


def probe_source(fetcher, source, label, column, url):
    """探测 SPA/模板壳/空壳来源，返回说明文本。"""
    ok, text, err = fetcher.fetch(url)
    if not ok:
        return f'[{label}] {url[:60]} 抓取失败: {err}'
    is_template = ('{{$' in text) or ('{{out(' in text)
    size_kb = len(text) // 1024
    if is_template:
        found = []
        for pat in [r'zyjs_gk_view\.html\?id=\d+', r'/info/\d+/\d+\.htm', r'api/[a-zA-Z0-9_/-]+']:
            found += re.findall(pat, text)[:5]
        if found:
            return f'[{label}] 模板壳 {size_kb}KB，发现模式线索: {sorted(set(found))[:6]}（建议浏览器渲染核实）'
        return f'[{label}] 模板壳 {size_kb}KB，无文章链接（待办：需浏览器渲染）'
    if size_kb <= 3:
        return f'[{label}] 空壳 {size_kb}KB，无实质内容（待办：需人工确认入口）'
    api_hits = set(re.findall(r'["\'](/portal/[a-zA-Z0-9_/.-]*(?:api|getList|listData|json)[a-zA-Z0-9_/.-]*)["\']', text))
    if api_hits:
        return f'[{label}] SPA {size_kb}KB，疑似接口: {sorted(api_hits)[:6]}（建议核实后直抓）'
    return f'[{label}] SPA {size_kb}KB，未见直接文章链接（待办：需浏览器渲染）'


# ---------- 主流程 ----------
def clean_output_dir():
    """启动时清理上次运行遗留的 .md 文件，保证幂等（只删本工具管理的文件）。"""
    for source in SOURCE_LABELS:
        src_dir = os.path.join(OUT_DIR, source)
        if not os.path.isdir(src_dir):
            continue
        for fname in os.listdir(src_dir):
            if fname.endswith('.md'):
                try:
                    os.remove(os.path.join(src_dir, fname))
                except OSError:
                    pass


def main():
    if sys.stdout.encoding and sys.stdout.encoding.lower().replace('-', '') not in ('utf8', 'utf8sig'):
        try:
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        except Exception:  # noqa: BLE001
            pass

    os.makedirs(OUT_DIR, exist_ok=True)
    clean_output_dir()
    fetcher = Fetcher()
    seq_holder = {'seq': 1}
    catalog = []   # (source, title, url, wc, column)
    log = []
    written_urls = set()
    seen_titles = set()
    per_source = {}

    print('== 开始采集 ==')
    for source, column, mode, url in ENTRIES:
        per_source.setdefault(source, 0)
        if per_source[source] >= SOURCE_CAP.get(source, 999):
            log.append(f'\n[{SOURCE_LABELS.get(source, source)}] 已达来源上限，跳过 {column}')
            continue
        before = seq_holder['seq']
        log.append(f'\n[{SOURCE_LABELS.get(source, source)}] {column} {url}')
        n = crawl_entry(fetcher, source, column, mode, url, seq_holder, catalog, log, written_urls, seen_titles)
        per_source[source] += n
        log.append(f'  → 新增 {n} 篇')
        if seq_holder['seq'] > GLOBAL_CAP:
            log.append('== 已达全局上限，停止主采集 ==')
            break

    print('== 探测待办来源 ==')
    probe_results = []
    for source, label, column, url in PROBE_ONLY:
        probe_results.append(probe_source(fetcher, source, label, column, url))

    # 写 CATALOG
    catalog_path = os.path.join(OUT_DIR, '00-CATALOG.md')
    total_wc = sum(w for _, _, _, w, _ in catalog)
    lines = ['# 吉小农官网语料采集清单', '', f'- 抓取日期: {TODAY}',
             f'- 总篇数: {len(catalog)}', f'- 总字数(去空白): {total_wc}',
             f'- 请求次数: {fetcher.stats["requests"]}（失败 {fetcher.stats["errors"]}）',
             '', '| 序号 | 来源 | 栏目 | 标题 | 字数 | URL |',
             '|---:|---|---|---:|---:|---|']
    for i, (source, title, url, wc, column) in enumerate(catalog, 1):
        lines.append(f'| {i} | {SOURCE_LABELS.get(source, source)} | {column} | {title} | {wc} | {url} |')
    with open(catalog_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # 汇总输出
    print()
    print('=' * 50)
    print('采集汇总：')
    for source, n in per_source.items():
        print(f'  {SOURCE_LABELS.get(source, source)}: {n} 篇')
    print(f'  合计: {len(catalog)} 篇 / {total_wc} 字')
    print()
    print('待办探测：')
    for p in probe_results:
        print('  ' + p)
    print()
    print('详细日志（节选）：')
    for line in log[:120]:
        print(line)
    print(f'\n产出目录: {OUT_DIR}')
    print(f'清单: {catalog_path}')


if __name__ == '__main__':
    main()
