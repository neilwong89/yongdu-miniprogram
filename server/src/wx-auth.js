/**
 * wx-auth.js — 微信 code2session 独立服务
 * 用途：给 yongdu-api 和其他内部服务统一换取 openid
 * 端口：3014
 * 依赖：Node.js 内置 https 模块
 */

const https = require('https');

// ── 配置 ───────────────────────────────────────────────────────────────────
const PORT = 3014;
const WX_APP_ID = 'wx2830c3171fc2042b';
const WX_APP_SECRET = 'abbbce52afa76db989e4412653f39b7d';

// ── 日志 ───────────────────────────────────────────────────────────────────
function log(...args) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}]`, ...args);
}
function err(...args) {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[${ts}]`, ...args);
}

// ── 微信 code2session ──────────────────────────────────────────────────────
async function wxCode2Session(code) {
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APP_ID}&secret=${WX_APP_SECRET}&js_code=${code}&grant_type=authorization_code`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10000 }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch { reject(new Error('wx response not json: ' + d.slice(0, 100))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('wx timeout')); });
  });
}

// ── HTTP 服务器 ─────────────────────────────────────────────────────────────
const http = require('http');
const server = http.createServer(async (req, res) => {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // ── GET /health ────────────────────────────────────────────────────────
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'wx-auth', ts: new Date().toISOString() }));
    return;
  }

  // ── GET /api/code2session?code=xxx ─────────────────────────────────────
  if (pathname === '/api/code2session' && req.method === 'GET') {
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing code parameter' }));
      return;
    }

    try {
      log(`code2session request, code=${code.slice(0, 8)}...`);
      const result = await wxCode2Session(code);

      if (result.errcode) {
        err(`wx error: ${result.errcode} ${result.errmsg}`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: result.errmsg || `wx error ${result.errcode}` }));
        return;
      }

      // 只返回 openid，不返回 session_key（安全要求）
      log(`ok: openid=${result.openid.slice(0, 12)}...`);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ openid: result.openid }));
    } catch (e) {
      err(`code2session failed: ${e.message}`);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '微信服务调用失败：' + e.message }));
    }
    return;
  }

  // ── 404 ────────────────────────────────────────────────────────────────
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  log(`wx-auth started on port ${PORT}`);
  log(`AppID: ${WX_APP_ID}`);
});

// ── 优雅退出 ───────────────────────────────────────────────────────────────
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { server.close(() => process.exit(0)); });
