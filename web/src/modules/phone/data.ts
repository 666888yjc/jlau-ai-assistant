// 常用电话 · 静态内置数据（无 localStorage 键）
// ------------------------------------------------------------------
// 数据源分两类，每条都带 source 溯源标注（PRD-P2-01 AC②：source 非空）：
//   ① 本地知识库可溯源的校内号码（server/kb/01、06、11、18）；
//   ② 全国公共服务号码。
//
// ⚠️ 严禁臆造：教务处 / 学工处 / 后勤 / 保卫处 / 图书馆的号码 KB 里查不到，
//    本迭代不收录，改由页面底部「没找到？问吉小农」引流回对话（PRD §5 Q1）。
//    后续补录只需往 PHONE_ITEMS 追加条目，页面零改动。
//
// 「全部」不是真实分类，只在渲染时拼在 PHONE_CATEGORIES 前，不写进数据
// —— 沿用 FoodModulePage 的既有做法，否则它会被当成真实分类参与匹配。
// ------------------------------------------------------------------

export type PhoneCategory = '紧急求助' | '报到入学' | '医疗健康' | '升学深造' | '心理支持';

export const PHONE_CATEGORIES: readonly PhoneCategory[] = [
  '紧急求助',
  '报到入学',
  '医疗健康',
  '升学深造',
  '心理支持',
];

export interface PhoneItem {
  /** 稳定 id，一经发布不得改名 */
  id: string;
  /** 机构 / 用途名 */
  name: string;
  /** 仅数字与短横线，供 tel: 使用 */
  phone: string;
  category: PhoneCategory;
  /** 一句话用途，≤30 字 */
  purpose: string;
  /** 来源标注，非空 */
  source: string;
}

export const PHONE_ITEMS: readonly PhoneItem[] = [
  {
    id: 'zhaosheng',
    name: '招生就业工作处',
    phone: '0431-84532980',
    category: '报到入学',
    purpose: '报到时间地点咨询、不能按期报到请假',
    source: '知识库 11-联系方式求助',
  },
  {
    id: 'zhaosheng-shensu',
    name: '招生申诉',
    phone: '0431-84532752',
    category: '报到入学',
    purpose: '录取结果异议、考生申诉受理',
    source: '知识库 11-联系方式求助',
  },
  {
    id: 'xiaoyiyuan',
    name: '吉林农业大学医院',
    phone: '0431-84532820',
    category: '医疗健康',
    purpose: '校内门诊、常见病处理与转诊咨询',
    source: '知识库 18-医疗校医院周边医院',
  },
  {
    id: 'yanzhao-1',
    name: '研究生招生办公室',
    phone: '0431-84533048',
    category: '升学深造',
    purpose: '硕博招生政策、报考与复试咨询',
    source: '知识库 11-联系方式求助',
  },
  {
    id: 'yanzhao-2',
    name: '研究生招生办公室（备用线）',
    phone: '0431-84533049',
    category: '升学深造',
    purpose: '主线占线时的备用咨询号码',
    source: '知识库 11-联系方式求助',
  },
  {
    id: 'yangongbu-1',
    name: '党委研究生工作部教育管理科',
    phone: '0431-84533149',
    category: '升学深造',
    purpose: '研究生档案接收与转递咨询',
    source: '知识库 06-档案转接 / 11-联系方式求助',
  },
  {
    id: 'yangongbu-2',
    name: '党委研究生工作部教育管理科（备用线）',
    phone: '0431-84533305',
    category: '升学深造',
    purpose: '档案接收事宜的备用咨询号码',
    source: '知识库 06-档案转接 / 11-联系方式求助',
  },
  {
    id: 'police',
    name: '报警',
    phone: '110',
    category: '紧急求助',
    purpose: '人身安全受威胁、财物被盗抢时拨打',
    source: '全国公共号码',
  },
  {
    id: 'fire',
    name: '火警',
    phone: '119',
    category: '紧急求助',
    purpose: '火情、燃气泄漏等消防紧急情况',
    source: '全国公共号码',
  },
  {
    id: 'ambulance',
    name: '急救',
    phone: '120',
    category: '紧急求助',
    purpose: '突发疾病、外伤等需要急救时拨打',
    source: '全国公共号码',
  },
  {
    id: 'traffic',
    name: '交通事故报警',
    phone: '122',
    category: '紧急求助',
    purpose: '校内外道路交通事故报警处理',
    source: '全国公共号码',
  },
  {
    id: 'anti-fraud',
    name: '全国反诈专线',
    phone: '96110',
    category: '紧急求助',
    purpose: '疑似电信诈骗、刷单兼职骗局求证',
    source: '全国公共号码',
  },
  {
    id: 'psych-hotline',
    name: '全国心理援助热线',
    phone: '12356',
    category: '心理支持',
    purpose: '情绪困扰、压力过大时的免费倾诉',
    source: '全国公共号码',
  },
];

export const PHONE_DISCLAIMER =
  '号码来自本地知识库整理与全国公共服务号码，可能变更，以学校官方通知为准。本模块不保存任何数据到你的设备。';

/** 找不到号码时的引流问句，跳回 /chat 预填（不自动发送） */
export const PHONE_ASK_QUESTION = '我想找学校某个部门的电话，可以怎么查？';

/** 引流问句默认落在「校园生活」场景 */
export const PHONE_SCENARIO_ID = 'shenghuo';

/**
 * 关键词匹配：对机构名 / 号码 / 用途做大小写无关的子串匹配。
 * 号码额外去掉短横线再比一次，让用户输入 "0431 84532980" 之外的 "84532980" 也能命中。
 */
export function matchPhoneKeyword(item: PhoneItem, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase();
  if (kw.length === 0) return true;
  const plainPhone = item.phone.replace(/-/g, '');
  const plainKw = kw.replace(/[-\s]/g, '');
  return (
    item.name.toLowerCase().includes(kw) ||
    item.purpose.toLowerCase().includes(kw) ||
    item.phone.toLowerCase().includes(kw) ||
    (plainKw.length > 0 && plainPhone.includes(plainKw))
  );
}
