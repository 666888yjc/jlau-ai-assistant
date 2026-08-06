// 周边美食 · 静态数据
// ------------------------------------------------------------------
// 数据源：本地知识库 docs/knowledge-base/14-周边美食餐厅.md 摘录（架构 §5.2）。
// 12 条店铺覆盖 6 个品类；「全部」筛选项由页面在渲染时拼在 FOOD_CATEGORIES 前，
// 不写进数据 —— 否则它会被当成一个真实品类参与匹配。
//
// askQuestion 模板：'{name}怎么走？营业到几点？'
// 它是「问吉小农」按钮的预填问句，把模块页的静态信息重新引流回对话，
// 而不是让页面变成一个死的信息孤岛。
// ------------------------------------------------------------------

export type FoodCategory = '快餐' | '火锅' | '面食' | '小吃' | '烧烤' | '东北菜';

export const FOOD_CATEGORIES: readonly FoodCategory[] = [
  '快餐',
  '火锅',
  '面食',
  '小吃',
  '烧烤',
  '东北菜',
];

export interface FoodItem {
  id: string;
  name: string;
  category: FoodCategory;
  /** '人均 ¥40' */
  price: string;
  /** '北门商业街' / '迅驰广场 · 约 1km' */
  distance: string;
  /** 一句话推荐 */
  tip: string;
  /** 「问吉小农」预填问句，非空 */
  askQuestion: string;
}

export const FOOD_ITEMS: readonly FoodItem[] = [
  {
    id: 'liji',
    name: '李季酱骨头锅烙王',
    category: '东北菜',
    price: '人均 ¥40',
    distance: '北门商业街',
    tip: '商业街老字号，酱脊骨 / 锅烙 / 大拉皮，午市常满座，建议错峰。',
    askQuestion: '李季酱骨头锅烙王怎么走？营业到几点？',
  },
  {
    id: 'lanzhou',
    name: '兰州正宗牛肉拉面',
    category: '面食',
    price: '人均 ¥12-18',
    distance: '北门商业街',
    tip: '一碗牛肉面解决一顿，学生党日常首选。',
    askQuestion: '兰州正宗牛肉拉面怎么走？营业到几点？',
  },
  {
    id: 'weixiangyuan',
    name: '味香源',
    category: '快餐',
    price: '人均 ¥15',
    distance: '北门',
    tip: '平价小吃快餐，出餐快，赶课时的稳妥选择。',
    askQuestion: '味香源怎么走？营业到几点？',
  },
  {
    id: 'xinfeiyue',
    name: '新飞越火锅鸡（农大总店）',
    category: '火锅',
    price: '人均 ¥43',
    distance: '农大北路农行对面 · 约 691m',
    tip: '10:00–22:00 营业，火锅鸡是净月大学城的代表菜。',
    askQuestion: '新飞越火锅鸡（农大总店）怎么走？营业到几点？',
  },
  {
    id: 'chaoyue',
    name: '农大超越火锅鸡',
    category: '火锅',
    price: '人均 ¥44',
    distance: '紫薇西街 · 约 696m',
    tip: '24 小时营业，赶论文和夜宵刚需都能顶上。',
    askQuestion: '农大超越火锅鸡怎么走？营业到几点？',
  },
  {
    id: 'mengshi',
    name: '孟氏金源烤肉面片馆',
    category: '烧烤',
    price: '人均 ¥62',
    distance: '约 932m',
    tip: '烤肉配面片，适合三五人小聚。',
    askQuestion: '孟氏金源烤肉面片馆怎么走？营业到几点？',
  },
  {
    id: 'xijiade',
    name: '喜家德虾仁水饺',
    category: '面食',
    price: '人均 ¥25',
    distance: '迅驰广场 · 约 1km',
    tip: '连锁水饺，干净稳定不踩雷。',
    askQuestion: '喜家德虾仁水饺怎么走？营业到几点？',
  },
  {
    id: 'laochang',
    name: '老昌春饼',
    category: '东北菜',
    price: '人均 ¥35',
    distance: '迅驰广场',
    tip: '东北春饼老牌子，人多点几样更划算。',
    askQuestion: '老昌春饼怎么走？营业到几点？',
  },
  {
    id: 'luosifen',
    name: '柳州螺蛳粉',
    category: '小吃',
    price: '人均 ¥14',
    distance: '迅驰广场',
    tip: '十几块吃饱，重口味救星。',
    askQuestion: '柳州螺蛳粉怎么走？营业到几点？',
  },
  {
    id: 'ahuo',
    name: '阿火快餐盖饭',
    category: '快餐',
    price: '人均 ¥20',
    distance: '迅驰广场',
    tip: '盖饭份量足，赶时间时的选择。',
    askQuestion: '阿火快餐盖饭怎么走？营业到几点？',
  },
  {
    id: 'xiongmao',
    name: '熊喵来了火锅',
    category: '火锅',
    price: '人均 ¥60',
    distance: '迅驰广场',
    tip: '生日聚餐常去，环境比校门口好。',
    askQuestion: '熊喵来了火锅怎么走？营业到几点？',
  },
  {
    id: 'louwailou',
    name: '楼外楼大刀肉火锅',
    category: '火锅',
    price: '人均 ¥83',
    distance: '博学路',
    tip: '人均偏高，适合请客或过节改善。',
    askQuestion: '楼外楼大刀肉火锅怎么走？营业到几点？',
  },
];

export const FOOD_DISCLAIMER = '数据来自本地知识库整理，实时营业状态与价格请以商家为准。';
