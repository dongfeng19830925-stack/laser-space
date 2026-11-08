import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { connect } from 'mqtt';

const broker = 'mqtt://192.168.10.80:1883';
const panelKey = randomBytes(32).toString('base64url');
const assets = new Map(await Promise.all([
  ['/', 'index.html', 'text/html'],
  ['/panel.js', 'panel.js', 'text/javascript'],
  ['/panel.css', 'panel.css', 'text/css'],
].map(async ([path, file, type]) => [
  path, [await readFile(new URL(file, import.meta.url)), type],
])));
const count = 144;
let state = null;
let revision = 0;
let busy = false;
let origin;

function respond(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function publishState(state) {
  return new Promise((resolve, reject) => {
    const client = connect(broker, {
      clientId: 'laser-panel-' + randomBytes(4).toString('hex'),
      connectTimeout: 4000,
      reconnectPeriod: 0,
    });
    let settled = false;
    const timeout = setTimeout(() => finish(new Error('MQTT confirmation timed out')), 6000);
    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      client.end(true);
      if (error) reject(error);
      else resolve();
    }
    client.on('error', finish);
    client.once('close', () => finish(new Error('MQTT connection closed')));
    client.once('connect', () => {
      client.publish('changeState', JSON.stringify({ state }), { qos: 1, retain: false }, finish);
    });
  });
}

const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'");
  if (req.headers.host !== new URL(origin).host) {
    return respond(res, 403, { error: '请通过本地启动地址访问。' });
  }

  const asset = assets.get(req.url);
  if (req.method === 'GET' && asset) {
    const [body, type] = asset;
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
    return res.end(body);
  }
  if (req.method === 'GET' && req.url === '/api/state') {
    return respond(res, 200, { state, revision, panelKey });
  }
  if (req.method !== 'POST' || req.url !== '/api/state') {
    return respond(res, 404, { error: '页面不存在。' });
  }
  // The page reads this key from the same-origin API. Some embedded browsers omit Origin.
  if (req.headers['x-laser-panel-key'] !== panelKey) {
    return respond(res, 403, { error: '面板连接已失效，请刷新页面后重试。' });
  }
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return respond(res, 415, { error: '请求格式有误，请刷新页面后重试。' });
  }

  let action;
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 512) {
        respond(res, 413, { error: '请求过长。' });
        return;
      }
    }
    action = JSON.parse(body);
  } catch {
    return respond(res, 400, { error: '无法读取请求。' });
  }
  const preset = [0, 1, 2].includes(action?.preset);
  const cell = Number.isInteger(action?.index) && action.index >= 0 && action.index < count;
  if (preset === cell) return respond(res, 400, { error: '无效的点位或颜色。' });
  if (busy || action.revision !== revision) {
    return respond(res, 409, { error: '面板状态已变化，请再试一次。', state, revision });
  }
  if (cell && state === null) {
    return respond(res, 409, { error: '请先选择一个全局状态。', state, revision });
  }

  const next = preset ? Array(count).fill(action.preset) : [...state];
  if (cell) next[action.index] = (next[action.index] + 1) % 3;

  busy = true;
  try {
    await publishState(next);
    state = next;
    respond(res, 200, { state, revision: ++revision });
  } catch {
    state = null;
    respond(res, 502, {
      error: 'MQTT 服务未确认收到指令。请现场确认后重新选择全局状态。',
      state,
      revision: ++revision,
    });
  } finally {
    busy = false;
  }
});

server.listen(Number(process.env.LASER_PORT ?? 8765), '127.0.0.1', () => {
  origin = 'http://127.0.0.1:' + server.address().port;
  console.log('激光控制面板 ' + origin);
  if (process.argv.includes('--open')) {
    execFile('/usr/bin/open', [origin], error => {
      if (error) console.error('请在浏览器打开 ' + origin);
    });
  }
});
