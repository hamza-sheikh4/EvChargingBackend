'use strict'

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.OTP_SECRET = 'test-otp-secret';

const test    = require('node:test');
const assert  = require('node:assert');
const userReq = require('../app/Http/Requests/UserRequest');

const valid = {
  profile: { fullName: 'Ali Raza', phone: '3001234567', email: '' },
  vehicle: { category: 'car', manufacturer: 'BYD', model: 'Atto 3', connectors: ['type2'], usesAdapter: false },
};

test('driver onboarding accepts the app\'s answers, with or without an email', () => {
  assert.ok(userReq.saveDriver.safeParse(valid).success);
  assert.ok(userReq.saveDriver.safeParse({ ...valid, profile: { fullName: 'Ali Raza', phone: '3001234567', email: 'ali@example.com' } }).success);
  assert.ok(userReq.saveDriver.safeParse({ ...valid, vehicle: { category: 'bike', connectors: ['gbt'], usesAdapter: true } }).success);
});

test('driver onboarding refuses a missing name, a bad email, no connector or an unknown one', () => {
  assert.ok(!userReq.saveDriver.safeParse({ ...valid, profile: { fullName: 'A', phone: '3001234567' } }).success);
  assert.ok(!userReq.saveDriver.safeParse({ ...valid, profile: { fullName: 'Ali Raza' } }).success);
  assert.ok(!userReq.saveDriver.safeParse({ ...valid, profile: { fullName: 'Ali Raza', phone: '03001234567' } }).success);
  assert.ok(!userReq.saveDriver.safeParse({ ...valid, profile: { fullName: 'Ali Raza', phone: '3001234567', email: 'ali@' } }).success);
  assert.ok(!userReq.saveDriver.safeParse({ ...valid, vehicle: { ...valid.vehicle, connectors: [] } }).success);
  assert.ok(!userReq.saveDriver.safeParse({ ...valid, vehicle: { ...valid.vehicle, connectors: ['tesla'] } }).success);
});

test('a photo key only counts for its own user and kind', () => {
  const storage = require('../app/Traits/Storage');
  const key = storage.keyFor('profile_photo', 'user-1');
  assert.match(key, /^profile_photo\/user-1\/[0-9a-f-]{36}\.jpg$/);
  assert.ok(storage.ownsKey(key, 'profile_photo', 'user-1'));
  assert.ok(!storage.ownsKey(key, 'profile_photo', 'user-2'));
  assert.ok(!storage.ownsKey(key, 'cnic_front', 'user-1'));
});

test('a new password needs 8 or more characters with a number; the current one is optional', () => {
  assert.ok(userReq.changePassword.safeParse({ password: 'abcdefg1' }).success);
  assert.ok(userReq.changePassword.safeParse({ currentPassword: 'old', password: 'abcdefg1' }).success);
  assert.ok(!userReq.changePassword.safeParse({ password: 'short1' }).success);
  assert.ok(!userReq.changePassword.safeParse({ password: 'nonumbershere' }).success);
});

test('deleting an account takes an optional password and nothing else', () => {
  assert.ok(userReq.deleteAccount.safeParse({}).success);
  assert.ok(userReq.deleteAccount.safeParse({ password: 'abcdefg1' }).success);
  assert.ok(!userReq.deleteAccount.safeParse({ password: 5 }).success);
});

test('the phone can be edited, in the same format as onboarding', () => {
  assert.ok(userReq.updateProfile.safeParse({ phone: '3001234567' }).success);
  assert.ok(!userReq.updateProfile.safeParse({ phone: '03001234567' }).success);
});
