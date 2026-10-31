'use strict'

let json    = require('../../../Traits/ApiResponser');
let crypto  = require('../../../Traits/Crypto');
let geo     = require('../../../Traits/Geo');
let storage = require('../../../Traits/Storage');
let prisma  = require('../../../../config/database');
let present = require('./ListingPresenter');

let o = {}

/** One charger per host for now. The table allows more later. */
const findMine = (hostId) => prisma.charger.findFirst({ where: { hostId }, orderBy: { createdAt: 'asc' } });

/** Every photo must be this user's own upload of the right kind, and really uploaded. */
const photosOk = async (userId, photos) => {
  const checks = photos
    .filter(([key]) => key)
    .map(async ([key, kind]) => storage.ownsKey(key, kind, userId) && (await storage.exists(key)));
  return (await Promise.all(checks)).every(Boolean);
};

/**
 * Submits the host's details and charger. The listing waits for verification.
 * After a rejection the host sends it again with fixes: the same charger is updated and goes back to pending.
 */
o.submit = async (req, res, next) => {
  try {
    const draft = req.body;
    const user = req.user;
    const existing = await findMine(user.id);
    if (existing && user.hostVerificationStatus !== 'rejected') return json.errorResponse(res, 'You already have a listing.', 409);

    const ok = await photosOk(user.id, [
      [draft.identity.frontKey, 'cnic_front'],
      [draft.identity.backKey, 'cnic_back'],
      [draft.photoKeys.charger, 'charger_photo'],
      [draft.photoKeys.connector, 'connector_photo'],
    ]);
    if (!ok) return json.errorResponse(res, 'A photo did not upload. Please try again.', 422);

    const approx = geo.approximate(draft.coordinates);
    const now = new Date();
    const charger = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          fullName: user.fullName || draft.fullName,
          cnicEncrypted: crypto.encrypt(draft.cnic),
          cnicFrontKey: draft.identity.frontKey,
          cnicBackKey: draft.identity.backKey,
          address: draft.address,
          isHost: true,
          hostOnboardedAt: user.hostOnboardedAt ?? now,
          hostVerificationStatus: 'pending',
        },
      });
      const fields = {
        locationType: draft.location,
        areaId: draft.areaId,
        latitude: draft.coordinates.latitude,
        longitude: draft.coordinates.longitude,
        approxLatitude: approx.latitude,
        approxLongitude: approx.longitude,
        instructions: draft.instructions ?? '',
        connectors: draft.connectors,
        powerKw: draft.powerKw,
        reportsEnergy: draft.reportsEnergy,
        chargerPhotoKey: draft.photoKeys.charger ?? null,
        connectorPhotoKey: draft.photoKeys.connector ?? null,
        ratePaisa: draft.ratePaisa,
        hours: draft.hours,
        emergencyAvailability: draft.emergencyAvailability,
        lastCheckInAt: now,
      };
      return existing
        ? tx.charger.update({ where: { id: existing.id }, data: { ...fields, verifiedAt: null } })
        : tx.charger.create({ data: { hostId: user.id, ...fields } });
    });
    const host = { ...user, address: draft.address, fullName: user.fullName || draft.fullName };
    json.successResponse(res, present.toResponse(charger, host, { status: 'pending' }), existing ? 200 : 201);
  } catch (e) {
    next(e);
  }
}

/** The host's listing, or null before one is submitted. */
o.mine = async (req, res, next) => {
  try {
    const charger = await findMine(req.user.id);
    json.successResponse(res, charger ? present.toResponse(charger, req.user, await present.reviewFor(req.user)) : null);
  } catch (e) {
    next(e);
  }
}

/** Price, hours, area, pin, instructions or "Listed now". Switching "Listed now" counts as a check-in (vision rule 7). */
o.update = async (req, res, next) => {
  try {
    const charger = await findMine(req.user.id);
    if (!charger) return json.errorResponse(res, 'There is no listing to change yet.', 404);
    const { coordinates, listed, ...rest } = req.body;
    // A moved pin gets a new approximate point.
    let pin = {};
    if (coordinates) {
      const approx = geo.approximate(coordinates);
      pin = { ...coordinates, approxLatitude: approx.latitude, approxLongitude: approx.longitude };
    }
    const updated = await prisma.charger.update({
      where: { id: charger.id },
      data: { ...rest, ...pin, ...(listed === undefined ? {} : { listed, lastCheckInAt: new Date() }) },
    });
    json.successResponse(res, present.toResponse(updated, req.user, await present.reviewFor(req.user)));
  } catch (e) {
    next(e);
  }
}

module.exports = o;
