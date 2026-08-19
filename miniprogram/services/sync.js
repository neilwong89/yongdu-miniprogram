/**
 * SyncManager - 增量同步管理器
 * 管理变更队列和同步状态，自动增量同步
 */

const ApiService = require('./api');
const StorageService = require('./storage');

let _lastSyncAt = 0;        // 上次同步成功的时间戳
let _isSyncing = false;     // 防止并发同步
let _syncTimer = null;

// 依赖项：需要外部传入或延迟引用，避免循环依赖
let _itemServiceGetter = null;
let _getOpenid = null;

/**
 * 初始化同步管理器
 * @param {function} itemServiceGetter - 返回ItemService的函数
 * @param {function} getOpenid - 返回openid的函数
 */
function init(itemServiceGetter, getOpenid) {
  _itemServiceGetter = itemServiceGetter;
  _getOpenid = getOpenid;

  // 读取上次同步时间
  const saved = StorageService.getSync('lastSyncAt');
  if (saved && saved > 0) {
    _lastSyncAt = saved;
  }
}

/**
 * 变更后触发同步（延迟2秒聚合变更）
 * @param {Array} changeQueue
 */
function onItemsChanged(changeQueue) {
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    // doSync 内部从 itemService 实时获取最新变更队列，避免队列陈旧
    doSync(null); // null表示用内部引用
  }, 2000);
}

/**
 * 执行增量同步
 * @param {Array|null} _ignored 忽略此参数，实时从itemService取队列
 */
async function doSync(_ignored) {
  if (_isSyncing) return;
  const openid = _getOpenid ? _getOpenid() : ApiService.getOpenid();
  if (!openid) return;

  // 实时从 ItemService 获取当前变更队列
  const ItemService = _itemServiceGetter ? _itemServiceGetter() : null;
  if (!ItemService) return;
  const currentChanges = ItemService.getAndClearChangeQueue();
  if (!currentChanges || !currentChanges.length) return;

  _isSyncing = true;

  try {
    const res = await ApiService.syncItems({
      openid,
      changes: currentChanges,
      lastSyncAt: _lastSyncAt,
    });

    if (res.code === 0) {
      // 合并服务端变更到本地（serverChanges里的item.data是JSON字符串，需先解析）
      const IS = _itemServiceGetter ? _itemServiceGetter() : null;
      if (IS && res.serverChanges && res.serverChanges.length) {
        const parsedChanges = res.serverChanges.map(change => {
          if (change.type === 'upsert' && change.item && typeof change.item.data === 'string') {
            return { ...change, item: { ...change.item, data: JSON.parse(change.item.data) } };
          }
          return change;
        });
        IS.mergeServerChanges(parsedChanges);
      }
      _lastSyncAt = res.serverTime || Date.now();
      await StorageService.set('lastSyncAt', _lastSyncAt);
      // 同步成功后清空已同步的变更（ItemService.getAndClearChangeQueue已清空）
    } else {
      // 同步失败，重试时 ItemService 的队列依然有内容，会自然重试
    }
  } catch (e) {
    console.error('[SyncManager] 同步失败', e);
  } finally {
    _isSyncing = false;
  }
}

/**
 * 执行全量同步（首次同步/兜底）
 */
async function doFullSync() {
  if (_isSyncing) return;
  const openid = _getOpenid ? _getOpenid() : ApiService.getOpenid();
  if (!openid) return;

  _isSyncing = true;
  try {
    const res = await ApiService.getItems(openid);
    if (res.code === 0) {
      // 服务端返回的items里的data是JSON字符串，需要解析
      const items = (res.items || []).map(row => {
        if (typeof row.data === 'string') {
          return JSON.parse(row.data);
        }
        return row.data;
      });
      await StorageService.set('items', items);
      // 全量同步后更新同步时间戳
      _lastSyncAt = Date.now();
      await StorageService.set('lastSyncAt', _lastSyncAt);
      return items;
    }
  } catch (e) {
    console.error('[SyncManager] 全量同步失败', e);
  } finally {
    _isSyncing = false;
  }
}

/**
 * 获取上次同步时间戳
 * @returns {number}
 */
function getLastSyncAt() {
  return _lastSyncAt;
}

const SyncManager = {
  init,
  onItemsChanged,
  doSync,
  doFullSync,
  getLastSyncAt,
};

module.exports = SyncManager;
