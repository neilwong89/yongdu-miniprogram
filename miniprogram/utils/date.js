/**
 * 日期计算工具
 */

/**
 * 计算已使用天数（向上取整）
 * 当天购买也算1天
 * @param {string} purchaseDate - 格式 YYYY-MM-DD
 * @returns {number}
 */
function calcDaysUsed(purchaseDate) {
  const diff = Date.now() - new Date(purchaseDate + 'T00:00:00').getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return Math.max(1, days);
}

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {Date|number|string} date
 * @returns {string}
 */
function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 获取今天的日期字符串 YYYY-MM-DD
 * @returns {string}
 */
function today() {
  return formatDate(new Date());
}

/**
 * 计算两个日期之间的天数
 * @param {string} date1 - YYYY-MM-DD
 * @param {string} date2 - YYYY-MM-DD
 * @returns {number}
 */
function daysBetween(date1, date2) {
  const d1 = new Date(date1 + 'T00:00:00').getTime();
  const d2 = new Date(date2 + 'T00:00:00').getTime();
  return Math.abs(Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)));
}

module.exports = {
  calcDaysUsed,
  formatDate,
  today,
  daysBetween,
};
