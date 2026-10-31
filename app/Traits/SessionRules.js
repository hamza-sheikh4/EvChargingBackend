'use strict'

/*
|--------------------------------------------------------------------------
| Booking Rules
|--------------------------------------------------------------------------
|
| The server's copy of the app's state machine (domain/session-transitions.ts
| in the app). Every move is checked here, with who may make it, so a late,
| repeated or wrong-side action is refused.
|
*/

const TRANSITIONS = {
  requested: { declined: ['host'], expired: ['system'], cancelled: ['driver'], accepted: ['host'] },
  accepted: { cancelled: ['driver', 'host'], active: ['driver'] },
  active: { interrupted: ['driver'], ended: ['driver'] },
  interrupted: { active: ['driver'], ended: ['driver'] },
  ended: { awaiting_host_energy: ['system'] },
  awaiting_host_energy: { billed: ['host'], flagged: ['host'] },
  flagged: { billed: ['admin'] },
  billed: { paid: ['driver'], disputed: ['driver'] },
  paid: { reviewed: ['driver'] },
  disputed: { resolved: ['admin'] },
};

let o = {}

/** How long a host has to answer a request. */
o.RESPOND_MINUTES = 10;

/** States that hold the charger: one booking at a time per charger (vision rule 1), and per driver. */
o.BUSY = ['requested', 'accepted', 'active', 'interrupted'];

/** After these the exact address, instructions and pin are no longer shared (vision 9.7). */
o.CLOSED = ['paid', 'reviewed', 'cancelled', 'expired', 'declined', 'resolved'];

/** States where the driver may see the exact address and pin. */
o.ACCESS = ['accepted', 'active', 'interrupted', 'ended', 'awaiting_host_energy'];

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
// Pakistan is UTC+5 all year, with no daylight saving.
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
const minutesOf = (time) => {
  const [hours, minutes] = String(time).split(':').map(Number);
  return hours * 60 + minutes;
};

/** Inside the host's weekly hours in Lahore, or listed for emergencies. Same rule as the app's isAvailableNow. */
o.openNow = (hours, emergencyAvailability, now = new Date()) => {
  if (emergencyAvailability) return true;
  const local = new Date(now.getTime() + PKT_OFFSET_MS);
  const day = hours?.[DAYS[local.getUTCDay()]];
  if (!day?.open) return false;
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  return minute >= minutesOf(day.opensAt) && minute < minutesOf(day.closesAt);
};

o.can = (from, to, actor) => Boolean(TRANSITIONS[from]?.[to]?.includes(actor));

/** The event list with one more move on it. */
o.withEvent = (events, from, to, actor, note) => [
  ...(Array.isArray(events) ? events : []),
  { from, to, actor, at: new Date().toISOString(), ...(note ? { note } : {}) },
];

module.exports = o;
