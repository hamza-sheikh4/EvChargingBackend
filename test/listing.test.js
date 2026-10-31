'use strict'

process.env.CNIC_ENCRYPTION_KEY = 'a'.repeat(64);

const test       = require('node:test');
const assert     = require('node:assert');
const crypto     = require('../app/Traits/Crypto');
const geo        = require('../app/Traits/Geo');
const listingReq = require('../app/Http/Requests/ListingRequest');

const day = { open: true, opensAt: '08:00', closesAt: '22:00' };
const draft = {
  fullName: 'Kamran Ali',
  cnic: '3520112345671',
  address: 'House 14, Street 7, DHA Phase 5',
  identity: { frontKey: 'cnic_front/u/a.jpg', backKey: 'cnic_back/u/b.jpg' },
  location: 'home',
  areaId: 'dha-5',
  coordinates: { latitude: 31.4636, longitude: 74.4075 },
  instructions: 'Black gate',
  connectors: ['type2'],
  powerKw: 7.4,
  reportsEnergy: true,
  photoKeys: {},
  ratePaisa: 9500,
  hours: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: { ...day, open: false } },
  emergencyAvailability: false,
};

test('a CNIC is stored encrypted and reads back, never as plain digits', () => {
  const stored = crypto.encrypt('3520112345671');
  assert.ok(!stored.includes('3520112345671'));
  assert.notStrictEqual(stored, crypto.encrypt('3520112345671'));
  assert.strictEqual(crypto.decrypt(stored), '3520112345671');
});

test('the approximate point is 50 to 100 m from the pin', () => {
  const meters = (a, b) => Math.hypot((a.latitude - b.latitude) * 111320, (a.longitude - b.longitude) * 111320 * Math.cos((a.latitude * Math.PI) / 180));
  for (let i = 0; i < 200; i++) {
    const distance = meters(draft.coordinates, geo.approximate(draft.coordinates));
    assert.ok(distance >= 49.5 && distance <= 100.5, `got ${distance}`);
  }
});

test('a complete listing is accepted', () => {
  assert.ok(listingReq.submit.safeParse(draft).success);
});

test('a listing is refused with a bad CNIC, no connector, a price out of range or a bad time', () => {
  assert.ok(!listingReq.submit.safeParse({ ...draft, cnic: '35201-1234567-1' }).success);
  assert.ok(!listingReq.submit.safeParse({ ...draft, connectors: [] }).success);
  assert.ok(!listingReq.submit.safeParse({ ...draft, ratePaisa: 500 }).success);
  assert.ok(!listingReq.submit.safeParse({ ...draft, hours: { ...draft.hours, mon: { ...day, opensAt: '25:00' } } }).success);
});

test('dashboard changes accept a single field', () => {
  assert.ok(listingReq.update.safeParse({ listed: false }).success);
  assert.ok(listingReq.update.safeParse({ ratePaisa: 12000 }).success);
  assert.ok(!listingReq.update.safeParse({ ratePaisa: 99 }).success);
});
