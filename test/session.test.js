'use strict'

const test   = require('node:test');
const assert = require('node:assert');
const rules  = require('../app/Traits/SessionRules');
const req    = require('../app/Http/Requests/SessionRequest');

test('only the right side can make each booking move', () => {
  assert.ok(rules.can('requested', 'accepted', 'host'));
  assert.ok(!rules.can('requested', 'accepted', 'driver'));
  assert.ok(rules.can('requested', 'cancelled', 'driver'));
  assert.ok(!rules.can('requested', 'cancelled', 'host'));
  assert.ok(rules.can('accepted', 'cancelled', 'host'));
  assert.ok(rules.can('accepted', 'active', 'driver'));
  assert.ok(!rules.can('accepted', 'active', 'host'));
  assert.ok(rules.can('active', 'ended', 'driver'));
  assert.ok(rules.can('ended', 'awaiting_host_energy', 'system'));
  assert.ok(!rules.can('expired', 'accepted', 'host'));
  assert.ok(!rules.can('declined', 'requested', 'driver'));
});

test('opening hours are checked in Lahore time', () => {
  const hours = { mon: { open: true, opensAt: '09:00', closesAt: '21:00' }, sun: { open: false, opensAt: '09:00', closesAt: '21:00' } };
  // Monday 26 October 2026. 04:00 UTC is 09:00 in Lahore.
  assert.ok(rules.openNow(hours, false, new Date('2026-10-26T04:00:00Z')));
  assert.ok(!rules.openNow(hours, false, new Date('2026-10-26T03:59:00Z')));
  assert.ok(!rules.openNow(hours, false, new Date('2026-10-26T16:00:00Z')));
  // Sunday is closed, unless the host listed for emergencies.
  assert.ok(!rules.openNow(hours, false, new Date('2026-11-01T08:00:00Z')));
  assert.ok(rules.openNow(hours, true, new Date('2026-11-01T08:00:00Z')));
});

test('the event list grows by one move each time', () => {
  const first = rules.withEvent([], null, 'requested', 'driver');
  const second = rules.withEvent(first, 'requested', 'accepted', 'host', 'see you soon');
  assert.strictEqual(second.length, 2);
  assert.deepStrictEqual({ ...second[1], at: undefined }, { from: 'requested', to: 'accepted', actor: 'host', at: undefined, note: 'see you soon' });
});

test('booking requests check battery levels and reasons', () => {
  assert.ok(req.start.safeParse({ startPercent: 20 }).success);
  assert.ok(!req.start.safeParse({ startPercent: 120 }).success);
  assert.ok(!req.interrupt.safeParse({ reason: '' }).success);
  assert.ok(req.end.safeParse({ endPercent: 80 }).success);
  assert.ok(!req.create.safeParse({ chargerId: 'nope' }).success);
});
