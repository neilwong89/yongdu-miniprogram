/**
 * 洞察页 - 数据分析与可视化
 * 使用 AppStore.subscribe() 监听 items 变化，使用 CostCalculator 计算指标
 */
const AppStore = require('../../stores/app-store');
const CostCalculator = require('../../services/calculator');
const { formatMoney, formatPercent } = require('../../utils/format');
const { calcDaysUsed } = require('../../utils/date');

Page({
  data: {
    navBarHeight: 0,

    // ---------- 顶部统计卡 ----------
    totalItems: 0,
    usingItems: 0,
    totalInvestment: '0.00',    // 总投入（元）
    todayCost: '0.00',          // 今日总成本（元）
    avgPerUse: '0.00',          // 平均单次成本（元）

    // ---------- 成本分布（按分类） ----------
    categoryStats: [],          // [{id, name, icon, itemCount, totalInvest, dailyCost, percent}]

    // ---------- 成本排行 ----------
    costRanking: [],            // [{rank, id, name, icon, cost, costStr, unit}]

    // ---------- 低效率物品提示 ----------
    lowEfficiencyItems: [],     // [{id, name, icon, days, unit, reason}]

    // ---------- 状态 ----------
    isEmpty: true,
  },

  _unsubscribe: null,

  onLoad() {
    const sysInfo = wx.getSystemInfoSync();
    this.setData({ navBarHeight: sysInfo.statusBarHeight + 44 });
  },

  onShow() {
    // 订阅 AppStore，每次 items 变化都重新计算
    if (this._unsubscribe) {
      this._unsubscribe(); // 避免重复订阅
    }
    this._unsubscribe = AppStore.subscribe(() => {
      this._calcStats();
    });
    // 首次也计算一次
    this._calcStats();
  },

  onHide() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  },

  onUnload() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  },

  // ---------- 计算所有指标 ----------
  _calcStats() {
    const { items, categories } = AppStore.getState();
    if (!items || !items.length) {
      this.setData({ isEmpty: true });
      return;
    }

    // === 1. 顶部统计 ===
    const totalItems = items.length;
    const usingItems = items.filter(i => i.status === 'using').length;

    // 总投入 = Σ(price + otherFees)，仅"使用中"+"已报废"
    const investItems = items.filter(i => i.status === 'using' || i.status === 'retired');
    const totalInvestmentFen = investItems.reduce((s, i) => s + (i.price || 0) + (i.otherFees || 0), 0);
    const totalInvestment = formatMoney(totalInvestmentFen);

    // 今日总成本 = Σ(使用中且unit=day物品的每日成本)
    const todayCostFen = CostCalculator.calcTotalDailyCost(items);
    const todayCost = formatMoney(Math.round(todayCostFen));

    // 平均单次成本
    const { avgCost } = CostCalculator.calcAveragePerUseCost(items);
    const avgPerUse = avgCost !== null ? formatMoney(Math.round(avgCost * 100)) : '0.00';

    // === 2. 成本分布（按分类） ===
    const catMap = {};
    // 构建分类名->icon 映射（categories 里有）
    if (categories && categories.length) {
      categories.forEach(c => { catMap[c.id] = c; });
    }
    // 默认分类（兜底）
    const defaultCats = [
      { id: 'electronics', name: '电子产品', icon: '📱' },
      { id: 'daily', name: '日用品', icon: '🧴' },
      { id: 'food', name: '食品', icon: '🍎' },
      { id: 'clothing', name: '服饰', icon: '👕' },
      { id: 'entertainment', name: '娱乐', icon: '🎮' },
      { id: 'study', name: '学习', icon: '📚' },
      { id: 'health', name: '健康', icon: '💊' },
      { id: 'other', name: '其他', icon: '📦' },
    ];
    defaultCats.forEach(c => { if (!catMap[c.id]) catMap[c.id] = c; });

    // 按分类聚合
    const catStats = {};
    items.forEach(item => {
      const cid = item.categoryId || 'other';
      if (!catStats[cid]) {
        const catInfo = catMap[cid] || { name: '其他', icon: '📦' };
        catStats[cid] = {
          id: cid,
          name: catInfo.name,
          icon: catInfo.icon || '📦',
          itemCount: 0,
          totalInvest: 0,
          dailyCost: 0,
        };
      }
      const cs = catStats[cid];
      cs.itemCount++;
      cs.totalInvest += (item.price || 0) + (item.otherFees || 0);
      cs.dailyCost += CostCalculator.calcDailyCost(item) || 0;
    });

    // 排序：按每日成本降序，取前5
    const sortedCats = Object.values(catStats)
      .sort((a, b) => b.dailyCost - a.dailyCost)
      .slice(0, 5);

    // 计算百分比
    const totalDailyCost = sortedCats.reduce((s, c) => s + c.dailyCost, 0) || 1;
    sortedCats.forEach(c => {
      c.totalInvestStr = formatMoney(c.totalInvest);
      c.dailyCostStr = formatMoney(Math.round(c.dailyCost));
      c.percent = c.dailyCost / totalDailyCost;
      c.barWidth = Math.max(4, Math.round(c.percent * 100));
    });
    const categoryStats = sortedCats;

    // === 3. 成本排行（前5高） ===
    const usingDayItems = items.filter(i => i.status === 'using' && i.unit === 'day');
    const usingCountItems = items.filter(i => i.status === 'using' && i.unit === 'count');

    const dayRankItems = usingDayItems
      .map(i => ({
        id: i.id,
        name: i.name,
        icon: i.icon || '📦',
        cost: CostCalculator.calcDailyCost(i) || 0,
        unit: '元/天',
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);

    const countRankItems = usingCountItems
      .map(i => ({
        id: i.id,
        name: i.name,
        icon: i.icon || '📦',
        cost: CostCalculator.calcPerUseCost(i) || 0,
        unit: '元/次',
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);

    // 合并两个排行，取前5（按成本降序）
    const allRank = [...dayRankItems, ...countRankItems]
      .filter(i => i.cost > 0)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);

    const costRanking = allRank.map((item, idx) => ({
      rank: idx + 1,
      id: item.id,
      name: item.name,
      icon: item.icon,
      costStr: formatMoney(Math.round(item.cost)),
      unit: item.unit,
      // 排名颜色
      rankColor: idx === 0 ? '#ff6b6b' : idx === 1 ? '#ffa502' : idx === 2 ? '#ffd32a' : '#999',
    }));

    // === 4. 低效率物品提示 ===
    const lowEfficiency = [];

    // A. 按次物品，买了很久（>30天）但使用次数=0
    const oldUnusedCount = items.filter(i => {
      if (i.status !== 'using' || i.unit !== 'count') return false;
      if ((i.usedCount || 0) > 0) return false;
      const days = calcDaysUsed(i.purchaseDate);
      return days > 30;
    });

    oldUnusedCount.forEach(i => {
      const days = calcDaysUsed(i.purchaseDate);
      lowEfficiency.push({
        id: i.id,
        name: i.name,
        icon: i.icon || '📦',
        days,
        unit: '次',
        reason: `购买${days}天还未使用过`,
        reasonType: 'unused',
      });
    });

    // B. 按天物品，已废弃（买了很久但用很少，或已暂停很久）
    const wasteDayItems = items.filter(i => {
      if (i.status !== 'retired' || i.unit !== 'day') return false;
      const days = calcDaysUsed(i.purchaseDate);
      return days > 60;
    });

    wasteDayItems.forEach(i => {
      const days = calcDaysUsed(i.purchaseDate);
      lowEfficiency.push({
        id: i.id,
        name: i.name,
        icon: i.icon || '📦',
        days,
        unit: '天',
        reason: `已报废，使用了${days}天`,
        reasonType: 'waste',
      });
    });

    // 限制最多显示5个
    const lowEfficiencyItems = lowEfficiency.slice(0, 5);

    // === 更新 data ===
    this.setData({
      isEmpty: false,
      totalItems,
      usingItems,
      totalInvestment,
      todayCost,
      avgPerUse,
      categoryStats,
      costRanking,
      lowEfficiencyItems,
    });
  },

  // ---------- 跳转到物品详情 ----------
  goItemDetail(e) {
    const { id } = e.currentTarget.dataset;
    if (id) {
      wx.navigateTo({ url: `/pages/item-detail/index?id=${id}` });
    }
  },

  // ---------- 空状态：去添加 ----------
  goAdd() {
    wx.switchTab({ url: '/pages/add-cost/index' });
  },
});
