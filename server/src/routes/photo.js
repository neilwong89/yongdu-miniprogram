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

    if (!rawMain || !rawThumb) {
      return res.status(400).json({ code: 1, message: 'main and thumb files are required' });
    }

    // Determine extension from original filename
    const mainExt = path.extname(rawMain.originalFilename || '.jpg') || '.jpg';
    const mainPath = path.join(UPLOAD_DIR, `${photo_id}_main${mainExt}`);
    const thumbPath = path.join(UPLOAD_DIR, `${photo_id}_thumb.jpg`);

    try {
      // Move files to final destination
      fs.copyFileSync(rawMain.filepath, mainPath);
      fs.copyFileSync(rawThumb.filepath, thumbPath);
      // Clean up tmp files
      try { fs.unlinkSync(rawMain.filepath); } catch (_) {}
      try { fs.unlinkSync(rawThumb.filepath); } catch (_) {}

      // Write to database
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO photos (id, width, height, created_at)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(photo_id, width, height, Math.floor(Date.now() / 1000));

      res.json({
        code: 0,
        photo_id,
        url: `/uploads/photos/${photo_id}_main${mainExt}`,
        thumb_url: `/uploads/photos/${photo_id}_thumb.jpg`
      });
    } catch (e) {
      console.error('[photo] save error:', e);
      try { fs.unlinkSync(mainPath); } catch (_) {}
      try { fs.unlinkSync(thumbPath); } catch (_) {}
      res.status(500).json({ code: 1, message: 'save failed' });
    }
  });
});

module.exports = router;
