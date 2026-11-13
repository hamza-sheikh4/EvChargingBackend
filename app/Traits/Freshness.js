'use strict'

const { LISTING_STALE_DAYS } = require('../../config/constants');

/*
|--------------------------------------------------------------------------
| Listing Freshness
|--------------------------------------------------------------------------
|
| A listing with no host check-in for LISTING_STALE_DAYS goes stale and is
| hidden from drivers until the host checks in again (vision rule 7). A
| host on time off is hidden until awayUntil. Search, booking and the
| host's own listing all use these, so they agree.
|
*/

const DAY_MS = 24 * 60 * 60 * 1000;

let o = {}

/** Check-ins before this moment are stale. */
o.staleBefore = (now = new Date()) => new Date(now.getTime() - LISTING_STALE_DAYS * DAY_MS);

o.isStale = (charger, now = new Date()) => !charger.lastCheckInAt || charger.lastCheckInAt < o.staleBefore(now);

o.isAway = (charger, now = new Date()) => Boolean(charger.awayUntil && charger.awayUntil > now);

/** Prisma filter: checked in recently and not on time off. */
o.findable = (now = new Date()) => ({
  lastCheckInAt: { gte: o.staleBefore(now) },
  OR: [{ awayUntil: null }, { awayUntil: { lte: now } }],
});

module.exports = o;
