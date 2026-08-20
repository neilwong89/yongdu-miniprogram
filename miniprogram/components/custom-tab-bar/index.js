Component({
  data: {
    active: 0,
    list: [
      { pagePath: '/pages/cost/index', text: '用度' },
      { pagePath: '/pages/add-cost/index', text: '' },
      { pagePath: '/pages/insight/index', text: '洞察' },
    ],
  },

  attached() { this._updateActive(); },

  pageLifetimes: {
    show() { this._updateActive(); },
  },

  methods: {
    _updateActive() {
      const pages = getCurrentPages();
      if (!pages.length) return;
      const route = '/' + pages[pages.length - 1].route;
      const idx = this.data.list.findIndex(item => item.pagePath === route);
      if (idx !== -1) this.setData({ active: idx });
    },

    switchTab(e) {
      const { index } = e.currentTarget.dataset;
      const item = this.data.list[index];
      if (index === 1) {
        wx.redirectTo({ url: item.pagePath });
      } else {
        wx.switchTab({ url: item.pagePath });
      }
    },
  },
});
