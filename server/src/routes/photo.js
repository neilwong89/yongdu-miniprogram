'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');

const router = express.Router();
const UPLOAD_DIR = '/opt/yongdu/api-server/uploads/photos';

// Ensure upload dir exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// POST /api/yongdu/photo/upload
router.post('/upload', async (req, res) => {
  const { formidable } = require('formidable');
  const form = formidable({
    maxFileSize: 10 * 1024 * 1024,
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('[photo] parse error:', err);
      return res.status(500).json({ code: 1, message: 'upload failed' });
    }

    const photo_id = Array.isArray(fields.photo_id) ? fields.photo_id[0] : fields.photo_id;
    const width = parseInt(Array.isArray(fields.width) ? fields.width[0] : fields.width) || 0;
    const height = parseInt(Array.isArray(fields.height) ? fields.height[0] : fields.height) || 0;

    if (!photo_id) {
      return res.status(400).json({ code: 1, message: 'photo_id is required' });
    }

    const rawMain = Array.isArray(files.main) ? files.main[0] : files.main;
    const rawThumb = Array.isArray(files.thumb) ? files.thumb[0] : files.thumb;

    // Support split upload: main-only, thumb-only, or both in one request
    if (!rawMain && !rawThumb) {
      return res.status(400).json({ code: 1, message: 'main or thumb file is required' });
    }

    // Determine extensions
    const mainExt = rawMain
      ? (path.extname(rawMain.originalFilename || '.jpg') || '.jpg')
      : '.jpg';

    const mainPath = path.join(UPLOAD_DIR, `${photo_id}_main${mainExt}`);
    const thumbPath = path.join(UPLOAD_DIR, `${photo_id}_thumb.jpg`);

    try {
      if (rawMain) {
        fs.copyFileSync(rawMain.filepath, mainPath);
        try { fs.unlinkSync(rawMain.filepath); } catch (_) {}
      }
      if (rawThumb) {
        fs.copyFileSync(rawThumb.filepath, thumbPath);
        try { fs.unlinkSync(rawThumb.filepath); } catch (_) {}
      }

      // Upsert: create if not exists, update if exists
      const existing = db.prepare('SELECT id FROM photos WHERE id = ?').get(photo_id);
      if (existing) {
        const updates = [];
        const vals = [];
        if (rawMain) { updates.push('width = ?'); vals.push(width); }
        if (rawThumb) { updates.push('thumb_url = ?'); vals.push(`/uploads/photos/${photo_id}_thumb.jpg`); }
        updates.push('created_at = ?');
        vals.push(Math.floor(Date.now() / 1000));
        vals.push(photo_id);
        db.prepare(`UPDATE photos SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
      } else {
        db.prepare(`
          INSERT INTO photos (id, width, height, thumb_url, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          photo_id,
          rawMain ? width : 0,
          rawMain ? height : 0,
          rawThumb ? `/uploads/photos/${photo_id}_thumb.jpg` : null,
          Math.floor(Date.now() / 1000)
        );
      }

      res.json({
        code: 0,
        photo_id,
        url: `/uploads/photos/${photo_id}_main${mainExt}`,
        thumb_url: rawThumb ? `/uploads/photos/${photo_id}_thumb.jpg` : null,
      });
    } catch (e) {
      console.error('[photo] save error:', e);
      if (rawMain) { try { fs.unlinkSync(mainPath); } catch (_) {} }
      if (rawThumb) { try { fs.unlinkSync(thumbPath); } catch (_) {} }
      res.status(500).json({ code: 1, message: 'save failed' });
    }
  });
});

module.exports = router;
