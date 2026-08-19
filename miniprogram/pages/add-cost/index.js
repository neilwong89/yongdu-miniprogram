/**
 * 添加/编辑物品页
 * 路由参数: id=xxx (编辑模式)
 */
const ItemService = require('../../services/item');
const AppStore = require('../../stores/app-store');
const { today } = require('../../utils/date');

// 预设 emoji
const EMOJIS = ['📱', '💻', '⌚', '🎧', '📷', '🚗', '💊', '🍔', '👕', '🏋️', '📚', '🎮', '🎵', '💰', '🔧', '📦'];

// 预设分类
const PRESET_CATEGORIES = [
  { id: 'digital', name: '数码设备' },
  { id: 'daily', name: '日用品' },
  { id: 'food', name: '食品饮料' },
  { id: 'clothing', name: '服饰鞋包' },
  { id: 'books', name: '图书文具' },
  { id: 'sports', name: '运动户外' },
  { id: 'home', name: '家居家电' },
  { id: 'beauty', name: '美妆护肤' },
  { id: 'pet', name: '宠物用品' },
  { id: 'toys', name: '玩具手办' },
  { id: 'other', name: '其他' },
];

// 状态选项
const STATUS_OPTIONS = [
  { value: 'using', label: '使用中' },
  { value: 'paused', label: '已暂停' },
  { value: 'retired', label: '已卖出' },
];

Page({
  data: {
    // 编辑模式
    isEdit: false,
    editId: '',

    // 表单数据
    icon: EMOJIS[0],
    name: '',
    categoryId: PRESET_CATEGORIES[0].id,
    categoryName: PRESET_CATEGORIES[0].name,
    customCategoryName: '',
    status: 'using',
    statusLabel: '使用中',
    purchaseDate: today(),
    price: '',
    otherFees: '',
    unit: 'day',
    remark: '',
    expectedDays: '',

    // 卖出信息（仅已卖出状态显示）
    soldPrice: '',
    soldDate: today(),

    // 选项数据
    emojis: EMOJIS,
    categories: PRESET_CATEGORIES,
    statusOptions: STATUS_OPTIONS,

    // 分类选择器
    showCategoryPicker: false,
    categoryList: [],

    // 状态选择器
    showStatusPicker: false,

    // 自定义分类输入
    showCustomCategoryInput: false,
  },

  onLoad(opt) {
    // 构建分类列表（预置 + 自定义）
    const categories = this.buildCategoryList();
    this.setData({ categoryList: categories });

    if (opt.id) {
      // 编辑模式
      this.setData({ isEdit: true, editId: opt.id });
      wx.setNavigationBarTitle({ title: '编辑物品' });
      this.loadItem(opt.id);
    } else {
      wx.setNavigationBarTitle({ title: '添加物品' });
    }
  },

  /** 空事件（用于阻止冒泡） */
  noop() {},

  /** 返回上一页 */
  goBack() {
    wx.navigateBack();
  },

  /** 构建分类选择器列表（预置 + 自定义） */
  buildCategoryList() {
    const state = AppStore.getState();
    const customCats = (state.categories || []).filter(c => !PRESET_CATEGORIES.find(p => p.id === c.id));
    return [...PRESET_CATEGORIES, ...customCats, { id: '__custom__', name: '+ 自定义分类' }];
  },

  /** 加载物品数据（编辑模式） */
  loadItem(id) {
    const item = ItemService.getItem(id);
    if (!item) {
      wx.showToast({ title: '物品不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    const statusOption = STATUS_OPTIONS.find(s => s.value === item.status) || STATUS_OPTIONS[0];
    this.setData({
      icon: item.icon || EMOJIS[0],
      name: item.name || '',
      categoryId: item.categoryId || PRESET_CATEGORIES[0].id,
      categoryName: item.categoryName || PRESET_CATEGORIES[0].name,
      status: item.status || 'using',
      statusLabel: statusOption.label,
      purchaseDate: item.purchaseDate || today(),
      price: item.price != null ? String(item.price / 100) : '',
      otherFees: item.otherFees != null ? String(item.otherFees / 100) : '',
      unit: item.unit || 'day',
      remark: item.remark || '',
      expectedDays: item.expectedDays ? String(item.expectedDays) : '',
      soldPrice: item.soldPrice != null ? String(item.soldPrice / 100) : '',
      soldDate: item.soldDate || today(),
    });
  },

  // ---------- emoji 选择 ----------
  onEmojiTap(e) {
    this.setData({ icon: e.currentTarget.dataset.emoji });
  },

  // ---------- 名称输入 ----------
  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  // ---------- 分类选择 ----------
  onCategoryTap() {
    const list = this.buildCategoryList();
    this.setData({ showCategoryPicker: true, categoryList: list });
  },

  onCategoryPickerChange(e) {
    const idx = parseInt(e.detail.value, 10);
    const cat = this.data.categoryList[idx];
    if (!cat) return;
    if (cat.id === '__custom__') {
      this.setData({ showCategoryPicker: false, showCustomCategoryInput: true });
    } else {
      this.setData({
        showCategoryPicker: false,
        categoryId: cat.id,
        categoryName: cat.name,
      });
    }
  },

  onCategoryPickerCancel() {
    this.setData({ showCategoryPicker: false });
  },

  // ---------- 自定义分类 ----------
  onCustomCategoryInput(e) {
    this.setData({ customCategoryName: e.detail.value });
  },

  onCustomCategoryConfirm() {
    const name = this.data.customCategoryName.trim();
    if (!name) return;
    const state = AppStore.getState();
    const newCat = { id: 'custom_' + Date.now(), name, icon: '📂' };
    AppStore.set({ categories: [...(state.categories || []), newCat] });
    this.setData({
      showCustomCategoryInput: false,
      customCategoryName: '',
      categoryId: newCat.id,
      categoryName: newCat.name,
      categoryList: this.buildCategoryList(),
    });
    wx.showToast({ title: '分类已添加', icon: 'none' });
  },

  onCustomCategoryCancel() {
    this.setData({ showCustomCategoryInput: false, customCategoryName: '' });
  },

  // ---------- 状态选择（picker） ----------
  onStatusTap() {
    this.setData({ showStatusPicker: true });
  },

  onStatusPickerChange(e) {
    const idx = parseInt(e.detail.value, 10);
    const option = this.data.statusOptions[idx];
    if (option) {
      this.setData({
        showStatusPicker: false,
        status: option.value,
        statusLabel: option.label,
      });
    }
  },

  onStatusPickerCancel() {
    this.setData({ showStatusPicker: false });
  },

  // ---------- 日期选择 ----------
  onPurchaseDateChange(e) {
    this.setData({ purchaseDate: e.detail.value });
  },

  onSoldDateChange(e) {
    this.setData({ soldDate: e.detail.value });
  },

  // ---------- 价格输入 ----------
  onPriceInput(e) {
    this.setData({ price: e.detail.value });
  },

  onOtherFeesInput(e) {
    this.setData({ otherFees: e.detail.value });
  },

  // ---------- 单位选择（卡片式切换） ----------
  onUnitChange(e) {
    const unit = e.currentTarget.dataset.unit;
    this.setData({ unit });
  },

  // ---------- 预期使用天数 ----------
  onExpectedDaysInput(e) {
    this.setData({ expectedDays: e.detail.value });
  },

  // ---------- 备注输入 ----------
  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  // ---------- 卖出价格输入 ----------
  onSoldPriceInput(e) {
    this.setData({ soldPrice: e.detail.value });
  },

  // ---------- 保存 ----------
  onSave() {
    const { name, price, purchaseDate, isEdit, editId, icon, categoryId, categoryName, status, otherFees, unit, remark, expectedDays, soldPrice, soldDate } = this.data;

    // 验证：名称必填
    if (!name.trim()) {
      wx.showToast({ title: '请输入物品名称', icon: 'none' }); return;
    }
    if (name.trim().length > 20) {
      wx.showToast({ title: '名称最多20字', icon: 'none' }); return;
    }

    // 验证：单价 > 0
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      wx.showToast({ title: '请输入正确的单价', icon: 'none' }); return;
    }

    // 验证：购买日期不能晚于今天
    if (purchaseDate > today()) {
      wx.showToast({ title: '购买日期不能晚于今天', icon: 'none' }); return;
    }

    const itemData = {
      icon,
      name: name.trim(),
      categoryId,
      categoryName,
      status,
      purchaseDate,
      price: Math.round(parseFloat(price) * 100),
      otherFees: otherFees ? Math.round(parseFloat(otherFees) * 100) : 0,
      unit,
      remark: remark.trim(),
    };

    if (unit === 'day' && expectedDays) {
      itemData.expectedDays = parseInt(expectedDays, 10);
    }

    // 卖出相关字段
    if (status === 'retired' && soldPrice) {
      itemData.soldPrice = Math.round(parseFloat(soldPrice) * 100);
      itemData.soldDate = soldDate;
    }

    wx.showLoading({ title: '保存中…' });

    const fn = isEdit
      ? ItemService.updateItem.bind(null, editId, itemData)
      : ItemService.addItem.bind(null, itemData);

    fn().then(() => {
      wx.hideLoading();
      wx.showToast({ title: isEdit ? '更新成功' : '添加成功', icon: 'success' });
      // 同步刷新全局状态
      AppStore.set(() => ({ items: ItemService.getItems() }));
      setTimeout(() => wx.navigateBack(), 1200);
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
      console.error('[add-cost] save error', err);
    });
  },
});
