/**
 * 物品详情页
 * 路由参数: id=xxx
 */
const ItemService = require('../../services/item');
const AppStore = require('../../stores/app-store');
const { calcDaysUsed, formatDate } = require('../../utils/date');
const { formatMoney } = require('../../utils/format');

// 状态映射
const STATUS_MAP = {
  using: { label: '使用中', color: '#5a7a5a' },
  paused: { label: '已暂停', color: '#b08050' },
  retired: { label: '已报废', color: '#9e9a93' },
};

Page({
  data: {
    item: null,
    statusInfo: null,

    // 计算后的展示数据
    totalAmount: '0.00',     // 总花费（分->元）
    dailyCost: '0.00',       // 每日成本
    usedDays: 0,             // 已用天数
    usedCount: 0,            // 已用次数（按次）
    unitLabel: '',           // 计量单位标签
    costPerUnit: '0.00',     // 单次/日均成本

    // 格式化后的日期
    purchaseDateStr: '',
    soldDateStr: '',
  },

  onLoad(opt) {
    if (!opt.id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({ itemId: opt.id });
    this.loadItem(opt.id);
  },

  onShow() {
    // 每次显示时重新计算（可能 usedCount 已变）
    if (this.data.itemId) {
      this.loadItem(this.data.itemId);
    }
  },

  loadItem(id) {
    const item = ItemService.getItem(id);
    if (!item) {
      wx.showToast({ title: '物品不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    const statusInfo = STATUS_MAP[item.status] || STATUS_MAP.using;
    const totalFen = (item.price || 0) + (item.otherFees || 0);
    const totalAmount = formatMoney(totalFen);

    let dailyCost = '0.00';
    let costPerUnit = '0.00';
    let usedDays = 0;
    let unitLabel = '';

    if (item.unit === 'day') {
      usedDays = calcDaysUsed(item.purchaseDate);
      const costPerDay = usedDays > 0 ? totalFen / usedDays : 0;
      dailyCost = formatMoney(Math.round(costPerDay));
      costPerUnit = dailyCost;
      unitLabel = '天';
    } else {
      const count = item.usedCount || 0;
      const costPerCount = count > 0 ? totalFen / count : 0;
      costPerUnit = formatMoney(Math.round(costPerCount));
      unitLabel = '次';
    }

    const purchaseDateStr = item.purchaseDate || '';
    const soldDateStr = (item.soldDate || '') + (item.soldPrice ? ` · 卖出 ${formatMoney(item.soldPrice)} 元` : '');
    const itemPriceDisplay = item.price != null ? formatMoney(item.price) : '0.00';
    const otherFeesDisplay = item.otherFees != null ? formatMoney(item.otherFees) : '0.00';

    this.setData({
      item,
      statusInfo,
      totalAmount,
      dailyCost,
      usedDays,
      usedCount: item.usedCount || 0,
      unitLabel,
      costPerUnit,
      purchaseDateStr,
      soldDateStr,
      itemPriceDisplay,
      otherFeesDisplay,
    });
  },

  // ---------- 编辑 ----------
  onEdit() {
    wx.navigateTo({
      url: `/pages/add-cost/index?id=${this.data.item.id}`,
    });
  },

  // ---------- 删除 ----------
  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: `确定要删除「${this.data.item.name}」吗？删除后无法恢复。`,
      confirmColor: '#e64340',
      success: res => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中…' });
        ItemService.deleteItem(this.data.item.id).then(() => {
          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'success' });
          AppStore.set(() => ({ items: ItemService.getItems() }));
          setTimeout(() => wx.navigateBack(), 1200);
        }).catch(err => {
          wx.hideLoading();
          wx.showToast({ title: '删除失败', icon: 'none' });
          console.error('[item-detail] delete error', err);
        });
      },
    });
  },

  // ---------- +1（按次物品） ----------
  onUseOnce() {
    const { item } = this.data;
    if (!item || item.unit !== 'count') return;
    wx.showLoading({ title: '记录中…' });
    ItemService.useOnce(item.id).then(updated => {
      wx.hideLoading();
      wx.showToast({ title: `已记录 ${item.icon || '✓'}`, icon: 'success' });
      // 用 updated 刷新 UI
      this.setData({
        item: updated,
        usedCount: updated.usedCount,
      });
      AppStore.set(() => ({ items: ItemService.getItems() }));
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '记录失败', icon: 'none' });
      console.error('[item-detail] useOnce error', err);
    });
  },
});
