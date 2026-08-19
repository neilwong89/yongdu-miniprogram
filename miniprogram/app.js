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
  },
  
  onLaunch() {
    console.log('[app] onLaunch');
    this.ensureOpenId();
    // 初始化：加载本地物品到 AppStore
    this._initStore();
  },

  async _initStore() {
    try {
      const items = await ItemService.loadItems();
      AppStore.set({ items });
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
