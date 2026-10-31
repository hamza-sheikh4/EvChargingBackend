'use strict'

const test    = require('node:test');
const assert  = require('node:assert');
const scrub   = require('../app/Traits/Scrub');
const metrics = require('../app/Traits/Metrics');

test('personal data is scrubbed before it is stored', () => {
  const text = scrub.text('Call 03001234567 or +92 300 1234567, mail ali@example.com, CNIC 35201-1234567-1, token eyJhbGciOi.eyJzdWIiOi.abc123');
  assert.doesNotMatch(text, /3001234567|300 1234567|ali@example|35201|eyJhbG/);
  assert.match(text, /\[phone\].*\[email\].*\[cnic\].*\[token\]/);
});

test('scrubbed JSON drops secret-looking keys and cleans the rest', () => {
  const value = scrub.json({ password: 'x', where: 'Home', nested: { phone: '3001234567', authorization: 'Bearer y' } });
  assert.deepStrictEqual(value, { where: 'Home', nested: { phone: '[phone]' } });
});

test('live metrics count requests, errors and timings per route', () => {
  const run = (status) => {
    const listeners = {};
    const res = { statusCode: status, on: (event, fn) => { listeners[event] = fn; } };
    metrics.middleware({ method: 'GET', baseUrl: '/api/v1/chargers', route: { path: '/' } }, res, () => {});
    listeners.finish();
  };
  run(200); run(200); run(500);
  const window = metrics.window(15);
  assert.ok(window.requests >= 3);
  assert.ok(window.errors >= 1);
  assert.ok(metrics.routes().failing.some((r) => r.route === 'GET /api/v1/chargers/'));
  assert.strictEqual(metrics.hourly().length, 24);
});
