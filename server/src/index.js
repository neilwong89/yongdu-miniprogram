'use strict';

const express = require('express');
const path = require('path');

// Initialize database (creates tables)
require('./db');

const userRouter = require('./routes/user');
const itemRouter = require('./routes/item');

const app = express();
const PORT = 3012;

// Middleware
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/yongdu/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'yongdu-api',
    time: Date.now()
  });
});

// Root health (kept for backward compat)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'yongdu-api', time: Date.now() });
});

// API routes
app.use('/api/yongdu/user', userRouter);
app.use('/api/yongdu/items', itemRouter);

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
