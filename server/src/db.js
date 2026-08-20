'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = '/opt/yongdu/api-server';
const DB_PATH = path.join(DB_DIR, 'yongdu.db');

// Ensure directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    openid TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    openid TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    deleted_at INTEGER,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_items_openid ON items(openid);
  CREATE INDEX IF NOT EXISTS idx_items_updated_at ON items(updated_at);

  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    width INTEGER,
    height INTEGER,
    thumb_url TEXT,
    created_at INTEGER
  );
`);

module.exports = db;
