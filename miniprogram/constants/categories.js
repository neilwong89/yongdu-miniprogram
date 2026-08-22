/**
 * 用度小程序 - 分类常量
 * 所有涉及预置分类的地方统一引用此文件
 */

// 预置分类（与服务器/数据库中的 id 对应）
// 顺序：all 放第一个，用于首页筛选胶囊
const PRESET_CATEGORIES = [
  { id: 'all', name: '全部' },
  { id: 'digital', name: '数码' },
  { id: 'member', name: '会员' },
  { id: 'transport', name: '交通' },
  { id: 'life', name: '生活' },
];

// 排除 all 后的纯预设分类（用于添加面板的分类选择器）
const PRESET_CATEGORIES_WITHOUT_ALL = PRESET_CATEGORIES.filter(c => c.id !== 'all');

module.exports = {
  PRESET_CATEGORIES,
  PRESET_CATEGORIES_WITHOUT_ALL,
};
