'use strict'

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.OTP_SECRET = 'test-otp-secret';

const test   = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path   = require('node:path');

const otp     = require('../app/Traits/Otp');
const authReq = require('../app/Http/Requests/AuthRequest');
const authCtrl = require('../app/Http/Controllers/v1/AuthController');

test('codes are 6 digits, kept as strings with leading zeros', () => {
  for (let i = 0; i < 200; i++) assert.match(otp.generate(), /^\d{6}$/);
});

test('a stored hash matches only its own email, purpose and code', () => {
  const saved = otp.hash('a@b.com', 'login', '042713');
  assert.ok(otp.matches('a@b.com', 'login', '042713', saved));
  assert.ok(!otp.matches('a@b.com', 'login', '042714', saved));
  assert.ok(!otp.matches('c@b.com', 'login', '042713', saved));
  assert.ok(!otp.matches('a@b.com', 'reset', '042713', saved));
  assert.notStrictEqual(saved, '042713');
});

test('emails are trimmed and lowercased, and must look like an email', () => {
  assert.strictEqual(authReq.sendOtp.parse({ email: '  Ali@Example.COM ', purpose: 'login' }).email, 'ali@example.com');
  assert.ok(!authReq.sendOtp.safeParse({ email: 'not-an-email', purpose: 'login' }).success);
  assert.ok(!authReq.sendOtp.safeParse({ email: 'a@b.com', purpose: 'delete' }).success);
});

test('a code is exactly 6 digits', () => {
  const ok = { email: 'a@b.com', purpose: 'register' };
  assert.ok(authReq.verifyOtp.safeParse({ ...ok, code: '042713' }).success);
  assert.ok(!authReq.verifyOtp.safeParse({ ...ok, code: '0427' }).success);
  assert.ok(!authReq.verifyOtp.safeParse({ ...ok, code: 'abcdef' }).success);
});

test('a new password needs 8 characters and a number', () => {
  const email = 'a@b.com';
  assert.ok(authReq.register.safeParse({ email, password: 'abcdefg1' }).success);
  assert.ok(!authReq.register.safeParse({ email, password: 'abcdefgh' }).success);
  assert.ok(!authReq.register.safeParse({ email, password: 'abc1' }).success);
  assert.ok(!authReq.register.safeParse({ email, password: 'a1'.repeat(70) }).success);
});

test('a reset token stops working once the password changes', () => {
  const user = { id: 'u1', passwordHash: 'scrypt$old' };
  const token = authCtrl.signReset(user);
  const jwt = require('jsonwebtoken');
  assert.ok(jwt.verify(token, authCtrl.resetSecret(user), { audience: 'password-reset' }));
  assert.throws(() => jwt.verify(token, authCtrl.resetSecret({ ...user, passwordHash: 'scrypt$new' }), { audience: 'password-reset' }));
  assert.throws(() => jwt.verify(token, process.env.JWT_SECRET));
});

test('production refuses to start without SMTP settings', () => {
  const run = spawnSync(process.execPath, ['-e', "require('./config/auth')"], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'production', SMTP_USER: '', SMTP_PASS: '' },
    encoding: 'utf8',
  });
  assert.notStrictEqual(run.status, 0);
  assert.match(run.stderr, /SMTP_USER is missing/);
});

test('each email carries the code, the minutes and its own subject', () => {
  const templates = require('../app/Traits/MailTemplates');
  const subjects = new Set();
  for (const purpose of ['register', 'login', 'reset']) {
    const { subject, text, html } = templates[purpose]({ code: '482916', minutes: 10 });
    subjects.add(subject);
    assert.ok(text.includes('482 916') && html.includes('482 916'));
    assert.ok(html.includes('Expires in 10 minutes') && html.includes('prefers-color-scheme: dark'));
  }
  assert.strictEqual(subjects.size, 3);
});
