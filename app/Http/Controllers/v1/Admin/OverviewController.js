'use strict'

const json    = require('../../../../Traits/ApiResponser');
const session = require('./AdminSession');
const ops     = require('./OverviewOps');
const people  = require('./OverviewPeople');

/*
|--------------------------------------------------------------------------
| Overview
|--------------------------------------------------------------------------
|
| Every widget's numbers in one call. Each section is only worked out, and
| only sent, when the admin has that page's permission, so the Overview
| never shows more than the pages themselves would.
|
*/

const SECTIONS = {
  hosts: ['hosts_view', ops.hosts],
  listings: ['listings_view', ops.listings],
  bookings: ['bookings_view', ops.bookings],
  users: ['users_view', people.users],
  team: ['team_view', people.team],
  activity: ['team_view', people.activity],
  system: ['health_view', people.system],
};

let o = {}

o.show = async (req, res, next) => {
  try {
    const allowed = Object.entries(SECTIONS).filter(([, [permission]]) => session.has(req.admin, permission));
    const results = await Promise.all(allowed.map(async ([name, [, load]]) => [name, await load()]));
    json.successResponse(res, { generatedAt: new Date().toISOString(), ...Object.fromEntries(results) });
  } catch (e) {
    next(e);
  }
}

module.exports = o;
