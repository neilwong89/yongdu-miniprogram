// 用度·微信小程序
const AppStore = require('./stores/app-store');
const ItemService = require('./services/item');
const SyncManager = require('./services/sync');
const StorageService = require('./services/storage');

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
    dataReady: false,  // 数据层初始化完成（首次同步/本地加载）
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
    // 等 openid 就绪后再初始化数据层
    (this.globalData.openidReady || Promise.resolve()).then(() => {
      this._initStore();
    });
  },

  async _initStore() {
    const app = this;
    const openid = app.globalData.openid;
    if (!openid || openid.startsWith('temp_')) {
      console.log('[app] _initStore: 无合法 openid，跳过数据加载', openid);
      return;
    }

    // 初始化同步管理器
    SyncManager.init(() => ItemService, () => openid);

    const lastSyncAt = StorageService.getSync('lastSyncAt');

    if (!lastSyncAt) {
      // 首次安装/重装后首次打开：从服务器全量拉取
      console.log('[app] _initStore: 首次同步，开始全量拉取...');
      const items = await SyncManager.doFullSync();
      if (items && items.length) {
        AppStore.set({ items });
        console.log('[app] _initStore: 全量拉取完成', items.length, '条');
      } else {
        console.log('[app] _initStore: 全量拉取完成，无数据');
      }
    } else {
      // 正常启动：从本地加载
      console.log('[app] _initStore: 从本地加载，上次同步', new Date(lastSyncAt).toLocaleString());
      const items = await ItemService.loadItems();
      AppStore.set({ items });
    }

    // 标记数据层就绪
    app.globalData.dataReady = true;
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
