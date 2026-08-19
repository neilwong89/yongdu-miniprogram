/**
 * AppStore - 全局状态管理（发布订阅模式）
 * 类似werewolf的game-store，提供getState/subscribe/notify
 */

const AppStore = {
  // 状态
  _state: {
    items: [],              // 物品列表
    categories: [],         // 分类列表（预置+自定义）
    filterStatus: 'all',   // 过滤状态：all | using | paused | retired
    filterCategory: 'all', // 过滤分类：all | categoryId
    sortOrder: 'custom',   // 排序：custom | dailyCost | name | purchaseDate
    displayMode: 'list',   // 显示模式：list | card
    lastSyncAt: 0,         // 上次同步时间
    isSyncing: false,      // 是否正在同步
    isLoading: false,      // 是否正在加载
  },

  // 订阅者列表
  _subscribers: [],

  // ---------- 状态读写 ----------

  /**
   * 获取完整状态
   * @returns {object}
   */
  getState() {
    return { ...this._state };
  },

  /**
   * 获取指定状态字段
   * @param {string} key
   * @returns {any}
   */
  get(key) {
    return this._state[key];
  },

  /**
   * 更新状态（浅合并）
   * @param {object|function} updates - 对象或返回对象的函数
   */
  set(updates) {
    const prev = { ...this._state };
    if (typeof updates === 'function') {
      this._state = { ...this._state, ...updates(this._state) };
    } else {
      this._state = { ...this._state, ...updates };
    }
    this.notify(prev);
  },

  // ---------- 发布订阅 ----------

  /**
   * 订阅状态变更
   * @param {function} callback - (prevState, newState) => void
   * @returns {function} 取消订阅的函数
   */
  subscribe(callback) {
    this._subscribers.push(callback);
    return () => {
      this._subscribers = this._subscribers.filter(fn => fn !== callback);
    };
  },

  /**
   * 通知所有订阅者状态变更
   * @param {object} prev
   */
  notify(prev) {
    for (const fn of this._subscribers) {
      try {
        fn(prev, this._state);
      } catch (e) {
        console.error('[AppStore] subscriber error', e);
      }
    }
  },
};

module.exports = AppStore;
