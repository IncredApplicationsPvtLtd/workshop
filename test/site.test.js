// These tests are the "gatekeepers" of production.
// If a student breaks the page, CI fails and the live site stays safe.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('page has a non-empty headline', () => {
  const m = html.match(/<h1 id="headline">([\s\S]*?)<\/h1>/);
  assert.ok(m, 'The <h1 id="headline"> element is missing!');
  assert.ok(m[1].trim().length > 0, 'The headline is empty!');
});

test('page credits the developer who shipped it', () => {
  assert.match(html, /id="developer">[^<]+</, 'The developer name is missing!');
});

test('the Buy button still exists (the business depends on it!)', () => {
  assert.match(html, /id="buy-btn"/, 'Someone deleted the Buy button — that is lost revenue!');
});

test('live updates script is still loaded', () => {
  assert.match(html, /<script src="\/live\.js"><\/script>/);
});

test('HTML tags are balanced', () => {
  for (const tag of ['div', 'section', 'header', 'main', 'p', 'h1', 'h2', 'button']) {
    const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
    const close = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    assert.strictEqual(open, close, `<${tag}> opened ${open} times but closed ${close} times`);
  }
});
