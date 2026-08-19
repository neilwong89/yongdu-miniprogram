# 用度 · 项目设计文档

**创建时间**: 2026-08-19
**AppID**: wx2830c3171fc2042b（复用牛马桌游助理名额）
**AppSecret**: abbbce52afa76db989e4412653f39b7d

## 凭证信息

| 项目 | 值 |
|------|-----|
| AppID | wx2830c3171fc2042b |
| AppSecret | abbbce52afa76db989e4412653f39b7d |
| 服务器IP | 8.134.191.247 |
| API端口 | 3012 |
| API地址 | https://api.newmark.top |
| GitHub | neilwong89/yongdu-miniprogram（待创建）|

## 架构

- **客户端**: 微信小程序原生，模块化分层设计（数据层/业务层/页面层）
- **服务端**: Node.js + Express + SQLite（增量同步）
- **存储**: 本地Storage + 服务端SQLite双写
- **同步**: 增量同步，增量单元（upsert/delete）

## 服务端

- 端口: 3012
- 部署路径: /opt/yongdu/api-server/
- 数据库: /opt/yongdu/api-server/yongdu.db

## 客户端目录结构

```
miniprogram/
├── services/     # 业务逻辑层
├── stores/       # 状态管理
├── utils/        # 工具函数
├── types/        # 类型定义
├── components/   # 通用组件
└── pages/        # 页面
```

## 设计文档

- PRD: docs/PRD.md
- 技术设计: docs/TECH_DESIGN_v2.0_final.md
