'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/items?openid=xxx
router.get('/', (req, res) => {
  const { openid } = req.query;

  if (!openid || typeof openid !== 'string') {
    return res.status(400).json({ code: 1, message: 'openid is required' });
  }

  const items = db.prepare(`
    SELECT id, data, updated_at
    FROM items
    WHERE openid = ? AND deleted_at = 0
    ORDER BY updated_at DESC
  `).all(openid);

  res.json({ code: 0, items });
});

// POST /api/items/sync
router.post('/sync', (req, res) => {
  const { openid, changes = [], lastSyncAt = 0 } = req.body;

  if (!openid || typeof openid !== 'string') {
    return res.status(400).json({ code: 1, message: 'openid is required' });
  }

  const now = Math.floor(Date.now() / 1000);
  const serverTime = now * 1000; // ms

  const upsertStmt = db.prepare(`
    INSERT INTO items (id, openid, data, updated_at, created_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, 0)
    ON CONFLICT(id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at,
      deleted_at = 0
  `);

  const deleteStmt = db.prepare(`
    UPDATE items SET deleted_at = ? WHERE id = ? AND openid = ?
  `);

  const runTransaction = db.transaction(() => {
    for (const change of changes) {
      if (change.type === 'upsert' && change.item) {
        const item = change.item;
        const itemId = item.id;
        if (!itemId) continue;
        const dataStr = JSON.stringify(item); // change.item 本身就是完整Item对象
        upsertStmt.run(itemId, openid, dataStr, now, now);
      } else if (change.type === 'delete' && change.item && change.item.id) {
        deleteStmt.run(now, change.item.id, openid);
      }
    }
  });

  runTransaction();

  // Return server changes since lastSyncAt
  const serverChanges = db.prepare(`
    SELECT id, data, deleted_at, updated_at, created_at
    FROM items
    WHERE openid = ? AND updated_at > ?
    ORDER BY updated_at ASC
  `).all(openid, lastSyncAt / 1000); // convert ms to seconds

  const formattedChanges = serverChanges.map(row => {
    let item = row.data;
    if (typeof item === 'string') {
      try { item = JSON.parse(item); } catch { item = {}; }
    }
    return {
      id: row.id,
      item,
      type: row.deleted_at == 0 ? 'upsert' : 'delete',
      deleted_at: row.deleted_at,
      updated_at: row.updated_at * 1000,
      created_at: row.created_at * 1000,
    };
  });

  res.json({ code: 0, serverChanges: formattedChanges, serverTime });
});

module.exports = router;
