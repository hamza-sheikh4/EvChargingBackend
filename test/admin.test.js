'use strict'

process.env.ADMIN_JWT_SECRET ||= 'test-admin-secret';

const test     = require('node:test');
const assert   = require('node:assert');
const totp     = require('../app/Traits/Totp');
const password = require('../app/Traits/Password');
const adminReq = require('../app/Http/Requests/AdminRequest');

// RFC 6238 appendix B: the SHA-1 secret is the ASCII "12345678901234567890".
const rfcSecret = totp.base32Encode(Buffer.from('12345678901234567890'));

test('authenticator codes match the RFC 6238 test vectors', () => {
  const at = (seconds, digits = 8) => totp.codeAt(rfcSecret, totp.stepAt(seconds * 1000), digits);
  assert.strictEqual(at(59), '94287082');
  assert.strictEqual(at(1111111109), '07081804');
  assert.strictEqual(at(1234567890), '89005924');
  assert.strictEqual(at(2000000000), '69279037');
  assert.strictEqual(at(59, 6), '287082');
});

test('base32 survives a round trip, and a new secret is 32 characters', () => {
  const bytes = Buffer.from('hello authenticator');
  assert.deepStrictEqual(totp.base32Decode(totp.base32Encode(bytes)), bytes);
  assert.match(totp.generateSecret(), /^[A-Z2-7]{32}$/);
});

test('a code is accepted for its step and one either side, and never twice', () => {
  const secret = totp.generateSecret();
  const now = Date.now();
  const step = totp.stepAt(now);
  const code = totp.codeAt(secret, step);
  assert.strictEqual(totp.verify(secret, code, null, now), step);
  assert.strictEqual(totp.verify(secret, code, null, now + 30000), step);
  assert.strictEqual(totp.verify(secret, code, null, now + 90000), null);
  assert.strictEqual(totp.verify(secret, code, step, now), null);
  assert.strictEqual(totp.verify(secret, '12345', null, now), null);
});

test('passwords hash, verify, and refuse the wrong one', async () => {
  const stored = await password.hash('correct horse battery');
  assert.match(stored, /^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.ok(await password.verify('correct horse battery', stored));
  assert.ok(!(await password.verify('wrong horse battery', stored)));
  assert.ok(!(await password.verify('anything', 'not-a-hash')));
});

test('temporary passwords are 16 easy-to-read characters', () => {
  const temporary = password.temporary();
  assert.strictEqual(temporary.length, 16);
  assert.doesNotMatch(temporary, /[0O1lI]/);
});

test('admin requests check emails, passwords, codes and permissions', () => {
  assert.strictEqual(adminReq.login.parse({ email: ' Ali@Example.com ', password: 'x' }).email, 'ali@example.com');
  assert.ok(!adminReq.twoFactor.safeParse({ challenge: 'c', code: '12345' }).success);
  assert.ok(!adminReq.changePassword.safeParse({ currentPassword: 'a', newPassword: 'short' }).success);
  assert.ok(adminReq.addMember.safeParse({ fullName: 'Ali Raza', email: 'ali@example.com', permissions: ['hosts_view'] }).success);
  assert.ok(!adminReq.addMember.safeParse({ fullName: 'Ali Raza', email: 'ali@example.com', permissions: ['root'] }).success);
  assert.ok(!adminReq.updateMember.safeParse({}).success);
});

test('super admin script: emails are trimmed, lower-cased and checked', () => {
  const supers = require('../app/Traits/SuperAdmins');
  assert.strictEqual(supers.normalizeEmail('  Ali@Example.COM '), 'ali@example.com');
  assert.ok(supers.validEmail('ali@example.com'));
  assert.ok(!supers.validEmail('ali@example'));
  assert.ok(!supers.validEmail('ali example.com'));
  assert.strictEqual(supers.MAX_SUPER_ADMINS, 3);
});

test('super admin script shows the database as host:port/dbname, never the password', () => {
  const supers = require('../app/Traits/SuperAdmins');
  const label = supers.databaseLabel('postgresql://postgres.abc:s3cr%2Fet@aws-0.pooler.supabase.com:5432/postgres');
  assert.strictEqual(label, 'aws-0.pooler.supabase.com:5432/postgres');
  assert.doesNotMatch(label, /s3cr|postgres\.abc/);
});

test('giving any action on a page also gives seeing that page', () => {
  const parsed = adminReq.addMember.parse({ fullName: 'Ali Raza', email: 'ali@example.com', permissions: ['hosts_approve', 'team_remove'] });
  assert.deepStrictEqual(parsed.permissions, ['hosts_view', 'hosts_approve', 'team_view', 'team_remove']);
  assert.ok(!adminReq.addMember.safeParse({ fullName: 'Ali Raza', email: 'ali@example.com', permissions: ['hosts_review'] }).success);
});
