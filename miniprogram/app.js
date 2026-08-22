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
    console.log('[app] 初始化 openid...');
    this.ensureOpenId();
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

    // 读取本地存储的 categories（含自定义分类），恢复用户数据
    const localCategories = StorageService.getSync('categories');
    if (localCategories && localCategories.length > 0) {
      AppStore.set({ categories: localCategories });
    }

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
    // 已有缓存的 openid，直接复用，跳过 wx.login
    const cachedOpenid = StorageService.getSync('openid');
    if (cachedOpenid && !cachedOpenid.startsWith('temp_')) {
      console.log('[openid] 从缓存读取 openid:', cachedOpenid);
      this.globalData.openid = cachedOpenid;
      this.globalData.openidReady = Promise.resolve(cachedOpenid);
      this._initStore();  // 缓存命中时同步调用
      return;
    }

    const promise = new Promise((resolve, reject) => {
      this.globalData.openidReady = { resolve, reject };
    });
    this.globalData.openidReady = promise;

    const login = () => {
      console.log('[openid] 调用 wx.login...');
      wx.login({
        success: (res) => {
          console.log('[openid] wx.login 成功, code:', res.code ? '已获取' : '为空');
          if (!res.code) {
            console.warn('[openid] ❌ res.code 为空，回退 temp openid');
            this.globalData.openidReady.resolve('temp_' + Date.now());
            return;
          }
          console.log('[openid] 调用 code2session API, code:', res.code);
          wx.request({
            url: `${this.globalData.apiBase}/api/code2session`,
            data: { code: res.code },
            success: (r) => {
              console.log('[openid] code2session 响应 status:', r.statusCode, 'data:', JSON.stringify(r.data));
              const data = r.data;
              if (data.openid) {
                console.log('[openid] ✅ openid 获取成功:', data.openid);
                this.globalData.openid = data.openid;
                StorageService.setSync('openid', data.openid);  // 缓存到本地，下次启动直接用
                this.globalData.openidReady?.resolve?.(data.openid);
                // openid 就绪后初始化数据层（首次从网络获取）
                this._initStore();
              } else {
                console.warn('[openid] ❌ 响应无 openid，回退 temp openid');
                this.globalData.openidReady?.resolve?.('temp_' + Date.now());
              }
            },
            fail: (err) => {
              console.error('[openid] ❌ code2session 请求失败:', err.errMsg);
              this.globalData.openidReady?.resolve?.('temp_' + Date.now());
            }
          });
        },
        fail: (err) => {
          console.error('[openid] ❌ wx.login 失败:', err.errMsg);
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
