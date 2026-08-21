'use strict';

const express = require('express');
const path = require('path');
const http = require('http');

// Initialize database (creates tables)
require('./db');

const userRouter = require('./routes/user');
const itemRouter = require('./routes/item');
const photoRouter = require('./routes/photo');

const app = express();
const PORT = 3012;

// Middleware
app.use(express.json({ limit: '10mb' }));

// Serve uploaded photos as static files
app.use('/uploads', express.static('/opt/yongdu/api-server/uploads'));

// Health check
app.get('/api/yongdu/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'yongdu-api',
    time: Date.now()
  });
});

// 微信 code2session（委托给 wx-auth 服务）
app.get('/api/code2session', (req, res) => {
  const { code } = req.query;
  if (!code || typeof code !== 'string') {
    res.status(400).json({ code: 1, message: 'code is required' });
    return;
  }
  http.get(`http://127.0.0.1:3014/api/code2session?code=${code}`, (apiRes) => {
    let data = '';
    apiRes.on('data', chunk => data += chunk);
    apiRes.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) {
          res.status(400).json({ code: 1, message: parsed.error });
        } else {
          res.json({ openid: parsed.openid });
        }
      } catch {
        res.status(500).json({ code: 1, message: '解析响应失败' });
      }
    });
  }).on('error', () => {
    res.status(502).json({ code: 1, message: 'wx-auth 服务不可用' });
  });
});

// Root health (kept for backward compat)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'yongdu-api', time: Date.now() });
});

// API routes
app.use('/api/yongdu/user', userRouter);
app.use('/api/yongdu/items', itemRouter);
app.use('/api/yongdu/photo', photoRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ code: 404, message: 'not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ code: 500, message: 'internal server error' });
});

app.listen(PORT, () => {
  console.log(`[yongdu-api] listening on port ${PORT}`);
});

module.exports = app;
