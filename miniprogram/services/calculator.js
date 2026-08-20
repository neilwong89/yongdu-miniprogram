/**
 * CostCalculator - 成本计算纯函数
 * 所有计算逻辑不读写存储，不产生副作用
 */

/**
 * 计算已使用天数（向上取整）
 * 当天购买也算1天
 * @param {string} purchaseDate - 购买日期，格式 YYYY-MM-DD
 * @returns {number}
 */
function calcDaysUsed(purchaseDate) {
  const diff = Date.now() - new Date(purchaseDate + 'T00:00:00').getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return Math.max(1, days);
}

/**
 * 单个按天物品的每日成本
 * status不是using或unit不是day时返回0
 * @param {object} item
 * @returns {number}
 */
function calcDailyCost(item) {
  if (item.status !== 'using' || item.unit !== 'day') return 0;
  const days = calcDaysUsed(item.purchaseDate);
  return (item.price + (item.otherFees || 0)) / days / 100;
}

/**
 * 单个按次物品的每次成本
 * usedCount为0时返回null
 * @param {object} item
 * @returns {number|null}
 */
function calcPerUseCost(item) {
  if (item.status !== 'using' || item.unit !== 'count') return null;
  if ((item.usedCount || 0) === 0) return null;
  return (item.price + (item.otherFees || 0)) / item.usedCount / 100;
}

/**
 * 今日成本 = 所有使用中按天物品每日成本之和
 * @param {Array} items
 * @returns {number}
 */
function calcTotalDailyCost(items) {
  return items.reduce((sum, item) => sum + (calcDailyCost(item) || 0), 0);
}

/**
 * 按次物品平均每次成本
 * avgCost: 所有按次物品总价之和 ÷ 所有按次物品已用次数之和
 * usedCount全为0时 avgCost=null
 * @param {Array} items
 * @returns {{avgCost: number|null, count: number}}
 */
function calcAveragePerUseCost(items) {
  const countItems = items.filter(i => i.status === 'using' && i.unit === 'count');
  if (!countItems.length) return { avgCost: null, count: 0 };
  const totalPrice = countItems.reduce((s, i) => s + i.price + (i.otherFees || 0), 0);
  const totalUsed = countItems.reduce((s, i) => s + (i.usedCount || 0), 0);
  if (totalUsed === 0) return { avgCost: null, count: countItems.length };
  return { avgCost: totalPrice / totalUsed, count: countItems.length };
}

/**
 * 按次物品剩余成本
 * = (总价 / 预期总次数) × 剩余次数
 * = (price + otherFees) / expectedDays × (expectedDays - usedCount)
 * @param {object} item
 * @returns {number|null}
 */
function calcRemainingCost(item) {
  if (item.status !== 'using' || item.unit !== 'count') return null;
  const expectedDays = item.expectedDays || 0;
  const usedCount = item.usedCount || 0;
  if (expectedDays <= 0) return null;
  const remaining = expectedDays - usedCount;
  if (remaining <= 0) return 0;
  return (item.price + (item.otherFees || 0)) / expectedDays * remaining / 100;
}

const CostCalculator = {
  calcDaysUsed,
  calcDailyCost,
  calcPerUseCost,
  calcTotalDailyCost,
  calcAveragePerUseCost,
  calcRemainingCost,
};

module.exports = CostCalculator;
