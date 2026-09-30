// Live Workshop server — zero dependencies, plain Node 20.
// Serves the site, streams live stats over SSE, and exposes a deliberately
// CPU-heavy /api/checkout so we can watch one small server struggle under load.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { monitorEventLoopDelay } = require('perf_hooks');

const PORT = Number(process.env.PORT || 3000);
const EVENT_TOKEN = process.env.EVENT_TOKEN || '';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_IN_FLIGHT = Number(process.env.MAX_IN_FLIGHT || 150);
const CHECKOUT_ITERATIONS = Number(process.env.CHECKOUT_ITERATIONS || 60000);

function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8'));
  } catch {
    return { sha: 'local', short: 'local', message: 'running locally', author: 'you', time: new Date().toISOString() };
  }
}
const VERSION = readVersion();
const STARTED_AT = Date.now();

// ---------- metrics ----------
const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();
let reqThisSecond = 0, checkoutThisSecond = 0, errorsThisSecond = 0;
let latencies = [];           // checkout latencies in the current second
let inFlight = 0;
let totalRequests = 0, totalCheckouts = 0, totalErrors = 0;
let peakOnline = 0, peakRps = 0;
const history = [];           // last 120 seconds of snapshots
const events = [];            // pipeline / launch-day events (last 30)
const clients = new Set();    // SSE connections = "people online"
let flashSale = false;        // presenter toggles this from the dashboard
let lastCpu = os.cpus().map(c => c.times);

function cpuPercent() {
  const now = os.cpus().map(c => c.times);
  let idle = 0, total = 0;
  now.forEach((t, i) => {
    const p = lastCpu[i] || t;
    const d = k => t[k] - p[k];
    const tot = d('user') + d('nice') + d('sys') + d('idle') + d('irq');
    idle += d('idle'); total += tot;
  });
  lastCpu = now;
  return total ? Math.round(100 * (1 - idle / total)) : 0;
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]);
}

function snapshot() {
  const snap = {
    t: Date.now(),
    online: clients.size,
    rps: reqThisSecond,
    checkoutRps: checkoutThisSecond,
    errors: errorsThisSecond,
    p50: pct(latencies, 0.5),
    p95: pct(latencies, 0.95),
    inFlight,
    cpu: cpuPercent(),
    mem: Math.round(100 * (1 - os.freemem() / os.totalmem())),
    loopLag: Math.round(loopDelay.mean / 1e6),
  };
  loopDelay.reset();
  peakOnline = Math.max(peakOnline, snap.online);
  peakRps = Math.max(peakRps, snap.rps);
  reqThisSecond = checkoutThisSecond = errorsThisSecond = 0;
  latencies = [];
  history.push(snap);
  if (history.length > 120) history.shift();
  return snap;
}

function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

setInterval(() => {
  const snap = snapshot();
  broadcast('stats', {
    ...snap,
    totals: { requests: totalRequests, checkouts: totalCheckouts, errors: totalErrors, peakOnline, peakRps },
    version: VERSION,
    flashSale,
    uptime: Math.round((Date.now() - STARTED_AT) / 1000),
    host: os.hostname(),
  });
}, 1000).unref();

// ---------- helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  if (p === '/dashboard' || p === '/scale') p += '.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise(resolve => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 1e4) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });
}

// ---------- routes ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  totalRequests++; reqThisSecond++;

  if (url.pathname === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`event: hello\ndata: ${JSON.stringify({ version: VERSION, history, events, flashSale })}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clients.delete(res); clearInterval(ping); });
    return;
  }

  if (url.pathname === '/api/health') {
    return send(res, 200, { ok: true, version: VERSION, uptime: Math.round((Date.now() - STARTED_AT) / 1000) });
  }

  // Simulates real work: auth + DB + payment. Costs real CPU on purpose.
  if (url.pathname === '/api/checkout') {
    if (inFlight >= MAX_IN_FLIGHT) {
      totalErrors++; errorsThisSecond++;
      return send(res, 503, { ok: false, error: 'Server overloaded — too many customers at once!' });
    }
    inFlight++;
    const start = Date.now();
    crypto.pbkdf2(String(Math.random()), 'salt', CHECKOUT_ITERATIONS, 64, 'sha512', err => {
      inFlight--;
      const ms = Date.now() - start;
      latencies.push(ms); totalCheckouts++; checkoutThisSecond++;
      if (err) { totalErrors++; errorsThisSecond++; return send(res, 500, { ok: false }); }
      send(res, 200, { ok: true, orderId: crypto.randomBytes(4).toString('hex').toUpperCase(), ms });
    });
    return;
  }

  // Pipeline + load-test events, posted by GitHub Actions.
  if (url.pathname === '/api/event' && req.method === 'POST') {
    if (!EVENT_TOKEN || req.headers.authorization !== `Bearer ${EVENT_TOKEN}`) return send(res, 401, { error: 'unauthorized' });
    const body = await readBody(req);
    const ev = { t: Date.now(), stage: String(body.stage || 'info').slice(0, 30), text: String(body.text || '').slice(0, 200), status: String(body.status || 'info').slice(0, 20) };
    if (ev.stage === 'flashsale') flashSale = ev.status === 'start';
    events.push(ev);
    if (events.length > 30) events.shift();
    broadcast('pipeline', ev);
    return send(res, 200, { ok: true });
  }

  serveStatic(req, res);
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Workshop server on :${PORT} — version ${VERSION.short}`));
  const shutdown = () => { for (const c of clients) c.end(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { server };
