'use strict'

const json    = require('../../../../Traits/ApiResponser');
const storage = require('../../../../Traits/Storage');
const prisma  = require('../../../../../config/database');
const expiry  = require('../../../../Jobs/ExpireRequests');
const session = require('./AdminSession');

/*
|--------------------------------------------------------------------------
| Bookings
|--------------------------------------------------------------------------
|
| Every booking, read only, so an admin can answer "what happened?". Both
| sides' names and phones, the full timeline and the end photos. Resolving
| flagged or disputed bookings comes with billing.
|
*/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FILTERS = {
  all: {},
  upcoming: { state: { in: ['requested', 'accepted'] } },
  charging: { state: { in: ['active', 'interrupted'] } },
  ended: { state: { in: ['ended', 'awaiting_host_energy', 'billed', 'flagged', 'paid', 'disputed', 'reviewed', 'resolved'] } },
  closed: { state: { in: ['declined', 'expired', 'cancelled'] } },
};

let o = {}

const person = (user) => ({ id: user.id, fullName: user.fullName ?? '', phone: user.phone });

const summary = (row) => ({
  id: row.id,
  state: row.state,
  driver: person(row.driver),
  host: person(row.host),
  areaId: row.chargerSnapshot?.areaId ?? null,
  ratePaisa: row.ratePaisa,
  vehicle: row.driverSnapshot?.vehicle ?? '',
  startPercent: row.startPercent,
  endPercent: row.endPercent,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const searchFor = (q) => {
  if (!q) return {};
  const digits = q.replace(/\D/g, '');
  const match = (field) => [{ [field]: { fullName: { contains: q, mode: 'insensitive' } } }, ...(digits ? [{ [field]: { phone: { contains: digits } } }] : [])];
  return { OR: [...match('driver'), ...match('host')] };
};

/** Counts per filter and one filter's bookings, newest first. */
o.list = async (req, res, next) => {
  try {
    await expiry.run();
    const filter = FILTERS[req.query.filter] ? req.query.filter : 'all';
    const q = String(req.query.q || '').trim().slice(0, 80);
    const [counts, rows] = await Promise.all([
      Promise.all(Object.entries(FILTERS).map(async ([name, where]) => [name, await prisma.session.count({ where })])),
      prisma.session.findMany({
        where: { ...FILTERS[filter], ...searchFor(q) },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { driver: true, host: true },
      }),
    ]);
    json.successResponse(res, { counts: Object.fromEntries(counts), bookings: rows.map(summary) });
  } catch (e) {
    next(e);
  }
}

/** One booking: both sides, the charger as it was booked, the timeline and the end photos. */
o.show = async (req, res, next) => {
  try {
    const row = UUID.test(req.params.id || '')
      ? await prisma.session.findUnique({ where: { id: req.params.id }, include: { driver: true, host: true } })
      : null;
    if (!row) return json.errorResponse(res, 'That booking was not found.', 404);
    // The driver's photos need their own permission.
    const keys = session.has(req.admin, 'bookings_view_photos') ? row.proofKeys || {} : {};
    json.successResponse(res, {
      ...summary(row),
      charger: row.chargerSnapshot,
      respondBy: row.respondBy.toISOString(),
      interruptionReason: row.interruptionReason,
      events: row.events,
      proofs: {
        chargerDisplay: keys.chargerDisplay ? await storage.viewUrl(keys.chargerDisplay) : null,
        carScreen: keys.carScreen ? await storage.viewUrl(keys.carScreen) : null,
      },
    });
  } catch (e) {
    next(e);
  }
}

module.exports = o;
