'use strict'

const json    = require('../../../../Traits/ApiResponser');
const audit   = require('../../../../Traits/AdminAudit');
const prisma  = require('../../../../../config/database');
const present = require('./HostPresenter');
const session = require('./AdminSession');

/*
|--------------------------------------------------------------------------
| Listings
|--------------------------------------------------------------------------
|
| Every charger hosts have listed. Admins can pause one that should not be
| shown (wrong pin, bad photos, complaints) and list it again. The host is
| told either way; the reason stays in the audit log.
|
*/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** live: drivers can find it. paused: verified but switched off. unverified: still in host review. */
const FILTERS = {
  all: {},
  live: { verifiedAt: { not: null }, listed: true },
  paused: { verifiedAt: { not: null }, listed: false },
  unverified: { verifiedAt: null },
};

let o = {}

const hostOf = (user) => ({ id: user.id, fullName: user.fullName ?? '', phone: user.phone, status: user.hostVerificationStatus });

const searchFor = (q) => {
  if (!q) return {};
  const digits = q.replace(/\D/g, '');
  return {
    OR: [
      { host: { fullName: { contains: q, mode: 'insensitive' } } },
      { areaId: { contains: q.toLowerCase().replace(/\s+/g, '-') } },
      ...(digits ? [{ host: { phone: { contains: digits } } }] : []),
    ],
  };
};

/** Counts per filter and one filter's chargers, newest first. */
o.list = async (req, res, next) => {
  try {
    const filter = FILTERS[req.query.filter] ? req.query.filter : 'all';
    const q = String(req.query.q || '').trim().slice(0, 80);
    const [counts, chargers] = await Promise.all([
      Promise.all(Object.entries(FILTERS).map(async ([name, where]) => [name, await prisma.charger.count({ where })])),
      prisma.charger.findMany({
        where: { ...FILTERS[filter], ...searchFor(q) },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { host: true },
      }),
    ]);
    json.successResponse(res, {
      counts: Object.fromEntries(counts),
      listings: chargers.map((c) => ({
        id: c.id,
        host: hostOf(c.host),
        areaId: c.areaId,
        locationType: c.locationType,
        ratePaisa: c.ratePaisa,
        powerKw: c.powerKw,
        connectors: c.connectors,
        listed: c.listed,
        verified: c.verifiedAt !== null,
        emergencyAvailability: c.emergencyAvailability,
        lastCheckInAt: c.lastCheckInAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    next(e);
  }
}

/** One charger with its photos and host, plus past pauses. */
o.show = async (req, res, next) => {
  try {
    const charger = UUID.test(req.params.id) ? await prisma.charger.findUnique({ where: { id: req.params.id }, include: { host: true } }) : null;
    if (!charger) return json.errorResponse(res, 'That listing was not found.', 404);
    const history = await prisma.adminAction.findMany({
      where: { targetType: 'charger', targetId: charger.id, action: { in: ['listing.pause', 'listing.relist'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const view = await present.charger(charger);
    // The exact pin needs its own permission.
    if (!session.has(req.admin, 'listings_view_location')) delete view.coordinates;
    json.successResponse(res, {
      ...view,
      host: hostOf(charger.host),
      history: history.map((entry) => ({
        action: entry.action === 'listing.pause' ? 'paused' : 'relisted',
        by: entry.actorEmail,
        at: entry.createdAt.toISOString(),
        reason: entry.details?.reason ?? null,
      })),
    });
  } catch (e) {
    next(e);
  }
}

/** Pauses (with a reason) or lists again. Only verified chargers can be listed again. */
o.setListed = async (req, res, next) => {
  try {
    const charger = UUID.test(req.params.id) ? await prisma.charger.findUnique({ where: { id: req.params.id } }) : null;
    if (!charger) return json.errorResponse(res, 'That listing was not found.', 404);
    const { listed, reason } = req.body;
    if (!session.has(req.admin, listed ? 'listings_relist' : 'listings_pause')) {
      return json.errorResponse(res, 'You do not have access to this.', 403);
    }
    if (charger.listed === listed) return json.errorResponse(res, listed ? 'It is already listed.' : 'It is already paused.', 409);
    if (listed && !charger.verifiedAt) return json.errorResponse(res, 'Verify the host before listing this charger.', 409);
    await prisma.$transaction(async (tx) => {
      await tx.charger.update({ where: { id: charger.id }, data: { listed } });
      await audit.log(req, listed ? 'listing.relist' : 'listing.pause', 'charger', charger.id, reason ? { reason } : null, tx);
    });
    await present.notify(charger.hostId, listed ? 'admin_relisted' : 'admin_paused');
    json.successResponse(res, { listed });
  } catch (e) {
    next(e);
  }
}

module.exports = o;
