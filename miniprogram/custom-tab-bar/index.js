Component({
  properties: {
    panelOpen: { type: Number, value: 0, observer: '_onPanelOpenChange' },
  },

  data: {
    active: 0,
    list: [
      { pagePath: '/pages/cost/index', text: '用度' },
      { pagePath: '/pages/insight/index', text: '洞察' },
    ],
  },

  lifetimes: {
    attached() {
      getApp().globalData._tabBarRef = this;
      this._updateActive();
    },
    detached() {
      getApp().globalData._tabBarRef = null;
    },
  },

  methods: {
    _updateActive() {
      const pages = getCurrentPages();
      if (!pages.length) return;
      const route = '/' + pages[pages.length - 1].route;
      const idx = this.data.list.findIndex(item => item.pagePath === route);
      this.setData({ active: idx !== -1 ? idx : 0 });
    },

    _onPanelOpenChange(val) {
      // 空 observer，由 CSS class 驱动样式
    },

    // 点击加号/叉号按钮
    onTogglePanel() {
      if (this.data.panelOpen === 1) {
        this.setData({ panelOpen: 0 });
        return;
      }
      const pages = getCurrentPages();
      if (!pages.length) return;
      const page = pages[pages.length - 1];
      const panel = page.selectComponent('#addCostPanel');
      if (!panel) return;
      this.setData({ panelOpen: 1 });
      panel.show();
    },

    // 绿色保存按钮 → 触发 panel 保存，保存成功后再关闭 FAB、恢复 TabBar
    onSave() {
      const pages = getCurrentPages();
      if (!pages.length) return;
      const panel = pages[pages.length - 1].selectComponent('#addCostPanel');
      if (!panel) return;
      panel.saveAndClose().then(() => {
        // 保存成功后关闭 FAB、恢复 TabBar
        this.onTogglePanel();
      });
    },

    // 红色取消按钮 → TabBar 自己关闭，不走外部链路
    onCancel() {
      // TabBar 按钮消失（TabBar 自己的 setData）
      this.onTogglePanel();
      // panel 隐藏（panel 自己的方法）
      const pages = getCurrentPages();
      if (!pages.length) return;
      const panel = pages[pages.length - 1].selectComponent('#addCostPanel');
      if (panel) panel.hide();
    },

    // 左右 tab 切换
    switchTab(e) {
      const { index } = e.currentTarget.dataset;
      const item = this.data.list[index];
      if (index === this.data.active) return;
      wx.switchTab({ url: item.pagePath });
    },
  },
});
