const { test, before, after } = require('node:test');
const assert = require('node:assert');

process.env.EVENT_TOKEN = 'test-token';
process.env.CHECKOUT_ITERATIONS = '1000';
const { server } = require('../app/server');

let base;
before(() => new Promise(r => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => new Promise(r => server.close(r)));

test('health check responds', async () => {
  const r = await fetch(`${base}/api/health`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await r.json()).ok, true);
});

test('home page is served', async () => {
  const r = await fetch(base);
  assert.strictEqual(r.status, 200);
  assert.match(await r.text(), /id="headline"/);
});

test('checkout completes an order', async () => {
  const r = await fetch(`${base}/api/checkout`, { method: 'POST' });
  const d = await r.json();
  assert.strictEqual(d.ok, true);
  assert.ok(d.orderId);
});

test('pipeline events require the secret token', async () => {
  const r = await fetch(`${base}/api/event`, { method: 'POST', body: '{}' });
  assert.strictEqual(r.status, 401);
});

test('no path traversal outside public/', async () => {
  const r = await fetch(`${base}/..%2fpackage.json`);
  assert.notStrictEqual(r.status, 200);
});
