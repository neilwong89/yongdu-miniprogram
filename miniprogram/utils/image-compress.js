/**
 * image-compress.js
 * 微信小程序图片压缩工具（基于 Node canvas API）
 * 使用 type="2d" 的离屏 canvas 压缩图片
 */

const MAIN_MAX_SIDE = 1200;
const THUMB_MAX_SIDE = 200;
const MAIN_QUALITY = 0.85;
const THUMB_QUALITY = 0.75;

/**
 * 用 canvas 压缩图片
 * @param {string} filePath  原始文件路径（wx.chooseImage 返回的临时路径）
 * @param {number} maxSide  最大边（px）
 * @param {number} quality  JPEG 质量 0~1
 * @param {string} canvasId  wxml 中 canvas 的 id
 * @returns {Promise<{tempFilePath: string, width: number, height: number}>}
 */
function compressWithCanvas(filePath, maxSide, quality, canvasId, context) {
  return new Promise((resolve, reject) => {
    const query = wx.createSelectorQuery().in(context);
    query.select(`#${canvasId}`)
      .node((res) => {
        if (!res || !res.node) {
          reject(new Error(`canvas ${canvasId} not found`));
          return;
        }
        const canvas = res.node;
        const ctx = canvas.getContext('2d');

        // 先获取图片信息以计算目标尺寸
        wx.getImageInfo({
          src: filePath,
          success: (imgInfo) => {
            const { width, height } = imgInfo;
            let targetW, targetH;

            if (width >= height) {
              targetW = Math.min(width, maxSide);
              targetH = Math.round((height * maxSide) / width);
            } else {
              targetH = Math.min(height, maxSide);
              targetW = Math.round((width * maxSide) / height);
            }

            // 设置 canvas 尺寸
            canvas.width = targetW;
            canvas.height = targetH;

            // 绘制图片
            const img = canvas.createImage();
            img.onload = () => {
              ctx.drawImage(img, 0, 0, targetW, targetH);
              wx.canvasToTempFilePath({
                canvas,
                quality,
                success: (result) => {
                  resolve({
                    tempFilePath: result.tempFilePath,
                    width: targetW,
                    height: targetH
                  });
                },
                fail: reject
              });
            };
            img.onerror = reject;
            img.src = filePath;
          },
          fail: reject
        });
      })
      .exec();
  });
}

/**
 * 压缩主图（1200px，85%）
 * @param {string} filePath
 * @param {object} context  组件实例（需传入 this）
 */
async function compressMain(filePath, context) {
  return compressWithCanvas(filePath, MAIN_MAX_SIDE, MAIN_QUALITY, 'compress-canvas', context);
}

/**
 * 压缩缩略图（200px，75%）
 * @param {string} filePath
 * @param {object} context  组件实例（需传入 this）
 */
async function compressThumb(filePath, context) {
  return compressWithCanvas(filePath, THUMB_MAX_SIDE, THUMB_QUALITY, 'compress-thumb-canvas', context);
}

module.exports = {
  compressMain,
  compressThumb
};
