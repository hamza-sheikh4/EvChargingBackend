'use strict'

let storage = require('../../../Traits/Storage');
let notify  = require('../../../Traits/Notify');
let metrics = require('../../../Traits/Metrics');
let systemLog = require('../../../Traits/SystemLog');
let rules   = require('../../../Traits/SessionRules');
let prisma  = require('../../../../config/database');

/*
|--------------------------------------------------------------------------
| Session Presenter
|--------------------------------------------------------------------------
|
| A booking as each side of the app reads it (ChargingSession). The host's
| copy has the driver's first name and car, never their phone. Only the
| driver's copy of an accepted, unfinished booking has the exact place.
|
*/

let o = {}

const proofs = async (keys) => {
  if (!keys) return {};
  const entries = await Promise.all(
    Object.entries(keys).filter(([, key]) => key).map(async ([name, key]) => [name, await storage.viewUrl(key)]),
  );
  return Object.fromEntries(entries);
};

/** role is "driver" or "host": whose copy this is. */
o.toSession = async (row, role) => ({
  id: row.id,
  charger: row.chargerSnapshot,
  ratePaisa: row.ratePaisa,
  state: row.state,
  events: row.events,
  respondBy: row.respondBy.toISOString(),
  startPercent: row.startPercent ?? undefined,
  endPercent: row.endPercent ?? undefined,
  interruptionReason: row.interruptionReason ?? undefined,
  proofs: await proofs(row.proofKeys),
  ...(role === 'host' ? { driver: row.driverSnapshot } : {}),
  ...(role === 'driver' && o.canSeeAccess(row) ? { access: await accessFor(row.chargerId) } : {}),
});

const accessFor = async (chargerId) => {
  const charger = await prisma.charger.findUnique({ where: { id: chargerId }, include: { host: true } });
  return charger ? o.access(charger, charger.host) : undefined;
};

/** The exact place, only for the driver of an accepted, unfinished booking. */
o.access = (charger, host) => ({
  address: host.address ?? '',
  instructions: charger.instructions ?? '',
  coordinates: { latitude: charger.latitude, longitude: charger.longitude },
});

o.canSeeAccess = (row) => rules.ACCESS.includes(row.state);

/**
 * After a change: each side's copy goes live to their open apps, and optional notifications
 * ({ driver: kind, host: kind }) go to their bells. Best effort: the change is already saved.
 */
o.broadcast = async (row, kinds = {}) => {
  try {
    for (const role of ['driver', 'host']) {
      const userId = role === 'driver' ? row.driverId : row.hostId;
      if (kinds[role]) await notify.send(userId, role, kinds[role], row.id);
      if (global.io?.toUser) global.io.toUser(userId, { type: 'session_updated', role, session: await o.toSession(row, role) });
    }
  } catch (e) {
    console.error('Could not send the booking update:', e.message);
    metrics.notificationFailed();
    systemLog.error('api', 'Could not send a booking update', e, { state: row.state });
  }
};

module.exports = o;
