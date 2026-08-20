/**
 * image-compress.js
 * 微信小程序图片压缩工具
 * 优先使用 wx.compressImage，质量不足时用 canvas 二次精修
 */

const MAIN_MAX_SIDE = 1200;
const THUMB_MAX_SIDE = 400; // 缩略图用 400px，后续展示层再缩放
const MAIN_QUALITY = 80;    // wx.compressImage quality 0~100
const THUMB_QUALITY = 70;

/**
 * 获取图片尺寸
 */
function getImageInfo(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({ src, success: resolve, fail: reject });
  });
}

/**
 * 使用 canvas 精修压缩（传入已存在的 canvas context）
 * @param {string} filePath
 * @param {number} targetW
 * @param {number} targetH
 * @param {number} quality  0~1
 * @param {object} canvasNode  canvas node 实例
 * @returns {Promise<{tempFilePath: string, width: number, height: number}>}
 */
function canvas精修(filePath, targetW, targetH, quality, canvasNode) {
  return new Promise((resolve, reject) => {
    const ctx = canvasNode.getContext('2d');
    canvasNode.width = targetW;
    canvasNode.height = targetH;

    const img = canvasNode.createImage();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, targetW, targetH);
      wx.nextTick(() => {
        wx.canvasToTempFilePath({
          canvas: canvasNode,
          quality,
          success: (r) => resolve({ tempFilePath: r.tempFilePath, width: targetW, height: targetH }),
          fail: () => reject(new Error('canvasToTempFilePath failed')),
        });
      });
    };
    img.onerror = () => reject(new Error('createImage onerror'));
    img.src = filePath;
  });
}

/**
 * 压缩主图（1200px）
 * @param {string} filePath
 * @param {object} context  组件实例（传入 this）
 */
async function compressMain(filePath, context) {
  try {
    // 优先尝试 wx.compressImage（成功率最高）
    const res = await new Promise((resolve, reject) => {
      wx.compressImage({
        src: filePath,
        quality: MAIN_QUALITY,
        success: (r) => r.tempFilePath ? resolve(r) : reject(new Error('compressImage null')),
        fail: reject,
      });
    });

    // 获取实际尺寸
    const info = await getImageInfo(res.tempFilePath);
    return { tempFilePath: res.tempFilePath, width: info.width, height: info.height };
  } catch (_) {
    // wx.compressImage 失败，用 canvas 精修
    return canvas精修WithNewCanvas(filePath, MAIN_MAX_SIDE, 0.85, context);
  }
}

/**
 * 压缩缩略图（400px）
 * @param {string} filePath
 * @param {object} context  组件实例（传入 this）
 */
async function compressThumb(filePath, context) {
  try {
    const res = await new Promise((resolve, reject) => {
      wx.compressImage({
        src: filePath,
        quality: THUMB_QUALITY,
        success: (r) => r.tempFilePath ? resolve(r) : reject(new Error('compressImage null')),
        fail: reject,
      });
    });

    const info = await getImageInfo(res.tempFilePath);
    return { tempFilePath: res.tempFilePath, width: info.width, height: info.height };
  } catch (_) {
    return canvas精修WithNewCanvas(filePath, THUMB_MAX_SIDE, 0.75, context);
  }
}

/**
 * 创建新的离屏 canvas 做精修（不依赖 wxml 里的 canvas）
 * 使用 WXML canvas 节点
 */
function canvas精修WithNewCanvas(filePath, maxSide, quality, context) {
  return new Promise((resolve, reject) => {
    const canvasId = maxSide <= 400 ? 'compress-thumb-canvas' : 'compress-canvas';
    const query = wx.createSelectorQuery().in(context);
    query.select(`#${canvasId}`)
      .node((res) => {
        if (!res || !res.node) {
          // canvas 节点不可用，直接返回原图路径（让上传继续）
          console.warn('[image-compress] canvas not ready, using original');
          wx.getImageInfo({
            src: filePath,
            success: (info) => resolve({ tempFilePath: filePath, width: info.width, height: info.height }),
            fail: () => reject(new Error('getImageInfo failed')),
          });
          return;
        }
        canvas精修(filePath, maxSide, maxSide, quality, res.node)
          .then(resolve)
          .catch(reject);
      })
      .exec();
  });
}

module.exports = {
  compressMain,
  compressThumb,
};
