/**
 * 物品详情页
 * 路由参数: id=xxx
 */
const ItemService = require('../../services/item');
const AppStore = require('../../stores/app-store');
const { calcDaysUsed } = require('../../utils/date');
const { formatMoney } = require('../../utils/format');
const { getMainImageLocalPath, downloadAndCacheMain } = require('../../utils/photo-cache');

const API_BASE = 'https://api.newmark.top';

Page({
  data: {
    item: null,
    itemId: '',
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
    if (this.data.itemId) {
      this.loadItem(this.data.itemId);
    }
  },

  loadItem(id) {
    const item = ItemService.getItem(id);
    if (!item) {
      wx.showToast({ title: '拥有不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    const statusMap = {
      using: { label: '使用中', class: 'status-using' },
      paused: { label: '已暂停', class: 'status-paused' },
      retired: { label: '已卖出', class: 'status-retired' },
    };
    const statusInfo = statusMap[item.status] || statusMap.using;

    const totalFen = (item.price || 0) + (item.otherFees || 0);
    let usedDays = 0;
    let costPerUnit = '0.00';
    let unitLabel = item.unit === 'day' ? '天' : '次';

    if (item.unit === 'day') {
      usedDays = calcDaysUsed(item.purchaseDate);
      costPerUnit = usedDays > 0
        ? (totalFen / usedDays / 100).toFixed(2)
        : '0.00';
    } else {
      const count = item.usedCount || 0;
      costPerUnit = count > 0
        ? (totalFen / count / 100).toFixed(2)
        : '0.00';
    }

    // 进度百分比（已用天数/预期天数）
    let progressPercent = 0;
    if (item.unit === 'day' && item.expectedDays && item.expectedDays > 0) {
      progressPercent = Math.min(100, Math.round((usedDays / item.expectedDays) * 100));
    } else if (item.unit === 'count' && item.expectedDays && item.expectedDays > 0) {
      const count = item.usedCount || 0;
      progressPercent = Math.min(100, Math.round((count / item.expectedDays) * 100));
    }

    // 格式化日期：YYYY-MM-DD → YYYY.MM.DD
    const purchaseDateStr = item.purchaseDate
      ? item.purchaseDate.replace(/-/g, '.')
      : '';
    const soldDateStr = item.soldDate
      ? `${item.soldDate.replace(/-/g, '.')}${item.soldPrice ? ' · 卖出 ¥' + formatMoney(item.soldPrice) : ''}`
      : '';

    const itemPriceDisplay = item.price != null
      ? (item.price / 100).toLocaleString('zh-CN', { minimumFractionDigits: 0 })
      : '0';
    const otherFeesDisplay = item.otherFees != null
      ? (item.otherFees / 100).toLocaleString('zh-CN', { minimumFractionDigits: 0 })
      : '0';

    // 融合到 item 对象里
    item.statusLabel = statusInfo.label;
    item.statusClass = statusInfo.class;
    item.purchaseDateStr = purchaseDateStr;
    item.soldDateStr = soldDateStr;
    item.priceDisplay = itemPriceDisplay;
    item.otherFeesDisplay = otherFeesDisplay;
    item.usedDays = usedDays;
    item.usedCount = item.usedCount || 0;
    item.expectedDays = item.expectedDays || 0;
    item.progressPercent = progressPercent;

    // 图片：优先本地大图，本地没有则后台异步下载大图，进度中显示 emoji 占位
    if (item.photoId) {
      const mainLocalPath = getMainImageLocalPath(item.photoId);
      if (mainLocalPath) {
        item.imageUrl = mainLocalPath;
        item.hasImage = true;
      } else {
        // 本地没有任何图片，显示 emoji 占位，后台下载大图
        item.imageUrl = '';
        item.hasImage = false;
        this._fetchMainImage(item.photoId);
      }
    } else {
      item.imageUrl = '';
      item.hasImage = false;
    }

    this.setData({ item });
  },

  goBack() {
    wx.navigateBack();
  },

  onEdit() {
    this.selectComponent('#addCostPanel').openEdit(this.data.itemId);
  },

  onEditSave() {
    this._loadItem(this.data.itemId);
  },

  // 后台异步下载大图，完成后更新 item 显示
  _fetchMainImage(photoId) {
    const mainUrl = `${API_BASE}/uploads/photos/${photoId}_main.jpg`;
    downloadAndCacheMain(photoId, mainUrl).then(localPath => {
      const item = this.data.item;
      if (item && item.photoId === photoId) {
        this.setData({ item: { ...item, imageUrl: localPath, hasImage: true } });
      }
    }).catch(err => {
      console.warn('[item-detail] main image download failed for', photoId, err);
    });
  },

  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: `确定要删除「${this.data.item.name}」吗？删除后无法恢复。`,
      confirmColor: '#aa664e',
      success: res => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中…' });
        ItemService.deleteItem(this.data.itemId).then(() => {
          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'success' });
          AppStore.set(() => ({ items: ItemService.getItems() }));
          setTimeout(() => wx.navigateBack(), 1200);
        }).catch(() => {
          wx.hideLoading();
          wx.showToast({ title: '删除失败', icon: 'none' });
        });
      },
    });
  },
});
