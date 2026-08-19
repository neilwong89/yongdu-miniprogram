/**
 * @typedef {Object} Item
 * @property {string} id - 物品唯一ID，格式 item_xxx
 * @property {string} name - 物品名称
 * @property {number} price - 购买价格（分）
 * @property {number} [otherFees=0] - 其他费用（分）
 * @property {string} purchaseDate - 购买日期 YYYY-MM-DD
 * @property {'day'|'count'} unit - 计量单位：按天/按次
 * @property {'using'|'paused'|'retired'} status - 状态：使用中/已暂停/已报废
 * @property {string} [categoryId] - 分类ID
 * @property {string} [remark] - 备注
 * @property {number} usedCount - 已使用次数（按次物品）
 * @property {number} customOrder - 自定义排序字段（时间戳）
 * @property {number} createdAt - 创建时间戳（毫秒）
 * @property {number} updatedAt - 更新时间戳（毫秒）
 */

/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name
 * @property {string} [icon] - emoji或图标
 * @property {number} [order] - 排序
 */

/**
 * @typedef {Object} Change
 * @property {number} seq - 序列号
 * @property {'upsert'|'delete'} type
 * @property {Item|{id:string}} item
 * @property {number} timestamp
 */

module.exports = {};
