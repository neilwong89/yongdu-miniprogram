/**
 * 洞察页 - 数据分析与可视化
 * 路由: /pages/insight/index
 */
const AppStore = require('../../stores/app-store');
const ItemService = require('../../services/item');
const CostCalculator = require('../../services/calculator');
const { calcDaysUsed } = require('../../utils/date');

// 预置分类（按设计稿，与 cost 页一致）
const PRESET_CATEGORIES = [
  { id: 'all', name: '全部' },
  { id: 'digital', name: '数码' },
  { id: 'member', name: '会员' },
  { id: 'transport', name: '交通' },
  { id: 'life', name: '生活' },
];

// 状态映射
const STATUS_MAP = {
  using: '使用中',
  paused: '已废弃',
  retired: '已卖出',
};

Page({
  data: {
    navBarHeight: 0,

    // ---------- 顶部汇总 ----------
    itemCount: 0,
    todayCost: '0.00',

    // ---------- 分类筛选 ----------
    categories: PRESET_CATEGORIES,
    selectedCategory: 'all',

    // ---------- 用度曲线 ----------
    chartRange: '90',
    curvePath: '',
    curveFillPath: '',
    chartStartLabel: '',
    chartEndLabel: '',

    // ---------- 分类账本 ----------
    categoryStats: [],

    // ---------- 用度之最 ----------
    topMostExpensive: null,
    topLongest: null,
    topHighestDaily: null,
    topMostUsed: null,

    // ---------- 状态 ----------
    isEmpty: true,
  },

  _unsubscribe: null,

  async onLoad() {
    const sysInfo = await wx.getWindowInfo();
    this.setData({ navBarHeight: sysInfo.statusBarHeight + 44 });
  },

  onShow() {
    if (this._unsubscribe) this._unsubscribe();
    this._unsubscribe = AppStore.subscribe(() => this._calcStats());
    this._calcStats();
  },

  onUnload() {
    if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
  },

  // ---------- 计算所有指标 ----------
  _calcStats() {
    const state = AppStore.getState();
    let items = ItemService.getItems();
    const { selectedCategory } = this.data;

    // 分类筛选
    if (selectedCategory !== 'all') {
      items = items.filter(i => i.categoryId === selectedCategory);
    }

    const usingItems = items.filter(i => i.status === 'using');

    // 今日总用度（使用中的按天物品）
    const totalDailyCostFen = CostCalculator.calcTotalDailyCost(items);
    const todayCost = (totalDailyCostFen / 100).toFixed(2);

    // --- 分类账本 ---
    const catGroups = {};
    usingItems.forEach(item => {
      const cid = item.categoryId || 'other';
      if (!catGroups[cid]) {
        const catInfo = state.categories.find(c => c.id === cid);
        catGroups[cid] = {
          name: catInfo ? catInfo.name : (item.categoryName || '其他'),
          count: 0,
          totalAmount: 0,
          dailyCost: 0,
          isCount: false,
        };
      }
      const g = catGroups[cid];
      g.count++;
      g.totalAmount += (item.price || 0) + (item.otherFees || 0);
      if (item.unit === 'day') {
        g.dailyCost += CostCalculator.calcDailyCost(item) || 0;
      } else {
        g.isCount = true;
      }
    });

    const categoryStats = Object.values(catGroups)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .map(g => ({
        name: g.name,
        count: g.count,
        totalAmount: g.totalAmount > 0 ? (g.totalAmount / 100).toLocaleString('zh-CN', { minimumFractionDigits: 0 }) : '0',
        costPerDay: g.isCount ? '' : (g.dailyCost > 0 ? (g.dailyCost / 100).toFixed(2) : '0.00'),
        isCount: g.isCount,
      }));

    // --- 用度之最 ---
    const retiredUsing = items.filter(i => i.status === 'using' || i.status === 'retired');

    // 最贵：price + otherFees 最高
    let topMostExpensive = null;
    if (retiredUsing.length > 0) {
      const sortedByPrice = [...retiredUsing].sort((a, b) => {
        const pa = (a.price || 0) + (a.otherFees || 0);
        const pb = (b.price || 0) + (b.otherFees || 0);
        return pb - pa;
      });
      if (sortedByPrice[0]) {
        const priceFen = (sortedByPrice[0].price || 0) + (sortedByPrice[0].otherFees || 0);
        topMostExpensive = {
          name: sortedByPrice[0].name,
          priceDisplay: (priceFen / 100).toLocaleString('zh-CN', { minimumFractionDigits: 0 }),
        };
      }
    }

    // 陪伴最久：已用天数最多
    let topLongest = null;
    if (usingItems.length > 0) {
      const sortedByDays = [...usingItems].sort((a, b) => {
        const da = a.unit === 'day' ? calcDaysUsed(a.purchaseDate) : (a.usedCount || 0);
        const db = b.unit === 'day' ? calcDaysUsed(b.purchaseDate) : (b.usedCount || 0);
        return db - da;
      });
      if (sortedByDays[0]) {
        const days = sortedByDays[0].unit === 'day'
          ? calcDaysUsed(sortedByDays[0].purchaseDate)
          : (sortedByDays[0].usedCount || 0);
        topLongest = { name: sortedByDays[0].name, days };
      }
    }

    // 每日用度最高
    let topHighestDaily = null;
    const dayItems = usingItems.filter(i => i.unit === 'day');
    if (dayItems.length > 0) {
      const sortedByDaily = [...dayItems].sort((a, b) => {
        const da = CostCalculator.calcDailyCost(a) || 0;
        const db = CostCalculator.calcDailyCost(b) || 0;
        return db - da;
      });
      if (sortedByDaily[0]) {
        const cost = CostCalculator.calcDailyCost(sortedByDaily[0]) || 0;
        topHighestDaily = {
          name: sortedByDaily[0].name,
          costPerDay: (cost / 100).toFixed(2),
        };
      }
    }

    // 使用最多（按次物品）
    let topMostUsed = null;
    const countItems = usingItems.filter(i => i.unit === 'count');
    if (countItems.length > 0) {
      const sortedByCount = [...countItems].sort((a, b) => (b.usedCount || 0) - (a.usedCount || 0));
      if (sortedByCount[0]) {
        topMostUsed = {
          name: sortedByCount[0].name,
          usedCount: sortedByCount[0].usedCount || 0,
        };
      }
    }

    // --- 用度曲线 SVG ---
    const { curvePath, curveFillPath, startLabel, endLabel } = this._calcCurvePath(items);

    this.setData({
      isEmpty: items.length === 0,
      itemCount: items.length,
      todayCost,
      categoryStats,
      topMostExpensive,
      topLongest,
      topHighestDaily,
      topMostUsed,
      curvePath,
      curveFillPath,
      chartStartLabel: startLabel,
      chartEndLabel: endLabel,
    });
  },

  // ---------- 计算 SVG 用度曲线 ----------
  _calcCurvePath(items) {
    const { chartRange } = this.data;
    const usingItems = items.filter(i => i.status === 'using' && i.unit === 'day');
    if (usingItems.length === 0) {
      return { curvePath: '', curveFillPath: '', startLabel: '', endLabel: '' };
    }

    const now = new Date();
    const endDate = now;
    let startDate;
    if (chartRange === '90') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 90);
    } else {
      // 全部：取最早的购买日期
      const dates = usingItems.map(i => new Date(i.purchaseDate)).filter(d => !isNaN(d));
      if (dates.length === 0) {
        return { curvePath: '', curveFillPath: '', startLabel: '', endLabel: '' };
      }
      startDate = dates.reduce((a, b) => a < b ? a : b);
    }

    // 每天的累计用度（倒序：从 start 到 end）
    const days = [];
    const cur = new Date(startDate);
    while (cur <= endDate) {
      let dayCost = 0;
      usingItems.forEach(item => {
        const itemStart = new Date(item.purchaseDate);
        if (cur >= itemStart) {
          const daysUsed = Math.floor((cur - itemStart) / 86400000) + 1;
          const totalFen = (item.price || 0) + (item.otherFees || 0);
          dayCost += totalFen / daysUsed;
        }
      });
      days.push({ date: new Date(cur), cost: dayCost });
      cur.setDate(cur.getDate() + 1);
    }

    if (days.length === 0) {
      return { curvePath: '', curveFillPath: '', startLabel: '', endLabel: '' };
    }

    // 采样（最多 90 个点）
    const maxPoints = 90;
    const step = Math.max(1, Math.floor(days.length / maxPoints));
    const sampled = days.filter((_, i) => i % step === 0);

    const costs = sampled.map(d => d.cost);
    const maxCost = Math.max(...costs, 1);
    const W = 330, H = 132, padBottom = 6, padTop = 6;
    const chartH = H - padBottom - padTop;

    const points = sampled.map((d, i) => {
      const x = (i / (sampled.length - 1)) * W;
      const y = chartH - (d.cost / maxCost) * chartH + padTop;
      return [x, y];
    });

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const fillD = pathD + ` L${W},${H - padBottom} L0,${H - padBottom} Z`;

    const fmtDate = d => `${d.getMonth() + 1}/${d.getDate()}`;
    const startLabel = fmtDate(sampled[0].date);
    const endLabel = fmtDate(sampled[sampled.length - 1].date);

    return { curvePath: pathD, curveFillPath: fillD, startLabel, endLabel };
  },

  // ---------- 交互 ----------
  selectCategory(e) {
    this.setData({ selectedCategory: e.currentTarget.dataset.category });
    this._calcStats();
  },

  setChartRange(e) {
    this.setData({ chartRange: e.currentTarget.dataset.range });
    this._calcStats();
  },

  goItemDetail(e) {
    const { id } = e.currentTarget.dataset;
    if (id) {
      wx.navigateTo({ url: `/pages/item-detail/index?id=${id}` });
    }
  },

  goAdd() {
    this.selectComponent('#addCostPanel').show();
  },

  onAddCostSave() {
    this._loadData();
  },
});
