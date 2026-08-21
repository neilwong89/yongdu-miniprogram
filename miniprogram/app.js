// 用度·微信小程序
const AppStore = require('./stores/app-store');
const ItemService = require('./services/item');

App({
  globalData: {
    openid: '',
    openidReady: null,
    userReady: null,
    nickname: '',
    avatarUrl: '',
    apiBase: 'https://api.newmark.top',
    fontReady: false,
    appReady: false,
    // 弹层状态（跨 Tab 保持）
    panelState: null,
  },

  onLaunch() {
    console.log('[app] onLaunch');
    this.globalData.appReady = true;
    this._loadFont();
  },

  _loadFont() {
    console.log('[font] 开始加载字体...');
    console.log('[font] 字体: 宋体 (SimSun) 子集');

    wx.loadFontFace({
      family: 'SimSun',
      source: 'url("https://api.newmark.top/fonts/NotoSerifSC-Subset.ttf")',
      global: true,
      success: (res) => {
        console.log('[font] ✅ 字体加载成功! status:', res.status);
        this.globalData.fontReady = true;
        this._notifyFontReady();
      },
      fail: (err) => {
        console.error('[font] ❌ 字体加载失败');
        console.error('[font]   errMsg:', err.errMsg);
        console.error('[font]   errNo:', err.errNo);
        console.error('[font]   status:', err.status);
        this.globalData.fontReady = false;
        this._notifyFontReady();
      },
    });

    this._initApp();
  },

  _notifyFontReady() {
    if (this.fontReadyCallback) {
      this.fontReadyCallback(this.globalData.fontReady);
    }
  },

  // 页面通过此方法注册字体 ready 回调
  onFontReady(callback) {
    this.fontReadyCallback = callback;
    // 如果字体已经加载好了，立即回调
    if (this.globalData.fontReady) {
      callback(this.globalData.fontReady);
    }
  },

  _initApp() {
    console.log('[app] 并行初始化 openid + store...');
    this.ensureOpenId();
    this._initStore();
  },

  async _initStore() {
    try {
      const items = await ItemService.loadItems();
      const categories = wx.getStorageSync('categories') || [];
      AppStore.set({ items, categories });
    } catch (e) {
      console.error('[app] initStore error', e);
    }
  },

  ensureOpenId() {
    if (this.globalData.openidReady) return;
    const promise = new Promise((resolve, reject) => {
      this.globalData.openidReady = { resolve, reject };
    });
    this.globalData.openidReady = promise;

    const login = () => {
      wx.login({
        success: (res) => {
          if (!res.code) {
            this.globalData.openidReady.resolve('temp_' + Date.now());
            return;
          }
          wx.request({
            url: `${this.globalData.apiBase}/api/code2session`,
            data: { code: res.code },
            success: (r) => {
              const data = r.data;
              if (data.openid) {
                this.globalData.openid = data.openid;
                this.globalData.openidReady?.resolve?.(data.openid);
              } else {
                this.globalData.openidReady?.resolve?.('temp_' + Date.now());
              }
            },
            fail: () => {
              this.globalData.openidReady?.resolve?.('temp_' + Date.now());
            }
          });
        },
        fail: () => {
          this.globalData.openidReady?.resolve?.('temp_' + Date.now());
        }
      });
    };

    login();
  },

  ensureNickname() {
    return new Promise((resolve) => {
      const check = () => {
        if (this.globalData.nickname) {
          resolve(this.globalData.nickname);
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });
  }
});
