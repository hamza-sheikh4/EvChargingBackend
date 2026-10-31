'use strict'

let json    = require('../../../Traits/ApiResponser');
let rules   = require('../../../Traits/SessionRules');
let storage = require('../../../Traits/Storage');
let prisma  = require('../../../../config/database');
let present = require('./SessionPresenter');
let expiry  = require('../../../Jobs/ExpireRequests');

/*
|--------------------------------------------------------------------------
| Bookings
|--------------------------------------------------------------------------
|
| The driver asks, the host has 10 minutes to answer, and the exact place is
| released only on acceptance. One booking at a time per charger and per
| driver. Billing (host energy, bill, payment) is not built yet: an ended
| booking waits in awaiting_host_energy.
|
*/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CITY = 'Lahore';
const ACCEPTED_PAYMENTS = ['cash', 'bank_transfer'];

let o = {}

const firstName = (name) => (name || '').trim().split(/\s+/)[0] || '';
const actorFor = (row, userId) => (row.driverId === userId ? 'driver' : row.hostId === userId ? 'host' : null);

/** The user's bookings on one side of the app (?as=driver or ?as=host), newest first. */
o.list = async (req, res, next) => {
  try {
    await expiry.run();
    const role = req.query.as === 'host' ? 'host' : 'driver';
    const rows = await prisma.session.findMany({
      where: role === 'host' ? { hostId: req.user.id } : { driverId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    json.successResponse(res, { sessions: await Promise.all(rows.map((row) => present.toSession(row, role))) });
  } catch (e) {
    next(e);
  }
}

/** The driver asks to charge. The price and both sides' details are frozen now. */
o.request = async (req, res, next) => {
  try {
    const charger = await prisma.charger.findUnique({ where: { id: req.body.chargerId }, include: { host: true } });
    if (!charger || !charger.verifiedAt || !charger.listed || charger.host.suspendedAt) {
      return json.errorResponse(res, 'That charger is not available right now.', 409);
    }
    if (charger.hostId === req.user.id) return json.errorResponse(res, 'You cannot book your own charger.', 409);
    if (!rules.openNow(charger.hours, charger.emergencyAvailability)) {
      return json.errorResponse(res, 'This charger is outside its hours right now.', 409);
    }
    const vehicles = await prisma.vehicle.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'asc' } });
    const vehicle = vehicles.find((v) => v.id === req.body.vehicleId) ?? vehicles[0];
    const car = vehicle ? [vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') || vehicle.category : '';

    const row = await prisma.$transaction(async (tx) => {
      // One at a time: lock this charger and this driver, then check for an open booking.
      await tx.$queryRaw`select pg_advisory_xact_lock(hashtext(${'charger:' + charger.id}))::text`;
      await tx.$queryRaw`select pg_advisory_xact_lock(hashtext(${'driver:' + req.user.id}))::text`;
      if (await tx.session.findFirst({ where: { chargerId: charger.id, state: { in: rules.BUSY } } })) return 'busy';
      if (await tx.session.findFirst({ where: { driverId: req.user.id, state: { in: rules.BUSY } } })) return 'mine';
      return tx.session.create({
        data: {
          driverId: req.user.id,
          hostId: charger.hostId,
          chargerId: charger.id,
          ratePaisa: charger.ratePaisa,
          chargerSnapshot: {
            id: charger.id, hostName: firstName(charger.host.fullName), location: charger.locationType, areaId: charger.areaId,
            city: CITY, connectors: charger.connectors, maxKw: charger.powerKw, acceptedPayments: ACCEPTED_PAYMENTS,
          },
          driverSnapshot: { firstName: firstName(req.user.fullName), vehicle: car },
          respondBy: new Date(Date.now() + rules.RESPOND_MINUTES * 60000),
          events: rules.withEvent([], null, 'requested', 'driver'),
        },
      });
    });
    if (row === 'busy') return json.errorResponse(res, 'Someone else is using this charger right now.', 409);
    if (row === 'mine') return json.errorResponse(res, 'You already have a booking in progress.', 409);
    await present.broadcast(row, { host: 'request' });
    json.successResponse(res, { session: await present.toSession(row, 'driver') }, 201);
  } catch (e) {
    next(e);
  }
}

/** The exact address, instructions and pin, for the driver only, once the host accepts. */
o.access = async (req, res, next) => {
  try {
    const row = UUID.test(req.params.id) ? await prisma.session.findUnique({ where: { id: req.params.id }, include: { charger: true, host: true } }) : null;
    if (!row || row.driverId !== req.user.id) return json.errorResponse(res, 'That booking was not found.', 404);
    if (!present.canSeeAccess(row)) return json.errorResponse(res, 'The address is shared once the host accepts.', 403);
    json.successResponse(res, { access: present.access(row.charger, row.host) });
  } catch (e) {
    next(e);
  }
}

/** Checks the driver's end photos are their own uploads. */
const proofsOk = async (userId, keys) =>
  (await Promise.all(Object.values(keys).filter(Boolean).map(async (key) => storage.ownsKey(key, 'session_proof', userId) && storage.exists(key))))
    .every(Boolean);

require('./SessionMoves')(o, { UUID, actorFor, proofsOk });

module.exports = o;
