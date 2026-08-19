/**
 * 成本页（首页）
 * 路由: /pages/cost/index
 */

const AppStore = require('../../stores/app-store');
const ItemService = require('../../services/item');
const CostCalculator = require('../../services/calculator');

// 预置分类
const PRESET_CATEGORIES = [
  { id: 'digital', name: '数码产品', icon: '📱' },
  { id: 'member', name: '会员服务', icon: '💳' },
  { id: 'fitness', name: '运动健身', icon: '🏋️' },
  { id: 'transport', name: '交通出行', icon: '🚗' },
  { id: 'home', name: '家居生活', icon: '🏠' },
  { id: 'food', name: '食品饮料', icon: '🍜' },
  { id: 'fashion', name: '服装配饰', icon: '👔' },
  { id: 'book', name: '图书文具', icon: '📚' },
  { id: 'beauty', name: '美妆护肤', icon: '💄' },
  { id: 'health', name: '医疗健康', icon: '💊' },
  { id: 'other', name: '其他', icon: '📦' },
];

// 状态选项
const STATUS_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'using', label: '使用中' },
  { value: 'paused', label: '已废弃' },
  { value: 'retired', label: '已卖出' },
];

// 排序选项
const SORT_OPTIONS = [
  { value: 'custom', label: '自定义排序' },
  { value: 'dailyCost', label: '按成本（从高到低）' },
  { value: 'name', label: '按名称' },
  { value: 'purchaseDate', label: '按购买日期' },
];

Page({
  data: {
    // 汇总数据
    todayCost: 0,        // 今日成本（两位小数显示）
    avgPerUseCost: null, // 平均每次成本
    avgPerUseCount: 0,   // 按次物品数量

    // 物品列表
    items: [],

    // 筛选
    categories: PRESET_CATEGORIES,
    statusOptions: STATUS_OPTIONS,
    sortOptions: SORT_OPTIONS,
    selectedStatus: 'all',
    selectedCategory: 'all',

    // 视图模式
    displayMode: 'card', // 'card' | 'list'
    showSortPop: false,  // 排序弹层
    showFilterPop: false, // 筛选弹层

    // 搜索
    searchKeyword: '',
    isSearching: false,

    // 空状态
    isEmpty: false,

    // 自定义导航栏高度
    navBarHeight: 0,
    selectedCategoryName: '全部分类',
    sortOrder: 'custom',
  },

  // 页内变量
  _unsubscribe: null,

  onLoad() {
    // 获取系统信息，计算导航栏高度
    const sysInfo = wx.getSystemInfoSync();
    const navBarHeight = sysInfo.statusBarHeight + 44;
    this.setData({
      navBarHeight,
      sortOrder: AppStore.get('sortOrder'),
    });

    // 加载数据
    this._loadData();
  },

  onShow() {
    // 每次进入页面刷新数据
    this._refreshData();
  },

  onUnload() {
    // 取消订阅
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  },

  // ---------- 数据加载 ----------

  async _loadData() {
    // 加载物品
    await ItemService.loadItems();

    // 同步到 AppStore
    const items = ItemService.getItems();
    AppStore.set({ items });

    // 渲染
    this._renderItems();

    // 订阅 AppStore 变更
    this._unsubscribe = AppStore.subscribe((prev, next) => {
      if (prev.items !== next.items) {
        this._renderItems();
      }
    });
  },

  _refreshData() {
    const items = ItemService.getItems();
    AppStore.set({ items });
    this._renderItems();
  },

  _renderItems() {
    const state = AppStore.getState();
    const { selectedStatus, selectedCategory, displayMode, searchKeyword } = this.data;

    let items = ItemService.getItems();

    // 过滤：状态
    if (selectedStatus !== 'all') {
      items = items.filter(i => i.status === selectedStatus);
    }

    // 过滤：分类
    if (selectedCategory !== 'all') {
      items = items.filter(i => i.categoryId === selectedCategory);
    }

    // 搜索
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase();
      items = items.filter(i =>
        i.name.toLowerCase().includes(kw) ||
        (i.remark || '').toLowerCase().includes(kw)
      );
    }

    // 排序：使用中优先 > customOrder
    items.sort((a, b) => {
      if (a.status === 'using' && b.status !== 'using') return -1;
      if (a.status !== 'using' && b.status === 'using') return 1;
      return (b.customOrder || 0) - (a.customOrder || 0);
    });

    // 汇总
    const todayCost = CostCalculator.calcTotalDailyCost(ItemService.getItems());
    const avgResult = CostCalculator.calcAveragePerUseCost(ItemService.getItems());

    // 卡片数据处理
    const processedItems = items.map(item => this._processItem(item));

    this.setData({
      items: processedItems,
      todayCost: parseFloat(todayCost.toFixed(2)),
      avgPerUseCost: avgResult.avgCost !== null ? parseFloat(avgResult.avgCost.toFixed(2)) : null,
      avgPerUseCount: avgResult.count,
      isEmpty: items.length === 0,
      selectedCategoryName: this._getSelectedCategoryName(),
    });
  },

  _processItem(item) {
    // 计算每物品的展示数据
    let costDisplay = '--';
    let costUnit = '';
    let usedDisplay = '';

    if (item.status === 'using') {
      if (item.unit === 'day') {
        const days = CostCalculator.calcDaysUsed(item.purchaseDate);
        const cost = CostCalculator.calcDailyCost(item);
        costDisplay = parseFloat(cost.toFixed(2));
        costUnit = '元/天';
        usedDisplay = `已用${days}天`;
      } else if (item.unit === 'count') {
        const cost = CostCalculator.calcPerUseCost(item);
        if (cost !== null) {
          costDisplay = parseFloat(cost.toFixed(2));
        }
        costUnit = '元/次';
        usedDisplay = `已用${item.usedCount || 0}次`;
      }
    }

    // 分类名
    const category = PRESET_CATEGORIES.find(c => c.id === item.categoryId) || { name: item.categoryId || '其他', icon: '📦' };

    // 状态标签
    const statusMap = {
      using: '使用中',
      paused: '已废弃',
      retired: '已卖出',
    };

    return {
      id: item.id,
      name: item.name,
      icon: category.icon,
      categoryName: category.name,
      status: item.status,
      statusLabel: statusMap[item.status] || item.status,
      costDisplay,
      costUnit,
      usedDisplay,
      isUsing: item.status === 'using',
      isCount: item.unit === 'count',
    };
  },

  _getSelectedCategoryName() {
    if (this.data.selectedCategory === 'all') return '全部分类';
    const cat = PRESET_CATEGORIES.find(c => c.id === this.data.selectedCategory);
    return cat ? cat.name : '分类';
  },

  // ---------- 交互 ----------

  // 切换视图模式
  switchView(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ displayMode: mode });
    this._renderItems();
  },

  // 展开/收起排序弹层
  toggleSortPop() {
    this.setData({ showSortPop: !this.data.showSortPop });
  },

  // 关闭排序弹层
  closeSortPop() {
    this.setData({ showSortPop: false });
  },

  // 选择排序方式
  selectSort(e) {
    const value = e.currentTarget.dataset.value;
    AppStore.set({ sortOrder: value });
    this.setData({ sortOrder: value, showSortPop: false });
    this._renderItems();
  },

  // 展开/收起筛选弹层
  toggleFilterPop() {
    this.setData({ showFilterPop: !this.data.showFilterPop });
  },

  // 关闭筛选弹层
  closeFilterPop() {
    this.setData({ showFilterPop: false });
  },

  // 选择状态筛选
  selectStatus(e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ selectedStatus: status, showFilterPop: false });
    this._renderItems();
  },

  // 选择分类筛选
  selectCategory(e) {
    const category = e.currentTarget.dataset.category;
    this.setData({
      selectedCategory: category,
      selectedCategoryName: this._getSelectedCategoryName(),
      showFilterPop: false
    });
    this._renderItems();
  },

  // 点击物品卡片
  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/item-detail/index?id=${id}`,
    });
  },

  // 按次物品加一次使用
  onUseOnce(e) {
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    ItemService.useOnce(id).then(() => {
      this._refreshData();
    });
  },

  // 搜索相关
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value });
    this._renderItems();
  },

  onSearchFocus() {
    this.setData({ isSearching: true });
  },

  onSearchBlur() {
    this.setData({ isSearching: false });
  },

  onSearchClear() {
    this.setData({ searchKeyword: '', isSearching: false });
    this._renderItems();
  },

  onSearchCancel() {
    this.setData({ searchKeyword: '', isSearching: false });
    this._renderItems();
  },

  // 跳转添加页
  goAdd() {
    wx.switchTab({ url: '/pages/add-cost/index' });
  },

  // 空操作（用于阻止事件穿透）
  noop() {},
});
