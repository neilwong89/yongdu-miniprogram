# 用度 · 项目设计文档

**创建时间**: 2026-08-19
**最后更新**: 2026-08-21
**AppID**: wx2830c3171fc2042b

---

## 凭证信息

| 项目 | 值 |
|------|-----|
| AppID | wx2830c3171fc2042b |
| 服务器IP | 8.134.191.247 |
| API端口 | 3012 |
| API地址 | https://api.newmark.top |
| GitHub | neilwong89/yongdu-miniprogram |

---

## 架构

- **客户端**: 微信小程序原生，模块化分层设计（数据层/业务层/页面层）
- **服务端**: Node.js + Express + SQLite（增量同步）
- **存储**: 本地 Storage（小程序端）+ 服务端 SQLite 双写
- **同步**: 增量同步，增量单元（upsert/delete）

## 服务端

- 端口: 3012
- 部署路径: /opt/yongdu/api-server/
- 数据库: /opt/yongdu/api-server/yongdu.db

## 客户端目录结构

```
miniprogram/
├── services/       # 业务逻辑层（ItemService 等）
├── stores/         # 状态管理（AppStore）
├── utils/          # 工具函数
├── types/          # 类型定义
├── components/     # 通用组件
│   └── add-cost-panel/   # 物品录入/编辑面板
└── pages/          # 页面（cost 列表、item-detail 等）
```

---

## 核心模块

### AppStore（状态管理）

纯内存状态管理器（发布订阅模式），文件：`stores/app-store.js`。

**状态字段**:
- `items`: 物品列表
- `categories`: 分类列表（**含自定义分类，含本地持久化**）
- `filterStatus`: 过滤状态
- `filterCategory`: 过滤分类
- `sortOrder`: 排序
- `displayMode`: 显示模式

**本地持久化规则**:
- `categories` 变更时自动写入 `wx.setStorageSync('categories')`
- 小程序启动时从 `wx.getStorageSync('categories')` 读取并初始化
- 自定义分类**不上传服务器**，纯本地存储

### 自定义分类

**存储位置**: `wx.setStorageSync('categories')`（纯本地，不上传服务器）

**分类来源**:
- 预设分类（硬编码，`PRESET_CATEGORIES` 常量）：数码设备、日用品、食品饮料、服饰鞋包、图书文具、运动户外、家居家电、美妆护肤、宠物用品、玩具手办、其他
- 自定义分类：用户新增，存本地

**添加流程**:
1. 点击「自定义类别」按钮 → 弹出输入弹窗
2. 输入名称（最多10字）→ 确定
3. 生成 `id: 'custom_' + Date.now()`，写入 AppStore → 自动同步到本地存储

**删除流程**:
1. 展开分类网格 → 长按任意自定义分类
2. 弹出确认框 → 确定后从 AppStore 删除 → 同步更新本地存储
3. 若删除的是当前选中分类，自动切回默认分类
4. 预设分类和「自定义类别」按钮本身不可删除

### add-cost-panel 组件

**文件**: `components/add-cost-panel/`

**功能**: 物品录入/编辑浮层面板

**类别选择器 UI**:
- 横向滚动条（absoute 浮层）+ 网格展开区（文档流）
- 滚动条 `scroll-into-view="cat_{{currentCategoryId}}"` 实现选中项可见
- 展开时滚动条渐隐（opacity + pointer-events），网格延迟展开

**弹窗**:
- 自定义类别输入弹窗：opacity + scale 渐显/渐隐（0.2s ease-out）
- 聚焦延迟 200ms 避免 placeholder 抖动
- 标题下方有提示文字「长按已添加的自定义类别可删除」

---

## 技术细节

### scroll-view 滚动居中

使用 `scroll-into-view` 实现，避免手动 `boundingClientRect + scrollLeft` 计算。

- scroll-view 绑定 `scroll-into-view="cat_{{currentCategoryId}}"`
- `currentCategoryId` 在 data 中管理
- `_scrollCategoryToCenter(catId)` 只需 `this.setData({ currentCategoryId: catId })`
- `scroll-into-view` 和 `scroll-left` 不能同时用（冲突）

### boundingClientRect 单位说明

移动端 webview 中 `boundingClientRect` 返回 **CSS 像素**（与 `windowWidth`、`scrollLeft` 单位一致），**不需要除以 pixelRatio**。

### AppStore.set 自动持久化

```js
set(updates) {
  // 更新状态...
  // categories 变更时自动同步到本地存储
  if (this._state.categories !== prev.categories) {
    wx.setStorageSync('categories', this._state.categories);
  }
  this.notify(prev);
}
```

---

## 设计文档

- PRD: docs/PRD.md
- 技术设计: docs/TECH_DESIGN_v2.0_final.md
