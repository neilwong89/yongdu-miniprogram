/**
 * upload-dev.js — 小程序开发版上传（miniprogram-ci）
 * 用法：node upload-dev.js
 *
 * 前置条件：
 *   1. npm i -g miniprogram-ci
 *   2. 在 project.config.json 同目录下放 project.config.json.local，内容：
 *      { "privateKeyPath": "./apiclient_key.pem" }
 *   3. apiclient_key.pem 从微信公众平台后台「开发」→「开发设置」→「小程序代码上传密钥」下载
 */

const path = require('path');
const fs = require('fs');

// 动态 import（兼容 local 安装 + 全局安装）
let upload;
try {
  upload = require('miniprogram-ci');
} catch (e) {
  // 尝试全局路径
  const globalPath = '/root/.nvm/versions/node/v22.22.1/lib/node_modules/miniprogram-ci';
  try {
    upload = require(globalPath);
  } catch (e2) {
    console.error('❌  miniprogram-ci 未安装，请运行：npm i -g miniprogram-ci');
    process.exit(1);
  }
}

async function main() {
  const projectRoot = path.resolve(__dirname, '.');
  const configPath = path.join(projectRoot, 'project.config.json');
  const localConfigPath = path.join(projectRoot, 'project.config.json.local');

  if (!fs.existsSync(configPath)) {
    console.error('❌  project.config.json 不存在');
    process.exit(1);
  }

  let privateKeyPath = null;
  if (fs.existsSync(localConfigPath)) {
    try {
      const localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
      privateKeyPath = localConfig.privateKeyPath || null;
    } catch (e) { /* 忽略 */ }
  }

  if (!privateKeyPath) {
    console.error('⚠️  未找到私钥配置，请创建 project.config.json.local：');
    console.error('   { "privateKeyPath": "./apiclient_key.pem" }');
    console.error('   私钥从微信公众平台 → 开发设置 → 小程序代码上传密钥 获取');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const version = process.env.VERSION || `${new Date().getFullYear()}.${new Date().getMonth()+1}.${new Date().getDate()}`;
  const desc = process.env.DESC || `开发版上传 ${new Date().toLocaleString('zh-CN')}`;

  console.log('📦  准备上传...');
  console.log(`   appid:    ${config.appid}`);
  console.log(`   版本:     ${version}`);
  console.log(`   描述:     ${desc}`);

  try {
    const result = await upload.upload({
      project: new upload.Project({
        appid: config.appid,
        type: 'miniProgram',
        projectPath: projectRoot,
        privateKeyPath: path.resolve(projectRoot, privateKeyPath),
        ignores: ['node_modules/**', 'src/**', 'scripts/**', '*.md', 'docs/**', 'server/**', 'subpackages/**'],
      }),
      version,
      desc,
      setting: {
        es6: true,
        minifyWXSS: true,
        minifyWXML: true,
        minify: true,
      },
      onProgressUpdate: (progress) => {
        if (progress.status === 'building') {
          process.stdout.write(`\r   编译中... ${progress.done}/${progress.total}`);
        } else if (progress.status === 'uploading') {
          process.stdout.write(`\r   上传中... ${progress.done}/${progress.total}`);
        }
      },
    });

    console.log('\n✅  上传成功！');
    console.log(`   提示：等待体验版 URL 生成（预计 1-2 分钟）`);
    console.log(`   版本 ${version} 已提交审核`);
  } catch (err) {
    console.error('\n❌  上传失败:', err.message);
    if (err.message.includes('401')) {
      console.error('   原因：私钥不匹配或未在微信公众平台配置');
    } else if (err.message.includes('40013')) {
      console.error('   原因：appid 错误，检查 project.config.json 中的 appid');
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('❌  脚本异常:', e.message);
  process.exit(1);
});
