'use strict'

const test    = require('node:test');
const assert  = require('node:assert');
const userReq = require('../app/Http/Requests/UserRequest');

const valid = {
  profile: { fullName: 'Ali Raza', email: '' },
  vehicle: { category: 'car', manufacturer: 'BYD', model: 'Atto 3', connectors: ['type2'], usesAdapter: false },
};

test('driver onboarding accepts the app\'s answers, with or without an email', () => {
  assert.ok(userReq.saveDriver.safeParse(valid).success);
  assert.ok(userReq.saveDriver.safeParse({ ...valid, profile: { fullName: 'Ali Raza', email: 'ali@example.com' } }).success);
  assert.ok(userReq.saveDriver.safeParse({ ...valid, vehicle: { category: 'bike', connectors: ['gbt'], usesAdapter: true } }).success);
});

test('driver onboarding refuses a missing name, a bad email, no connector or an unknown one', () => {
  assert.ok(!userReq.saveDriver.safeParse({ ...valid, profile: { fullName: 'A' } }).success);
  assert.ok(!userReq.saveDriver.safeParse({ ...valid, profile: { fullName: 'Ali Raza', email: 'ali@' } }).success);
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
