/**
 * ItemService - 物品业务逻辑层
 * 所有物品操作通过ItemService，数据变更后自动触发增量同步
 */

const StorageService = require('./storage');
const SyncManager = require('./sync');

// 内存中的物品列表
let _items = [];
// 变更队列（待同步的变更项）
let _changeQueue = [];
// 每次操作生成单调递增的序列号
let _itemSeq = 0;
// openid获取函数（由外部注入）
let _getOpenid = null;

// ---------- 数据访问 ----------

/**
 * 获取所有物品（副本）
 * @returns {Array}
 */
function getItems() {
  return [..._items];
}

/**
 * 根据ID获取单个物品
 * @param {string} id
 * @returns {object|null}
 */
function getItem(id) {
  return _items.find(i => i.id === id) || null;
}

// ---------- 变更记录 ----------

/**
 * 记录变更并触发同步
 * @param {'upsert'|'delete'} type
 * @param {object} item
 */
function _pushChange(type, item) {
  _changeQueue.push({
    seq: ++_itemSeq,
    type,
    item,
    timestamp: Date.now(),
  });
  SyncManager.onItemsChanged(_changeQueue);
}

// ---------- 物品操作 ----------

/**
 * 从本地存储加载物品
 * @returns {Promise<Array>}
 */
async function loadItems() {
  _items = (await StorageService.get('items')) || [];
  return _items;
}

/**
 * 保存物品到本地存储
 * @returns {Promise<void>}
 */
async function saveItems() {
  await StorageService.set('items', _items);
}

/**
 * 添加物品
 * @param {object} itemData
 * @returns {Promise<object>}
 */
async function addItem(itemData) {
  const now = Date.now();
  const id = 'item_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const item = {
    ...itemData,
    id,
    usedCount: 0,
    customOrder: now,
    createdAt: now,
    updatedAt: now,
  };
  _items.push(item);
  await saveItems();
  _pushChange('upsert', item);
  return item;
}

/**
 * 更新物品
 * @param {string} id
 * @param {object} updates
 * @returns {Promise<object|null>}
 */
async function updateItem(id, updates) {
  const idx = _items.findIndex(i => i.id === id);
  if (idx === -1) return null;
  _items[idx] = { ..._items[idx], ...updates, updatedAt: Date.now() };
  await saveItems();
  _pushChange('upsert', _items[idx]);
  return _items[idx];
}

/**
 * 删除物品
 * @param {string} id
 * @returns {Promise<void>}
 */
async function deleteItem(id) {
  _items = _items.filter(i => i.id !== id);
  await saveItems();
  _pushChange('delete', { id });
}

/**
 * 记录一次使用（按次物品）
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function useOnce(id) {
  const item = _items.find(i => i.id === id);
  if (!item || item.unit !== 'count') return null;
  item.usedCount = (item.usedCount || 0) + 1;
  item.updatedAt = Date.now();
  await saveItems();
  _pushChange('upsert', item);
  return item;
}

// ---------- 服务端数据合并（同步完成后调用） ----------

/**
 * 合并服务端变更到本地
 * @param {Array} serverChanges
 */
function mergeServerChanges(serverChanges) {
  for (const change of serverChanges) {
    if (change.type === 'upsert') {
      const idx = _items.findIndex(i => i.id === change.item.id);
      if (idx >= 0) {
        _items[idx] = change.item;
      } else {
        _items.push(change.item);
      }
    } else if (change.type === 'delete') {
      _items = _items.filter(i => i.id !== change.item.id);
    }
  }
  saveItems();
}

// ---------- 变更队列访问（供SyncManager调用） ----------

/**
 * 获取并清空当前变更队列
 * @returns {Array} 当前的变更队列（原始引用）
 */
function getAndClearChangeQueue() {
  const queue = _changeQueue;
  _changeQueue = [];
  return queue;
}

/**
 * 设置openid获取函数（用于初始化SyncManager）
 * @param {function} fn
 */
function setOpenidGetter(fn) {
  _getOpenid = fn;
}

const ItemService = {
  getItems,
  getItem,
  loadItems,
  saveItems,
  addItem,
  updateItem,
  deleteItem,
  useOnce,
  mergeServerChanges,
  getAndClearChangeQueue,
  setOpenidGetter,
};

module.exports = ItemService;
