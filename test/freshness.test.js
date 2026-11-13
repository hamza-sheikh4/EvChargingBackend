'use strict'

const test        = require('node:test');
const assert      = require('node:assert');
const fresh       = require('../app/Traits/Freshness');
const listingReq  = require('../app/Http/Requests/ListingRequest');
const waitlistReq = require('../app/Http/Requests/WaitlistRequest');
const { LISTING_STALE_DAYS } = require('../config/constants');

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-01T10:00:00Z');
const daysAgo = (days) => new Date(now.getTime() - days * DAY_MS);

test('a listing goes stale after the configured days without a check-in', () => {
  assert.ok(!fresh.isStale({ lastCheckInAt: daysAgo(LISTING_STALE_DAYS - 1) }, now));
  assert.ok(fresh.isStale({ lastCheckInAt: daysAgo(LISTING_STALE_DAYS + 1) }, now));
  assert.ok(fresh.isStale({ lastCheckInAt: null }, now));
});

test('time off hides a listing only until it ends', () => {
  assert.ok(fresh.isAway({ awayUntil: new Date(now.getTime() + 60000) }, now));
  assert.ok(!fresh.isAway({ awayUntil: new Date(now.getTime() - 60000) }, now));
  assert.ok(!fresh.isAway({ awayUntil: null }, now));
});

test('the search filter matches the same rules', () => {
  const where = fresh.findable(now);
  assert.deepStrictEqual(where.lastCheckInAt, { gte: fresh.staleBefore(now) });
  assert.deepStrictEqual(where.OR, [{ awayUntil: null }, { awayUntil: { lte: now } }]);
});

test('time off must end in the future and within 30 days; null ends it', () => {
  const inHours = (hours) => new Date(Date.now() + hours * 3600000).toISOString();
  assert.ok(listingReq.update.safeParse({ awayUntil: inHours(2) }).success);
  assert.ok(listingReq.update.safeParse({ awayUntil: null }).success);
  assert.ok(!listingReq.update.safeParse({ awayUntil: inHours(-1) }).success);
  assert.ok(!listingReq.update.safeParse({ awayUntil: inHours(31 * 24) }).success);
  assert.ok(!listingReq.update.safeParse({ awayUntil: 'tomorrow' }).success);
});

test('the waitlist takes a valid email and refuses anything else', () => {
  assert.ok(waitlistReq.join.safeParse({ email: ' Someone@Example.com ' }).success);
  assert.ok(waitlistReq.join.safeParse({ email: 'a@b.co', website: '' }).success);
  assert.ok(!waitlistReq.join.safeParse({ email: 'not-an-email' }).success);
  assert.ok(!waitlistReq.join.safeParse({}).success);
});
