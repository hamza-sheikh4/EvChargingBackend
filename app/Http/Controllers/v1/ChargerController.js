'use strict'

let json   = require('../../../Traits/ApiResponser');
let prisma = require('../../../../config/database');
let rules  = require('../../../Traits/SessionRules');

/*
|--------------------------------------------------------------------------
| Charger Search
|--------------------------------------------------------------------------
|
| What drivers can find: verified, listed chargers whose host is not
| suspended. Never the exact pin, the address or the instructions (vision
| rule 2): only the approximate point and the area, until the host accepts.
| The app works out "available now", distance and fit itself.
|
*/

const CITY = 'Lahore';
const LIMIT = 200;

/** Hosts don't pick payment methods yet; drivers pay the host directly. */
const ACCEPTED_PAYMENTS = ['cash', 'bank_transfer'];

let o = {}

const firstName = (fullName) => (fullName || '').trim().split(/\s+/)[0] || '';

/** A charger as drivers see it (the app's ChargerListing, with areaId for the app to name). */
const toListing = (charger) => ({
  id: charger.id,
  hostName: firstName(charger.host.fullName),
  location: charger.locationType,
  areaId: charger.areaId,
  city: CITY,
  approxLocation: { latitude: charger.approxLatitude, longitude: charger.approxLongitude },
  connectors: charger.connectors,
  maxKw: charger.powerKw,
  ratePaisa: charger.ratePaisa,
  reportsEnergy: charger.reportsEnergy,
  acceptedPayments: ACCEPTED_PAYMENTS,
  hours: charger.hours,
  emergencyAvailability: charger.emergencyAvailability,
  verified: true,
  lastCheckInAt: (charger.lastCheckInAt ?? charger.updatedAt).toISOString(),
  busy: charger.sessions.length > 0,
});

/** Chargers drivers can find, optionally in one area. A host never sees their own charger here. */
o.search = async (req, res, next) => {
  try {
    const areaId = typeof req.query.areaId === 'string' && req.query.areaId ? req.query.areaId.slice(0, 100) : undefined;
    const chargers = await prisma.charger.findMany({
      where: {
        verifiedAt: { not: null },
        listed: true,
        hostId: { not: req.user.id },
        host: { suspendedAt: null },
        ...(areaId ? { areaId } : {}),
      },
      include: {
        host: { select: { fullName: true } },
        // An open booking holds the charger (vision rule 1).
        sessions: { where: { state: { in: rules.BUSY } }, select: { id: true }, take: 1 },
      },
      orderBy: { lastCheckInAt: 'desc' },
      take: LIMIT,
    });
    json.successResponse(res, { chargers: chargers.map(toListing) });
  } catch (e) {
    next(e);
  }
}

module.exports = o;
