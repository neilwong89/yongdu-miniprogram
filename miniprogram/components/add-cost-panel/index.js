/**
 * 添加/编辑拥有 弹层面板组件
 * 外部控制显示/隐藏，save 成功后通过 triggerEvent 通知父页面
 */
const ItemService = require('../../services/item');
const AppStore = require('../../stores/app-store');
const { today } = require('../../utils/date');
const { compressMain, compressThumb } = require('../../utils/image-compress');
const { saveLocalThumb } = require('../../utils/photo-cache');
const API_BASE = 'https://api.newmark.top';

const EMOJIS = ['📱', '💻', '⌚', '🎧', '📷', '🚗', '💊', '🍔', '👕', '🏋️', '📚', '🎮', '🎵', '💰', '🔧', '📦'];

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

const STATUS_OPTIONS = [
  { value: 'using', label: '使用中' },
  { value: 'paused', label: '已暂停' },
  { value: 'retired', label: '已卖出' },
];

Component({
  properties: {
    // 'add' | 'edit'
    mode: { type: String, value: 'add' },
    // 编辑模式时的拥有 ID
    itemId: { type: String, value: '' },
  },

  data: {
    visible: false,
    // 动画
    panelVisible: false,
    animPanel: null,
    animMask: null,

    // 表单数据
    icon: '',
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
    soldPrice: '',
    soldDate: today(),
    photoId: '',
    photoLocalPath: '',
    photoPendingUpload: false,

    emojis: EMOJIS,
    statusOptions: STATUS_OPTIONS,
    showCategoryPicker: false,
    categoryList: [],
    showStatusPicker: false,
    showCustomCategoryInput: false,
    showEmojiPicker: false,
    emojiMaskAnimating: false,
    // 类别横向展开
    showCategoryExpanded: false,
  },

  lifetimes: {
    attached() {
      this._buildCategoryList();
    },
  },

  methods: {
    show(opts = {}) {
      const app = getApp();
      if (opts.itemId) {
        this.setData({ mode: 'edit', itemId: opts.itemId });
      }
      this._buildCategoryList();
      if (opts.itemId || (this.properties.mode === 'edit' && this.properties.itemId)) {
        this._loadItem(opts.itemId || this.properties.itemId);
      } else {
        this._resetForm();
      }
      this.setData({ visible: true });
      setTimeout(() => this._playIn(), 20);
    },

    // ---------- 外部调用：打开编辑模式 ----------
    openEdit(itemId) {
      this.show({ itemId });
    },

    // ---------- 外部调用：隐藏面板 ----------
    hide() {
      this._resetForm(); // 关闭即丢弃填写内容
      this._playOut(() => {
        this.setData({ visible: false, panelVisible: false });
      });
    },

    // ---------- 外部调用：切换显示/隐藏 ----------
    toggle() {
      if (this.data.visible) {
        this.hide();
      } else {
        this.show();
      }
    },

    // ---------- 动画 ----------
    _playIn() {
      const a = wx.createAnimation({ duration: 280, timingFunction: 'ease-out' });
      const m = wx.createAnimation({ duration: 200, timingFunction: 'ease-out' });
      a.translateY(0).step();
      m.opacity(1).step();
      this.setData({ animPanel: a.export(), animMask: m.export(), panelVisible: true });
    },

    _playOut(cb) {
      const a = wx.createAnimation({ duration: 240, timingFunction: 'ease-in' });
      const m = wx.createAnimation({ duration: 200, timingFunction: 'ease-in' });
      a.translateY('100%').step();
      m.opacity(0).step();
      this.setData({ animPanel: a.export(), animMask: m.export() });
      setTimeout(cb, 260);
    },

    // ---------- 关闭（遮罩点击） ----------
    onMaskTap() {
      const app = getApp();
      if (app.globalData._tabBarRef) {
        app.globalData._tabBarRef.setData({ panelOpen: 0 });
      }
      this.hide();
    },

    // ---------- 右上角取消 ----------
    onCancel() {
      const app = getApp();
      if (app.globalData._tabBarRef) {
        app.globalData._tabBarRef.setData({ panelOpen: 0 });
      }
      this.hide();
    },

    // ---------- 加号保存并关闭 ----------
    saveAndClose() {
      return new Promise((resolve, reject) => {
        const { name, price, purchaseDate, icon, categoryId, categoryName, status, otherFees, unit, remark, soldPrice, soldDate, soldNote, photoId, photoLocalPath, photoPendingUpload } = this.data;
        const isEdit = this.properties.mode === 'edit';
        const editId = this.properties.itemId;

        if (!name.trim()) {
          wx.showToast({ title: '请输入拥有名称', icon: 'none' }); reject(new Error('empty name')); return;
        }
        if (name.trim().length > 20) {
          wx.showToast({ title: '名称最多20字', icon: 'none' }); reject(new Error('name too long')); return;
        }
        const priceNum = parseFloat(price);
        if (isNaN(priceNum) || priceNum <= 0) {
          wx.showToast({ title: '请输入正确的单价', icon: 'none' }); reject(new Error('invalid price')); return;
        }
        if (purchaseDate > today()) {
          wx.showToast({ title: '入手日期不能晚于今天', icon: 'none' }); reject(new Error('future date')); return;
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
          photoId,
        };
        if (status === 'retired' && soldPrice) {
          itemData.soldPrice = Math.round(parseFloat(soldPrice) * 100);
          itemData.soldDate = soldDate;
          if (soldNote) itemData.soldNote = soldNote.trim();
        }

        wx.showLoading({ title: '保存中…' });

        // 如果选了新图，先上传再保存
        const doSave = () => {
          const fn = isEdit
            ? ItemService.updateItem.bind(null, editId, itemData)
            : ItemService.addItem.bind(null, itemData);

          fn().then((result) => {
            wx.hideLoading();
            // 刷新页面列表
            const pages = getCurrentPages();
            if (pages.length) {
              const page = pages[pages.length - 1];
              if (typeof page.onAddCostSave === 'function') {
                page.onAddCostSave();
              }
            }
            this._playOut(() => {
              this._resetForm();
              this.setData({ visible: false, panelVisible: false });
            });
            resolve();
          }).catch(err => {
            wx.hideLoading();
            wx.showToast({ title: '保存失败', icon: 'none' });
            console.error('[add-cost-panel] save error', err);
            reject(err);
          });
        };

        if (photoId && photoLocalPath && photoPendingUpload) {
          // 选了新图：先上传 main，等成功再上传 thumb，然后保存
          this._uploadFile(photoLocalPath, photoId, 0, 0, 'main').then(mainRes => {
            if (mainRes.code !== 0) throw new Error('main upload failed');
            return this._uploadFile(photoLocalPath, photoId, 0, 0, 'thumb');
          }).then(thumbRes => {
            if (thumbRes.code !== 0) throw new Error('thumb upload failed');
            this.setData({ photoPendingUpload: false });
            doSave();
          }).catch(err => {
            wx.hideLoading();
            wx.showToast({ title: '图片上传失败', icon: 'none' });
            console.error('[photo] save upload error:', err);
            reject(err);
          });
        } else {
          // 没有新图，直接保存
          doSave();
        }
      });
    },

    // ---------- 表单操作 ----------
    _resetForm() {
      this.setData({
        icon: '🎁',
        name: '',
        categoryId: PRESET_CATEGORIES[0].id,
        categoryName: PRESET_CATEGORIES[0].name,
        status: 'using',
        statusLabel: '使用中',
        purchaseDate: today(),
        price: '',
        otherFees: '',
        unit: 'day',
        remark: '',
        soldPrice: '',
        soldDate: today(),
        photoId: '',
        photoLocalPath: '',
        photoPendingUpload: false,
      });
    },

    _buildCategoryList() {
      const state = AppStore.getState();
      const customCats = (state.categories || []).filter(c => !PRESET_CATEGORIES.find(p => p.id === c.id));
      this.setData({ categoryList: [...PRESET_CATEGORIES, ...customCats, { id: '__custom__', name: '自定义类别' }] });
    },

    _loadItem(id) {
      const item = ItemService.getItem(id);
      if (!item) {
        wx.showToast({ title: '拥有不存在', icon: 'none' });
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
        soldPrice: item.soldPrice != null ? String(item.soldPrice / 100) : '',
        soldDate: item.soldDate || today(),
        photoId: item.photoId || '',
        photoLocalPath: '',
      });
    },

    onEmojiTap(e) {
      this.setData({ icon: e.currentTarget.dataset.emoji });
    },

    // ---------- 图标按钮 ----------
    onIconButtonTap() {
      // 先显示遮罩（动画淡入），再显示弹窗内容（缩放淡入）
      this.setData({ emojiMaskAnimating: true });
      setTimeout(() => this.setData({ showEmojiPicker: true }), 10);
    },

    onEmojiSelect(e) {
      // 选图标时清除图片（二选一）
      const { photoLocalPath } = this.data;
      const clearPhoto = photoLocalPath ? { photoLocalPath: '', photoId: '', photoPendingUpload: false } : {};
      this.setData({ icon: e.currentTarget.dataset.emoji, showEmojiPicker: false, ...clearPhoto });
      setTimeout(() => this.setData({ emojiMaskAnimating: false }), 260);
    },

    onEmojiPickerClose() {
      // 关闭弹窗：隐藏 dialog，延迟关闭 mask，等待渐隐完成
      this.setData({ showEmojiPicker: false });
      setTimeout(() => this.setData({ emojiMaskAnimating: false }), 260);
    },

    // 清除图片
    onPhotoClear() {
      this.setData({ photoLocalPath: '', photoId: '', photoPendingUpload: false, icon: '🎁' });
    },

    // 清除图标
    onIconClear() {
      this.setData({ icon: '🎁' });
    },

    // ---------- 图片上传 ----------
    async onPhotoTap() {
      wx.chooseImage({
        count: 1,
        sourceType: ['camera', 'album'],
        success: async (res) => {
          console.warn('[photo] chooseImage success');
          const originalPath = (res.tempFilePaths && res.tempFilePaths[0])
            || (res.tempFiles && res.tempFiles[0] && res.tempFiles[0].path);
          console.warn('[photo] originalPath:', originalPath);
          if (!originalPath) {
            wx.showToast({ title: '图片选择失败', icon: 'none' });
            return;
          }

          wx.showLoading({ title: '处理中…' });

          try {
            // 生成 photo_id，直接复制到本地缓存（不上传到服务器）
            const photoId = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
            const fs = wx.getFileSystemManager();
            const cacheDir = `${wx.env.USER_DATA_PATH}/photo_cache`;
            const savedThumbPath = await new Promise((resolve, reject) => {
              fs.copyFile({
                srcPath: originalPath,
                destPath: `${cacheDir}/${photoId}.jpg`,
                success: () => resolve(`${cacheDir}/${photoId}.jpg`),
                fail: reject,
              });
            });
            console.warn('[photo] local copy done:', savedThumbPath);

            wx.hideLoading();
            // photoPendingUpload = true 表示选了新图，保存时要上传
            // 同时清除 icon（二选一）
            this.setData({ photoId, photoLocalPath: savedThumbPath, photoPendingUpload: true, icon: '' });
          } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '图片处理失败', icon: 'none' });
            console.error('[photo] onPhotoTap error:', err);
          }
        },
        fail: (err) => {
          if (err.errMsg && err.errMsg.includes('cancel')) return;
          wx.showToast({ title: '选择图片失败', icon: 'none' });
        }
      });
    },

    _uploadFile(filePath, photoId, width, height, field) {
      console.warn('[photo] _uploadFile field:', field, 'filePath:', filePath);
      return new Promise((resolve, reject) => {
        wx.uploadFile({
          url: `${API_BASE}/api/yongdu/photo/upload`,
          filePath,   // 直接用原始路径，不做任何处理
          name: field,
          formData: { photo_id: photoId, width, height },
          success: (res) => {
            console.warn('[photo] uploadFile success, statusCode:', res.statusCode);
            try {
              resolve(JSON.parse(res.data));
            } catch (_) {
              reject(new Error('invalid response'));
            }
          },
          fail: (err) => {
            console.error('[photo] uploadFile fail:', JSON.stringify(err));
            reject(err);
          },
        });
      });
    },

    onNameInput(e) {
      this.setData({ name: e.detail.value });
    },

    onCategoryTap() {
      this._buildCategoryList();
      this.setData({ showCategoryExpanded: !this.data.showCategoryExpanded });
    },

    onCategorySelect(e) {
      const cat = e.currentTarget.dataset.cat;
      if (!cat) return;
      if (cat.id === '__custom__') {
        this.setData({ showCategoryExpanded: false, showCustomCategoryInput: true });
        // 弹窗渐显动画200ms完成后立即聚焦
        setTimeout(() => {
          this.selectComponent('#customCategoryInput') && this.selectComponent('#customCategoryInput').getFieldNode && this.selectComponent('#customCategoryInput').getFieldNode().focus();
        }, 200);
      } else {
        this.setData({ showCategoryExpanded: false, categoryId: cat.id, categoryName: cat.name });
      }
    },

    onCategoryPickerChange(e) {
      const idx = parseInt(e.detail.value, 10);
      const cat = this.data.categoryList[idx];
      if (!cat) return;
      if (cat.id === '__custom__') {
        this.setData({ showCategoryPicker: false, showCustomCategoryInput: true });
        // 弹窗渐显动画200ms完成后立即聚焦
        setTimeout(() => {
          this.selectComponent('#customCategoryInput') && this.selectComponent('#customCategoryInput').getFieldNode && this.selectComponent('#customCategoryInput').getFieldNode().focus();
        }, 200);
      } else {
        this.setData({ showCategoryPicker: false, categoryId: cat.id, categoryName: cat.name });
      }
    },

    onCategoryPickerCancel() {
      this.setData({ showCategoryPicker: false, showCategoryExpanded: false });
    },

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
      });
      this._buildCategoryList();
      wx.showToast({ title: '分类已添加', icon: 'none' });
    },

    onCustomCategoryCancel() {
      this.setData({ showCustomCategoryInput: false, customCategoryName: '' });
    },

    onStatusTap() {
      this.setData({ showStatusPicker: true });
    },

    onStatusPickerChange(e) {
      const idx = parseInt(e.detail.value, 10);
      const option = this.data.statusOptions[idx];
      if (option) {
        this.setData({ showStatusPicker: false, status: option.value, statusLabel: option.label });
      }
    },

    onStatusPickerCancel() {
      this.setData({ showStatusPicker: false });
    },

    onPurchaseDateChange(e) {
      this.setData({ purchaseDate: e.detail.value });
    },

    onSoldDateChange(e) {
      this.setData({ soldDate: e.detail.value });
    },

    onPriceInput(e) {
      this.setData({ price: e.detail.value });
    },

    onOtherFeesInput(e) {
      this.setData({ otherFees: e.detail.value });
    },

    onUnitChange(e) {
      this.setData({ unit: e.currentTarget.dataset.unit });
    },

    onRemarkInput(e) {
      this.setData({ remark: e.detail.value });
    },

    onSoldPriceInput(e) {
      this.setData({ soldPrice: e.detail.value });
    },

    noop() {},
  },
});
