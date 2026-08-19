# 用度 · 技术设计文档

**版本**: v2.0
**日期**: 2026-08-19
**状态**: 待确认

---

## 一、整体架构

### 1.1 架构原则

| 原则 | 说明 |
|------|------|
| 计算在客户端 | 所有成本计算均在客户端完成，服务端仅做数据存取 |
| 服务端极简 | 服务端只负责存储和返回数据，不承载任何业务逻辑 |
| 增量同步 | 仅同步变更的数据项，支持增/改/删，不做全量覆盖 |
| OpenID用户识别 | 以微信OpenID作为用户唯一标识，无需注册登录 |
| 模块化设计 | 各功能模块独立，接口稳定，方便后续扩展升级 |

### 1.2 系统架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         微信小程序客户端                              │
│                                                                     │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────────┐    │
│  │   页面层    │   │   页面层    │   │       页面层           │    │
│  │  成本页     │   │  添加页     │   │     洞察页/详情页      │    │
│  └──────┬──────┘   └──────┬──────┘   └───────────┬─────────┘    │
│         │                  │                      │               │
│  ┌──────▼──────────────────▼──────────────────────▼─────────┐      │
│  │                      业务逻辑层                            │      │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │      │
│  │  │  ItemService │  │CostCalculator│  │ SyncManager │  │      │
│  │  │  (物品管理)   │  │  (成本计算)   │  │  (增量同步)   │  │      │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │      │
│  └──────────────────────────┬───────────────────────────────┘      │
│                             │                                        │
│  ┌──────────────────────────▼───────────────────────────────┐      │
│  │                      数据层                               │      │
│  │  ┌──────────────┐         ┌──────────────┐            │      │
│  │  │StorageService│         │  ApiService  │            │      │
│  │  │  (本地存储)   │         │  (服务端API)  │            │      │
│  │  └──────────────┘         └──────────────┘            │      │
│  └──────────────────────────────────────────────────────────┘      │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        服务端（阿里云ECS）                            │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      Express API                            │    │
│  │  POST /api/items/sync     — 增量同步                       │    │
│  │  GET  /api/items          — 获取全量（首次/兜底）          │    │
│  │  POST /api/user/register  — 注册/确认用户身份               │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                             │                                        │
│  ┌──────────────────────────▼───────────────────────────────┐      │
│  │                    SQLite 数据库                           │      │
│  │  users（openid, created_at）                           │      │
│  │  items（id, openid, data, deleted_at, updated_at）      │      │
│  └──────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 二、服务端设计

### 2.1 技术栈

| 项目 | 选择 | 理由 |
|------|------|------|
| 运行时 | Node.js 18+ | 已在阿里云ECS可用 |
| Web框架 | Express | 简单稳定，生态成熟 |
| 数据库 | **SQLite**（better-sqlite3） | 单文件、零运维、高性能，适合当前规模和增量同步模式 |
| ORM | 无（原生SQL） | 极简原则，避免抽象层开销 |
| 进程管理 | PM2 | ECS已配置 |
| 部署路径 | `/opt/yongdu/api-server/` | 独立目录，与werewolf-ws区分 |

### 2.2 数据库设计

```sql
-- 用户表（仅记录OpenID，不存其他信息）
CREATE TABLE users (
  openid TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 物品表（服务端存储完整JSON data，不解析字段）
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  openid TEXT NOT NULL,
  data TEXT NOT NULL,          -- 物品完整JSON字符串
  deleted_at INTEGER DEFAULT 0, -- 软删除标记：0=未删除，>0=删除时间戳
  updated_at INTEGER NOT NULL,   -- 物品数据的更新时间戳（客户端传入）
  created_at INTEGER NOT NULL,  -- 物品创建时间戳（客户端传入）
  FOREIGN KEY (openid) REFERENCES users(openid)
);

CREATE INDEX idx_items_openid ON items(openid);
CREATE INDEX idx_items_updated ON items(openid, updated_at);
```

> **设计决策**：
> - `deleted_at` 实现软删除（增量同步删除的核心）
> - `updated_at` 和 `created_at` 来自客户端时间戳，服务端直接存储，不重新生成
> - 服务端不解析 `data` 内容，后续物品字段扩展无需改表结构

### 2.3 API 设计

#### 2.3.1 用户注册/确认

```
POST /api/user/register
请求体: { openid: string }
响应: { code: 0, message: "ok" }
说明: 幂等操作，openid已存在时返回200不报错
```

#### 2.3.2 增量同步（核心接口）

```
POST /api/items/sync
请求体: {
  openid: string,
  changes: Change[],       -- 本次变更列表
  lastSyncAt: number      -- 客户端上次同步时间戳（毫秒）
}
响应: {
  code: 0,
  serverChanges: Change[], -- 服务端在 lastSyncAt 之后的变更
  serverTime: number       -- 服务器当前时间戳
}

Change（变更单元）: {
  type: 'upsert' | 'delete',
  item: Item | { id: string }  -- upsert时带完整Item，delete时只带id
}
```

**同步算法**：

```
客户端                         服务端
   │                              │
   │  POST /api/items/sync        │
   │  changes=[本地变更项]         │
   │  lastSyncAt=上次同步时间      │
   │ ──────────────────────────▶  │
   │                              │  ① 遍历changes
   │                              │     - upsert: INSERT OR REPLACE items
   │                              │     - delete: UPDATE items SET deleted_at=now
   │                              │                              │
   │                              │  ② 查询 updated_at > lastSyncAt 的物品
   │                              │     （包括未删除的和已软删除的）
   │                              │                              │
   │◀──────────────────────────────
   │  serverChanges=[变更结果]    │
   │  serverTime=xxx              │
   │                              │
   ▼  客户端合并                   ▼
   遍历 serverChanges:
   - upsert: 写入本地
   - delete: 从本地删除
```

#### 2.3.3 全量获取（首次同步/兜底）

```
GET /api/items?openid=xxx
响应: {
  code: 0,
  items: Item[]   -- 所有未删除的物品
}
说明: 客户端首次同步（lastSyncAt=0）时使用此接口
```

### 2.4 服务端路由总览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/user/register | 用户注册/确认 |
| POST | /api/items/sync | 增量同步 |
| GET | /api/items | 获取全量物品（首次/兜底） |
| GET | /health | 健康检查 |

### 2.5 服务端目录结构

```
api-server/
├── src/
│   ├── index.js          # 入口，启动HTTP服务
│   ├── db.js             # SQLite连接和初始化
│   └── routes/
│       ├── user.js       # /api/user/* 路由
│       └── item.js       # /api/items/* 路由
├── package.json
└── ecosystem.config.js   # PM2配置
```

---

## 三、客户端架构设计

### 3.1 分层架构

```
┌────────────────────────────────────────────────────────┐
│                      页面层                             │
│   成本页 / 添加页 / 洞察页 / 查看详情页                │
│   职责：UI渲染、用户交互、调用业务层                   │
└────────────────────────┬───────────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────────┐
│                    业务逻辑层                          │
│                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  ItemService │  │CostCalculator│  │SyncManager │  │
│  │  物品管理     │  │  成本计算    │  │  增量同步   │  │
│  └──────────────┘  └──────────────┘  └────────────┘  │
└────────────────────────┬───────────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────────┐
│                      数据层                            │
│  ┌──────────────────┐  ┌─────────────────────────────┐│
│  │   StorageService  │  │        ApiService          ││
│  │   本地存储        │  │        服务端API            ││
│  └──────────────────┘  └─────────────────────────────┘│
└────────────────────────────────────────────────────────┘
```

### 3.2 目录结构

```
miniprogram/
├── app.js                    # 应用入口
├── app.json
├── app.wxss
│
├── config/
│   └── env.js               # 环境配置（API地址）
│
├── services/
│   ├── storage.js           # 本地存储（StorageService）
│   ├── api.js               # 服务端API（ApiService）
│   ├── item.js              # 物品业务逻辑（ItemService）
│   ├── calculator.js        # 成本计算纯函数（CostCalculator）
│   └── sync.js              # 增量同步管理器（SyncManager）
│
├── stores/
│   └── app-store.js         # 全局状态管理（发布订阅模式）
│
├── utils/
│   ├── id.js                # ID生成
│   ├── date.js              # 日期计算
│   └── format.js             # 格式化
│
├── types/
│   └── item.js              # 物品类型定义（JSDoc）
│
├── pages/
│   ├── cost/                # 成本页（首页）
│   ├── add-cost/            # 添加成本页
│   ├── item-detail/         # 查看详情页
│   └── insight/             # 洞察页
│
└── components/              # 通用组件
    ├── item-card/
    ├── category-bar/
    └── cost-summary/
```

### 3.3 核心模块详细设计

#### 3.3.1 CostCalculator（成本计算层）

**设计原则**：纯函数，输入物品数组，输出所有派生指标。无副作用，不读写存储。

```javascript
// services/calculator.js

/**
 * 计算已使用天数（向上取整）
 */
function calcDaysUsed(purchaseDate) {
  const diff = Date.now() - new Date(purchaseDate + 'T00:00:00').getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return Math.max(1, days); // 当天购买也算1天
}

/**
 * 单个按天物品的每日成本
 */
function calcDailyCost(item) {
  if (item.status !== 'using' || item.unit !== 'day') return 0;
  const days = calcDaysUsed(item.purchaseDate);
  return (item.price + (item.otherFees || 0)) / days;
}

/**
 * 单个按次物品的每次成本（usedCount=0时返回null）
 */
function calcPerUseCost(item) {
  if (item.status !== 'using' || item.unit !== 'count') return null;
  if ((item.usedCount || 0) === 0) return null;
  return (item.price + (item.otherFees || 0)) / item.usedCount;
}

/**
 * 今日成本 = 所有使用中按天物品每日成本之和
 */
function calcTotalDailyCost(items) {
  return items.reduce((sum, item) => sum + (calcDailyCost(item) || 0), 0);
}

/**
 * 按次物品平均每次成本
 * avgCost: 所有按次物品总价之和 ÷ 所有按次物品已用次数之和
 * usedCount全为0时 avgCost=null
 */
function calcAveragePerUseCost(items) {
  const countItems = items.filter(i => i.status === 'using' && i.unit === 'count');
  if (!countItems.length) return null;
  const totalPrice = countItems.reduce((s, i) => s + i.price + (i.otherFees || 0), 0);
  const totalUsed = countItems.reduce((s, i) => s + (i.usedCount || 0), 0);
  if (totalUsed === 0) return { avgCost: null, count: countItems.length };
  return { avgCost: totalPrice / totalUsed, count: countItems.length };
}
```

#### 3.3.2 ItemService（物品管理层）

**设计原则**：所有物品操作通过ItemService，数据变更后自动记录到变更队列并触发增量同步。

```javascript
// services/item.js

// 内存中的物品列表
let _items = [];
// 变更队列（待同步的变更项）
let _changeQueue = [];
// 每次操作生成单调递增的序列号
let _itemSeq = 0;

// ---------- 数据访问 ----------

function getItems() {
  return [..._items];
}

function getItem(id) {
  return _items.find(i => i.id === id) || null;
}

// ---------- 变更记录 ----------

function _pushChange(type, item) {
  _changeQueue.push({
    seq: ++_itemSeq,
    type,       // 'upsert' | 'delete'
    item,        // upsert时是完整Item，delete时是 { id }
    timestamp: Date.now(),
  });
  SyncManager.onItemsChanged(_changeQueue);
}

// ---------- 物品操作 ----------

async function loadItems() {
  _items = await StorageService.get('items') || [];
  return _items;
}

async function saveItems() {
  await StorageService.set('items', _items);
}

async function addItem(itemData) {
  const now = Date.now();
  const item = {
    ...itemData,
    id: 'item_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
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

async function updateItem(id, updates) {
  const idx = _items.findIndex(i => i.id === id);
  if (idx === -1) return null;
  _items[idx] = { ..._items[idx], ...updates, updatedAt: Date.now() };
  await saveItems();
  _pushChange('upsert', _items[idx]);
  return _items[idx];
}

async function deleteItem(id) {
  _items = _items.filter(i => i.id !== id);
  await saveItems();
  _pushChange('delete', { id });
}

async function useOnce(id) {
  const item = _items.find(i => i.id === id);
  if (!item || item.unit !== 'count') return null;
  item.usedCount = (item.usedCount || 0) + 1;
  item.updatedAt = Date.now();
  await saveItems();
  _pushChange('upsert', item);
  return item;
}

// ---------- 服务端数据合并（同步完成后调用）----------

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
```

#### 3.3.3 SyncManager（增量同步管理层）

**设计原则**：管理变更队列和同步状态，自动增量同步，不做全量覆盖。

```javascript
// services/sync.js

let _lastSyncAt = 0;         // 上次同步成功的时间戳
let _isSyncing = false;     // 防止并发同步
let _pendingChanges = [];    // 待同步的变更队列副本
let _syncTimer = null;

function onItemsChanged(changeQueue) {
  // 变更入队后，延迟2秒触发同步（聚合变更，减少请求）
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => doSync(changeQueue), 2000);
}

async function doSync(changeQueue) {
  if (_isSyncing) return;
  if (!getOpenid()) return;
  if (!changeQueue || !changeQueue.length) return;

  _isSyncing = true;
  _pendingChanges = [...changeQueue];

  try {
    const res = await ApiService.sync({
      openid: getOpenid(),
      changes: _pendingChanges,
      lastSyncAt: _lastSyncAt,
    });

    if (res.code === 0) {
      // 合并服务端变更到本地
      ItemService.mergeServerChanges(res.serverChanges || []);
      _lastSyncAt = res.serverTime;
      await StorageService.set('lastSyncAt', _lastSyncAt);
      // 同步成功后清空已同步的变更
      _pendingChanges = [];
    }
  } catch (e) {
    console.error('[SyncManager] 同步失败', e);
  } finally {
    _isSyncing = false;
  }
}

async function doFullSync() {
  // 首次同步（全量拉取）
  if (_isSyncing) return;
  if (!getOpenid()) return;

  _isSyncing = true;
  try {
    const res = await ApiService.getItems(getOpenid());
    if (res.code === 0) {
      const items = (res.items || []).map(s => s.data);
      await StorageService.set('items', items);
      _items = items;
      _lastSyncAt = Date.now();
      await StorageService.set('lastSyncAt', _lastSyncAt);
    }
  } catch (e) {
    console.error('[SyncManager] 全量同步失败', e);
  } finally {
    _isSyncing = false;
  }
}

async function init() {
  _lastSyncAt = await StorageService.get('lastSyncAt') || 0;
  if (_lastSyncAt === 0) {
    await doFullSync();
  }
}
```

#### 3.3.4 ApiService（服务端通信层）

```javascript
// services/api.js

const BASE_URL = 'https://api.newmark.top';

async function request(path, data, method = 'POST') {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${path}`,
      method,
      data,
      timeout: 15000,
      success: (res) => {
        if (res.statusCode === 200 && res.data) resolve(res.data);
        else reject(new Error(`HTTP ${res.statusCode}`));
      },
      fail: (e) => reject(e),
    });
  });
}

async function registerUser(openid) {
  return request('/api/user/register', { openid });
}

async function syncItems(payload) {
  return request('/api/items/sync', payload);
}

async function getItems(openid) {
  return request(`/api/items?openid=${openid}`, {}, 'GET');
}
```

### 3.4 数据存储结构（Storage）

| Storage Key | 内容 | 说明 |
|------------|------|------|
| `yd_items` | Item[] | 物品列表 |
| `yd_categories` | Category[] | 用户自定义类别 |
| `yd_last_sync_at` | number | 上次同步时间戳 |
| `yd_sort_order` | string | 当前排序方式 |
| `yd_custom_order` | string[] | 拖拽排序的物品ID数组 |
| `yd_display_mode` | 'card' \| 'list' | 显示模式 |
| `yd_filter_status` | string | 状态筛选 |
| `yd_filter_category` | string | 类别筛选 |

---

## 四、数据模型

### 4.1 物品Item

```javascript
// types/item.js

/**
 * @typedef {Object} Item
 * @property {string}  id           - 唯一ID，格式: item_ + 时间戳36 + 随机6位
 * @property {string}  name         - 物品名称
 * @property {string}  [iconUrl]    - 图片URL
 * @property {string}  category     - 类别ID
 * @property {'using'|'discarded'|'sold'} status - 使用状态
 * @property {number}  price        - 物品总价（元）
 * @property {number}  [otherFees]  - 其他费用，默认0
 * @property {string}  purchaseDate - 购买日期，YYYY-MM-DD
 * @property {'day'|'count'} unit   - 计算单位
 * @property {number}  [usedCount]  - 已使用次数，按次物品，默认0
 * @property {number}  [sellPrice]  - 卖出价格，已卖出时填写
 * @property {string}  [sellDate]   - 卖出日期，YYYY-MM-DD
 * @property {string}  [note]      - 备注
 * @property {number}  customOrder  - 排序权重（时间戳）
 * @property {number}  createdAt    - 创建时间戳
 * @property {number}  updatedAt    - 更新时间戳
 */
```

### 4.2 变更单元Change

```javascript
// 增量同步的最小单位
/** @type {{ type: 'upsert', item: Item } | { type: 'delete', item: { id: string } }} */
```

---

## 五、路由与页面

| 路由 | 页面 | 说明 |
|------|------|------|
| /pages/cost/index | 成本页（首页） | TabBar首页 |
| /pages/add-cost/index | 添加成本页 | TabBar中间加号 |
| /pages/insight/index | 洞察页 | TabBar右 |
| /pages/item-detail/index | 查看详情页 | navigateTo进入 |

---

## 六、同步流程（完整时序）

```
首次打开小程序（lastSyncAt=0）
────────────────────────────────
app.onLaunch()
  └─ SyncManager.init()
       └─ doFullSync()          ← GET /api/items，全量拉取
            └─ 写入Storage
                 └─ 页面渲染

日常使用（lastSyncAt>0）
────────────────────────────────
用户添加/编辑/删除物品
  └─ ItemService.addItem() / updateItem() / deleteItem()
       └─ _pushChange()         ← 变更入队列
            └─ SyncManager.onItemsChanged()
                 └─ 2秒后 doSync()
                      └─ POST /api/items/sync
                           changes=[本次所有变更]
                           lastSyncAt=上次同步时间
                           │
                           ├─ 服务端处理变更（upsert/delete）
                           ├─ 服务端返回 serverChanges（服务端在 lastSyncAt 后的变更）
                           └─ 客户端合并 serverChanges
```

---

## 七、模块扩展指引

### 7.1 新增物品属性

1. `types/item.js` — JSDoc新增字段
2. `services/item.js` — `addItem()` 默认值
3. `pages/add-cost/` — 表单新增输入项
4. `pages/item-detail/` — 详情页展示

### 7.2 新增页面

1. `app.json` 注册路由
2. `pages/` 下创建目录（js/wxml/wxss/json）
3. 页面JS中调用 ItemService / CostCalculator

### 7.3 服务端新增接口

1. `server/src/routes/` — 添加路由
2. `server/src/index.js` — 注册路由
3. `services/api.js` — 客户端添加请求函数
4. `services/sync.js` — 同步管理器按需更新

---

## 八、技术选型汇总

| 层级 | 技术 |
|------|------|
| 客户端框架 | 微信小程序原生 |
| 客户端架构 | 分层模块化（数据层/业务层/页面层） |
| 客户端状态 | 简单响应式Store（发布订阅模式） |
| 客户端存储 | wx.setStorage |
| 服务端框架 | Express |
| 服务端数据库 | SQLite（better-sqlite3） |
| 服务端部署 | PM2（端口3012） |
| 图表 | wx-charts |
| 图片存储 | 微信云存储（待定） |
