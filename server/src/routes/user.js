'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

// POST /api/user/register
router.post('/register', (req, res) => {
  const { openid } = req.body;

  if (!openid || typeof openid !== 'string') {
    return res.status(400).json({ code: 1, message: 'openid is required' });
  }

  const now = Math.floor(Date.now() / 1000);

  const stmt = db.prepare(`
    INSERT INTO users (openid, created_at, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(openid) DO UPDATE SET updated_at = excluded.updated_at
  `);

  stmt.run(openid, now, now);

  res.json({ code: 0, message: 'ok' });
});

module.exports = router;
