/**
 * StorageService - 本地存储封装
 * 封装 wx.getStorage / wx.setStorage，提供同步/异步接口
 */

const StorageService = {
  /**
   * 异步获取
   * @param {string} key
   * @returns {Promise<any>}
   */
  async get(key) {
    return new Promise((resolve) => {
      wx.getStorage({
        key,
        success: (res) => resolve(res.data),
        fail: () => resolve(null),
      });
    });
  },

  /**
   * 异步设置
   * @param {string} key
   * @param {any} value
   * @returns {Promise<void>}
   */
  async set(key, value) {
    return new Promise((resolve, reject) => {
      wx.setStorage({
        key,
        data: value,
        success: () => resolve(),
        fail: (err) => reject(err),
      });
    });
  },

  /**
   * 异步删除
   * @param {string} key
   * @returns {Promise<void>}
   */
  async remove(key) {
    return new Promise((resolve) => {
      wx.removeStorage({
        key,
        success: () => resolve(),
        fail: () => resolve(),
      });
    });
  },

  /**
   * 同步获取
   * @param {string} key
   * @returns {any}
   */
  getSync(key) {
    try {
      return wx.getStorageSync(key);
    } catch (e) {
      return null;
    }
  },

  /**
   * 同步设置
   * @param {string} key
   * @param {any} value
   */
  setSync(key, value) {
    try {
      wx.setStorageSync(key, value);
    } catch (e) {
      console.error('[StorageService] setSync failed', e);
    }
  },
};

module.exports = StorageService;
