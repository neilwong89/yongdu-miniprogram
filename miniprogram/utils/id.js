/**
 * ID生成工具
 * 格式: item_ + 时间戳36进制 + 随机6位36进制
 */

/**
 * 生成物品ID
 * @returns {string}
 */
function generateItemId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `item_${ts}${rand}`;
}

module.exports = {
  generateItemId,
};
