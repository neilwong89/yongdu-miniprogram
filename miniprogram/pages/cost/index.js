/**
 * 用度页（首页）
 * 路由: /pages/cost/index
 */

const AppStore = require('../../stores/app-store');
const ItemService = require('../../services/item');
const CostCalculator = require('../../services/calculator');
const { getLocalPath, downloadAndCache } = require('../../utils/photo-cache');
const { PRESET_CATEGORIES } = require('../../constants/categories');
const API_BASE = 'https://api.newmark.top';

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
  { value: 'dailyCost', label: '按用度（从高到低）' },
  { value: 'name', label: '按名称' },
  { value: 'purchaseDate', label: '按购买日期' },
];

Page({
  data: {
    // 字体加载状态
    fontLoading: true,

    // 汇总数据
    todayCost: '0.00',
    todayCostPerItem: '0.00',
    remainCost: '0',
    usingCount: 0,

    // 物品列表
    items: [],

    // 筛选/排序
    statusOptions: STATUS_OPTIONS,
    sortOptions: SORT_OPTIONS,
    selectedStatus: 'all',
    selectedCategory: 'all',

    // 视图模式
    displayMode: 'card',
    showSortPop: false,

    // 搜索
    searchKeyword: '',
    isSearching: false,

    // 空状态
    isEmpty: false,

    // 排序
    sortOrder: 'custom',

    // 自定义导航栏高度
    navBarHeight: 0,

    // 当前日期字符串
    todayStr: '',
  },

  _unsubscribe: null,

  async onLoad() {
    const app = getApp();
    const sysInfo = await wx.getWindowInfo();
    const navBarHeight = sysInfo.statusBarHeight + 44;
    const now = new Date();
    const todayStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
    this.setData({
      navBarHeight,
      todayStr,
      sortOrder: AppStore.get('sortOrder') || 'custom',
    });

    // 等字体加载完成后再渲染数据
    app.onFontReady((fontReady) => {
      console.log('[cost] 字体状态:', fontReady ? '✅ 就绪' : '❌ 失败，用系统字体');
      this.setData({ fontLoading: false });
      this._loadData();
    });
  },

  onShow() {
    this._refreshData();
  },

  onUnload() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  },

  // ---------- 数据加载 ----------

  async _loadData() {
    // 等 app 数据层初始化完成（首次全量同步 or 本地加载）
    // 防止 initStore 还在跑时，loadItems() 把空数组写进 AppStore，覆盖了刚同步下来的数据
    const app = getApp();
    if (!app.globalData.dataReady) {
      await new Promise(resolve => {
        const check = () => {
          if (app.globalData.dataReady) resolve();
          else setTimeout(check, 100);
        };
        check();
      });
    }

    await ItemService.loadItems();
    const items = ItemService.getItems();
    AppStore.set({ items });
    this._renderItems();
    this._unsubscribe = AppStore.subscribe(() => {
      // 只刷新视图，不重复调用 set()，避免死循环
      this._renderItems();
    });
  },

  _refreshData() {
    const items = ItemService.getItems();
    const allItems = ItemService.getItems();
    // 同步合并预设+自定义+物品用到的已删除自定义分类到视图
    const state = AppStore.getState();
    const customCats = (state.categories || []).filter(c => !PRESET_CATEGORIES.find(p => p.id === c.id));
    const usedCustomCatIds = [...new Set(allItems.map(i => i.categoryId).filter(id => id && id.startsWith('custom_')))];
    const usedCustomCats = usedCustomCatIds
      .filter(id => !customCats.find(c => c.id === id))
      .map(id => {
        const item = allItems.find(i => i.categoryId === id);
        return { id, name: item ? item.categoryName : id };
      });
    const categories = [...PRESET_CATEGORIES, ...customCats, ...usedCustomCats];
    AppStore.set({ items });
    this.setData({ categories });
    this._renderItems();
  },

  _renderItems() {
    const state = AppStore.getState();
    const { selectedCategory, searchKeyword } = this.data;

    let items = ItemService.getItems();

    // 过滤：分类
    if (selectedCategory !== 'all') {
      items = items.filter(i => i.categoryId === selectedCategory);
    }

    // 过滤：搜索
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase();
      items = items.filter(i =>
        i.name.toLowerCase().includes(kw) ||
        (i.remark || '').toLowerCase().includes(kw) ||
        (i.purchaseDate || '').includes(kw)
      );
    }

    // 排序：使用中优先 > customOrder
    items.sort((a, b) => {
      if (a.status === 'using' && b.status !== 'using') return -1;
      if (a.status !== 'using' && b.status === 'using') return 1;
      return (b.customOrder || 0) - (a.customOrder || 0);
    });

    // 汇总
    const allItems = ItemService.getItems();
    const usingItems = allItems.filter(i => i.status === 'using');

    // 今日按天总用度
    const totalDaily = CostCalculator.calcTotalDailyCost(allItems);
    // 按天物品的今日用度
    const todayCost = parseFloat(totalDaily.toFixed(2));
    // 按天物品数
    const todayItems = usingItems.filter(i => i.unit === 'day');
    const todayCostPerItem = todayItems.length > 0
      ? parseFloat((totalDaily / todayItems.length).toFixed(2))
      : 0;

    // 按次物品剩余用度总和
    const countItems = usingItems.filter(i => i.unit === 'count');
    let remainCost = 0;
    countItems.forEach(item => {
      const remain = CostCalculator.calcRemainingCost(item);
      if (remain !== null) remainCost += remain;
    });

    const processedItems = items.map(item => this._processItem(item));

    // 合并分类：预设 + AppStore自定义 + 物品用到的已删除自定义分类
    const customCats = (state.categories || []).filter(c => !PRESET_CATEGORIES.find(p => p.id === c.id));
    const usedCustomCatIds = [...new Set(allItems.map(i => i.categoryId).filter(id => id && id.startsWith('custom_')))];
    const usedCustomCats = usedCustomCatIds
      .filter(id => !customCats.find(c => c.id === id))
      .map(id => {
        const item = allItems.find(i => i.categoryId === id);
        return { id, name: item ? item.categoryName : id };
      });
    const categories = [...PRESET_CATEGORIES, ...customCats, ...usedCustomCats];

    this.setData({
      items: processedItems,
      todayCost: todayCost.toFixed(2),
      todayCostPerItem: todayCostPerItem.toFixed(2),
      remainCost: Math.round(remainCost).toLocaleString('zh-CN'),
      usingCount: usingItems.length,
      isEmpty: items.length === 0,
      categories,
    });
  },

  _processItem(item) {
    const state = AppStore.getState();
    const category = state.categories.find(c => c.id === item.categoryId)
      || { name: item.categoryName || '其他', icon: item.icon || '📦' };

    const statusMap = {
      using: '使用中',
      paused: '已废弃',
      retired: '已卖出',
    };
    const statusClassMap = {
      using: 'status-using',
      paused: 'status-paused',
      retired: 'status-retired',
    };

    let costDisplay = '--';
    let usedDays = 0;
    let usedCount = item.usedCount || 0;

    if (item.status === 'using') {
      if (item.unit === 'day') {
        const cost = CostCalculator.calcDailyCost(item);
        costDisplay = parseFloat(cost.toFixed(2));
        usedDays = CostCalculator.calcDaysUsed(item.purchaseDate);
      } else if (item.unit === 'count') {
        const cost = CostCalculator.calcPerUseCost(item);
        costDisplay = cost !== null ? parseFloat(cost.toFixed(2)) : '--';
      }
    }

    // 格式化日期
    const purchaseDateStr = item.purchaseDate
      ? item.purchaseDate.replace(/-/g, '.')
      : '';

    // 购买价格（分→元）
    const priceDisplay = item.price != null
      ? (item.price / 100).toLocaleString('zh-CN', { minimumFractionDigits: 0 })
      : '0';

    // 图片：优先读本地缩略图，没有则后台下载
    const photoId = item.photoId;
    const photoLocalPath = photoId ? getLocalPath(photoId) : null;
    const hasImage = !!photoLocalPath;
    // 缩略图 URL（用于后台异步下载）
    const thumbUrl = photoId ? `${API_BASE}/uploads/photos/${photoId}_thumb.jpg` : null;

    // 没有本地缓存时，后台触发缩略图下载
    if (photoId && !photoLocalPath) {
      this._fetchThumb(photoId, thumbUrl);
    }

    return {
      id: item.id,
      name: item.name,
      icon: item.icon || '📦',
      categoryName: category.name || '其他',
      hasImage,
      imageUrl: photoLocalPath || '',
      thumbUrl,
      status: item.status,
      statusLabel: statusMap[item.status] || item.status,
      statusClass: statusClassMap[item.status] || '',
      costDisplay: typeof costDisplay === 'number' ? costDisplay.toFixed(2) : costDisplay,
      isCount: item.unit === 'count',
      isUsing: item.status === 'using',
      usedDays,
      usedCount,
      priceDisplay,
      purchaseDateStr,
    };
  },

  // 后台异步下载缩略图，完成后更新列表对应 item
  _fetchThumb(photoId, thumbUrl) {
    downloadAndCache(photoId, thumbUrl).then(localPath => {
      const items = this.data.items;
      // 用 photoId 匹配（items 里存的是 item.photoId）
      const idx = items.findIndex(i => i.photoId === photoId);
      if (idx !== -1) {
        const updated = [...items];
        updated[idx] = { ...updated[idx], hasImage: true, imageUrl: localPath };
        this.setData({ items: updated });
      }
    }).catch(err => {
      console.warn('[cost] thumb download failed for', photoId, err);
    });
  },

  // ---------- 交互 ----------

  switchView(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ displayMode: mode });
  },

  // 排序弹层
  toggleSortPop() {
    this.setData({ showSortPop: !this.data.showSortPop });
  },

  closeSortPop() {
    this.setData({ showSortPop: false });
  },

  selectSort(e) {
    const value = e.currentTarget.dataset.value;
    AppStore.set({ sortOrder: value });
    this.setData({ sortOrder: value, showSortPop: false });
    this._renderItems();
  },

  selectStatus(e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ selectedStatus: status, showSortPop: false });
    this._renderItems();
  },

  // 分类胶囊选择（直接切换，不弹层）
  selectCategory(e) {
    const category = e.currentTarget.dataset.category;
    this.setData({ selectedCategory: category });
    this._renderItems();
  },

  // 点击物品卡片
  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/item-detail/index?id=${id}` });
  },

  // 按次物品 +1
  onUseOnce(e) {
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    ItemService.useOnce(id).then(() => {
      this._refreshData();
    });
  },

  // 搜索
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

  goAdd() {
    this.selectComponent('#addCostPanel').show();
  },

  onAddCostSave() {
    this._refreshData();
  },

  noop() {},
});
