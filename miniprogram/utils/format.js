/**
 * 格式化工具
 */

/**
 * 保留小数位（截断非四舍五入）
 * @param {number} value
 * @param {number} [decimals=2]
 * @returns {number}
 */
function keepDecimals(value, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.floor(value * factor) / factor;
}

/**
 * 格式化金额（分->元，保留2位小数）
 * @param {number} fen
 * @returns {string}
 */
function formatMoney(fen) {
  return (fen / 100).toFixed(2);
}

/**
 * 格式化百分比
 * @param {number} value - 0~1之间的小数
 * @param {number} [decimals=1]
 * @returns {string}
 */
function formatPercent(value, decimals = 1) {
  return (value * 100).toFixed(decimals) + '%';
}

/**
 * 格式化数量（添加千分位）
 * @param {number} num
 * @returns {string}
 */
function formatNumber(num) {
  return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 截断字符串（末尾加省略号）
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

module.exports = {
  keepDecimals,
  formatMoney,
  formatPercent,
  formatNumber,
  truncate,
};
