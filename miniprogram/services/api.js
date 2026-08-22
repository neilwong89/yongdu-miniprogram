/**
 * ApiService - 服务端API封装
 * 所有服务端请求通过此处发出
 */

const { BASE_URL, API_TIMEOUT } = require('../config/env');
const StorageService = require('./storage');

const ApiService = {
  /**
   * 获取openid（从本地缓存）
   * @returns {string|null}
   */
  getOpenid() {
    return StorageService.getSync('openid') || null;
  },

  /**
   * 设置openid
   * @param {string} openid
   */
  setOpenid(openid) {
    StorageService.setSync('openid', openid);
  },

  /**
   * 请求封装
   * @param {string} url
   * @param {object} data
   * @param {string} [method='POST']
   * @returns {Promise<object>}
   */
  async _request(url, data, method = 'POST') {
    const openid = this.getOpenid();
    const header = {
      'Content-Type': 'application/json',
    };
    if (openid) {
      header['X-Openid'] = openid;
    }

    return new Promise((resolve, reject) => {
      wx.request({
        url: `${BASE_URL}/api/yongdu${url}`,
        method,
        data,
        header,
        timeout: API_TIMEOUT,
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data || {});
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'request failed'}`));
          }
        },
        fail: (err) => {
          reject(new Error(err.errMsg || 'network error'));
        },
      });
    });
  },

  /**
   * 注册/确认用户身份
   * @param {string} openid
   * @returns {Promise<{code: number, message: string}>}
   */
  async registerUser(openid) {
    return this._request('/user/register', { openid }, 'POST');
  },

  /**
   * 增量同步
   * @param {object} payload
   * @param {string} payload.openid
   * @param {Array} payload.changes
   * @param {number} payload.lastSyncAt
   * @returns {Promise<object>}
   */
  async syncItems(payload) {
    return this._request('/items/sync', payload, 'POST');
  },

  /**
   * 获取全量物品（首次同步/兜底）
   * @param {string} openid
   * @returns {Promise<{code: number, items: Array}>}
   */
  async getItems(openid) {
    return this._request(`/items?openid=${encodeURIComponent(openid)}`, {}, 'GET');
  },
};

module.exports = ApiService;
