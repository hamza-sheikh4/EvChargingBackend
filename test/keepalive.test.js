'use strict'

const test   = require('node:test');
const assert = require('node:assert');
const keepAlive = require('../app/Jobs/KeepAlive');

test('keep-alive is off without a public address and uses the health path with one', () => {
  const saved = { a: process.env.KEEP_ALIVE_URL, b: process.env.RENDER_EXTERNAL_URL };
  delete process.env.KEEP_ALIVE_URL; delete process.env.RENDER_EXTERNAL_URL;
  assert.strictEqual(keepAlive.url(), null);
  process.env.RENDER_EXTERNAL_URL = 'https://x.onrender.com/';
  assert.strictEqual(keepAlive.url(), 'https://x.onrender.com/api/v1/health');
  process.env.KEEP_ALIVE_URL = 'https://y.example.com';
  assert.strictEqual(keepAlive.url(), 'https://y.example.com/api/v1/health');
  for (const [k, v] of [['KEEP_ALIVE_URL', saved.a], ['RENDER_EXTERNAL_URL', saved.b]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
