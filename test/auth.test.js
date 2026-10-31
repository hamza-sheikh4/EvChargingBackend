'use strict'

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.OTP_SECRET = 'test-otp-secret';
process.env.OTP_DEV_MODE = 'true';

const test   = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path   = require('node:path');

const otp     = require('../app/Traits/Otp');
const phone   = require('../app/Traits/Phone');
const authReq = require('../app/Http/Requests/AuthRequest');

test('codes are 4 digits, kept as strings with leading zeros', () => {
  for (let i = 0; i < 200; i++) assert.match(otp.generate(), /^\d{4}$/);
});

test('a stored hash matches only its own phone and code', () => {
  const saved = otp.hash('3001234567', '0427');
  assert.ok(otp.matches('3001234567', '0427', saved));
  assert.ok(!otp.matches('3001234567', '0428', saved));
  assert.ok(!otp.matches('3001234568', '0427', saved));
  assert.notStrictEqual(saved, '0427');
});

test('dev mode accepts any code except 0000', () => {
  assert.ok(otp.devAccepts('1234'));
  assert.ok(!otp.devAccepts('0000'));
});

test('phone numbers are masked for logs', () => {
  assert.strictEqual(phone.mask('3001234567'), '300****567');
});

test('requests take a Pakistani mobile number without +92 and a 4-digit code', () => {
  assert.ok(authReq.requestOtp.safeParse({ phone: '3001234567' }).success);
  assert.ok(!authReq.requestOtp.safeParse({ phone: '03001234567' }).success);
  assert.ok(!authReq.requestOtp.safeParse({ phone: '4001234567' }).success);
  assert.ok(authReq.verifyOtp.safeParse({ phone: '3001234567', code: '0427' }).success);
  assert.ok(!authReq.verifyOtp.safeParse({ phone: '3001234567', code: '427' }).success);
  assert.ok(!authReq.verifyOtp.safeParse({ phone: '3001234567', code: 'abcd' }).success);
});

test('the server refuses to start with dev mode on in production', () => {
  const run = spawnSync(process.execPath, ['-e', "require('./config/auth')"], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'production', OTP_DEV_MODE: 'true' },
    encoding: 'utf8',
  });
  assert.notStrictEqual(run.status, 0);
  assert.match(run.stderr, /OTP_DEV_MODE must be false in production/);
});
