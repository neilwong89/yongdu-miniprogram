/**
 * photo-cache.js
 * 本地图片缓存工具：缩略图（列表用）和大图（详情用）分开存储
 * - 缩略图：{photoId}.jpg（200px，由客户端压缩上传时保存）
 * - 大图：{photoId}_main.jpg（1200px，列表页后台下载，或详情页按需下载）
 */

const API_BASE = 'https://api.newmark.top';
const CACHE_DIR = `${wx.env.USER_DATA_PATH}/photo_cache`;
const MAX_CACHE_COUNT = 100;

// Ensure cache dir exists
function ensureCacheDir() {
  const fs = wx.getFileSystemManager();
  try {
    fs.accessSync(CACHE_DIR);
  } catch (_) {
    try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (_) {}
  }
}

/**
 * 获取本地缩略图路径（同步，列表页用）
 * @param {string} photoId
 * @returns {string|null} 本地路径，不存在返回 null
 */
function getLocalPath(photoId) {
  const path = `${CACHE_DIR}/${photoId}.jpg`;
  try {
    wx.getFileSystemManager().accessSync(path);
    return path;
  } catch (_) {
    return null;
  }
}

/**
 * 获取本地大图路径（同步，详情页用）
 * 优先返回大图，本地没有则返回缩略图（向下兼容旧缓存）
 * @param {string} photoId
 * @returns {string|null} 本地大图路径，没有则返回缩略图路径，均不存在返回 null
 */
function getMainImageLocalPath(photoId) {
  // 优先检查大图
  const mainPath = `${CACHE_DIR}/${photoId}_main.jpg`;
  try {
    wx.getFileSystemManager().accessSync(mainPath);
    return mainPath;
  } catch (_) {
    // 大图没有，返回缩略图（向下兼容）
    return getLocalPath(photoId);
  }
}

/**
 * 下载并缓存缩略图（供列表页后台预加载用）
 * @param {string} photoId
 * @param {string} thumbUrl  相对路径，如 /uploads/photos/xxx_thumb.jpg
 * @returns {Promise<string>} 本地缓存路径
 */
function downloadAndCache(photoId, thumbUrl) {
  return new Promise((resolve, reject) => {
    const localPath = getLocalPath(photoId);
    if (localPath) {
      resolve(localPath);
      return;
    }

    ensureCacheDir();
    const destPath = `${CACHE_DIR}/${photoId}.jpg`;
    const url = thumbUrl.startsWith('http') ? thumbUrl : API_BASE + thumbUrl;

    wx.downloadFile({
      url,
      filePath: destPath,
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.filePath);
        } else {
          reject(new Error(`download failed: ${res.statusCode}`));
        }
      },
      fail: (err) => {
        console.error('[photo-cache] download failed:', err);
        reject(err);
      }
    });
  });
}

/**
 * 下载并缓存大图（供详情页用）
 * @param {string} photoId
 * @param {string} mainUrl  相对路径，如 /uploads/photos/xxx_main.jpg
 * @returns {Promise<string>} 本地大图缓存路径
 */
function downloadAndCacheMain(photoId, mainUrl) {
  return new Promise((resolve, reject) => {
    // 本地已有大图直接返回
    const mainPath = `${CACHE_DIR}/${photoId}_main.jpg`;
    try {
      wx.getFileSystemManager().accessSync(mainPath);
      resolve(mainPath);
      return;
    } catch (_) {
      // 继续下载
    }

    ensureCacheDir();
    const url = mainUrl.startsWith('http') ? mainUrl : API_BASE + mainUrl;

    wx.downloadFile({
      url,
      filePath: mainPath,
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.filePath);
        } else {
          reject(new Error(`download main failed: ${res.statusCode}`));
        }
      },
      fail: (err) => {
        console.error('[photo-cache] download main failed:', err);
        reject(err);
      }
    });
  });
}

/**
 * 保存本地缩略图（由客户端压缩后直接调用此方法保存）
 * @param {string} photoId
 * @param {string} localTempFilePath  压缩后的临时文件路径
 * @returns {Promise<string>} 最终保存的本地路径
 */
function saveLocalThumb(photoId, localTempFilePath) {
  return new Promise((resolve, reject) => {
    ensureCacheDir();
    const destPath = `${CACHE_DIR}/${photoId}.jpg`;
    const fs = wx.getFileSystemManager();

    fs.saveFile({
      tempFilePath: localTempFilePath,
      filePath: destPath,
      success: (res) => {
        resolve(res.savedFilePath);
      },
      fail: (err) => {
        console.error('[photo-cache] save failed:', err);
        reject(err);
      }
    });
  });
}

/**
 * LRU 清理：缓存超过 MAX_CACHE_COUNT 时删除最旧的文件
 * 调用时机：saveLocalThumb 之后
 */
function pruneCache() {
  try {
    const fs = wx.getFileSystemManager();
    const files = fs.readdirSync(CACHE_DIR);
    if (files.length <= MAX_CACHE_COUNT) return;

    // Read file stats to get modification time
    const fileInfos = files
      .map(f => {
        try {
          const stat = fs.statSync(`${CACHE_DIR}/${f}`);
          return { name: f, mtime: stat.mtime.getTime() };
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.mtime - b.mtime);

    const toDelete = fileInfos.slice(0, files.length - MAX_CACHE_COUNT);
    for (const info of toDelete) {
      try {
        fs.unlinkSync(`${CACHE_DIR}/${info.name}`);
      } catch (_) {}
    }
  } catch (_) {}
}

/**
 * 获取展示用的图片路径（本地优先，本地没有则下载）
 * @param {string|null} photoId
 * @param {string|null} thumbUrl
 * @returns {Promise<string|null>} 返回本地路径或服务器 URL
 */
async function getDisplayPath(photoId, thumbUrl) {
  if (!photoId) return null;

  // 优先读本地
  const local = getLocalPath(photoId);
  if (local) return local;

  // 本地没有，下载
  if (thumbUrl) {
    try {
      const path = await downloadAndCache(photoId, thumbUrl);
      return path;
    } catch (_) {
      // 下载失败，返回服务器 URL
      return thumbUrl.startsWith('http') ? thumbUrl : API_BASE + thumbUrl;
    }
  }

  return null;
}

module.exports = {
  getLocalPath,
  getMainImageLocalPath,
  saveLocalThumb,
  downloadAndCache,
  downloadAndCacheMain,
  pruneCache,
  getDisplayPath
};
