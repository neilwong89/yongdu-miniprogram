#!/bin/bash
# 构建小程序开发版
# 用法：./build.sh

set -e

cd "$(dirname "$0")"
echo "[Build] 小程序构建开始..."

# 清理并重建 dist（纯原生代码，直接复制到 dist）
rm -rf dist
mkdir -p dist

echo "[Build] 复制文件到 dist..."
cp -r pages components services stores utils types config subpackages custom-tab-bar fonts constants dist/
cp app.js app.json app.wxss sitemap.json project.config.json dist/

echo "[Build] 完成，输出目录：dist/"
echo "[Build] 下一步：node upload-dev.js 上传开发版"
