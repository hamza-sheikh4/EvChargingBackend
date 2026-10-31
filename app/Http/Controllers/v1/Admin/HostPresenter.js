'use strict'

const crypto  = require('../../../../Traits/Crypto');
const storage = require('../../../../Traits/Storage');
const prisma  = require('../../../../../config/database');
const listing = require('../ListingPresenter');
const notify  = require('../../../../Traits/Notify');
const metrics = require('../../../../Traits/Metrics');
const systemLog = require('../../../../Traits/SystemLog');

/*
|--------------------------------------------------------------------------
| Host Presenter
|--------------------------------------------------------------------------
|
| How hosts look to the admin panel. Photos are short-lived signed links,
| the CNIC is decrypted only for the detail view.
|
*/

let o = {}

const url = (key) => (key ? storage.viewUrl(key) : null);

/** "3520112345671" becomes "35201-1234567-1". */
const formatCnic = (digits) => `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;

/** A row in the review queue. */
o.summary = (host) => ({
  id: host.id,
  fullName: host.fullName ?? '',
  phone: host.phone,
  status: host.hostVerificationStatus,
  submittedAt: (host.hostOnboardedAt ?? host.updatedAt).toISOString(),
  areaId: host.chargers[0]?.areaId ?? null,
  locationType: host.chargers[0]?.locationType ?? null,
  chargerCount: host.chargers.length,
});

const charger = async (c) => ({
  id: c.id,
  locationType: c.locationType,
  areaId: c.areaId,
  coordinates: { latitude: c.latitude, longitude: c.longitude },
  instructions: c.instructions,
  connectors: c.connectors,
  powerKw: c.powerKw,
  reportsEnergy: c.reportsEnergy,
  ratePaisa: c.ratePaisa,
  hours: c.hours,
  emergencyAvailability: c.emergencyAvailability,
  listed: c.listed,
  verifiedAt: c.verifiedAt?.toISOString() ?? null,
  lastCheckInAt: c.lastCheckInAt?.toISOString() ?? null,
  createdAt: c.createdAt.toISOString(),
  photos: { charger: await url(c.chargerPhotoKey), connector: await url(c.connectorPhotoKey) },
});

// The Listings page shows the same charger view.
o.charger = charger;

/** The full review view: identity, chargers and past decisions; the CNIC and its photos only with documents. */
o.detail = async (host, history, { documents }) => ({
  id: host.id,
  fullName: host.fullName ?? '',
  phone: host.phone,
  email: host.email ?? null,
  photoUrl: await url(host.photoKey),
  memberSince: host.createdAt.toISOString(),
  submittedAt: host.hostOnboardedAt?.toISOString() ?? null,
  status: host.hostVerificationStatus,
  cnic: documents && host.cnicEncrypted ? formatCnic(crypto.decrypt(host.cnicEncrypted)) : null,
  address: host.address ?? '',
  documents: documents ? { front: await url(host.cnicFrontKey), back: await url(host.cnicBackKey) } : null,
  chargers: await Promise.all(host.chargers.map(charger)),
  history: history.map((entry) => ({
    action: entry.action === 'host.approve' ? 'approved' : 'rejected',
    by: entry.actorEmail,
    at: entry.createdAt.toISOString(),
    reason: entry.details?.reason ?? null,
  })),
});

/**
 * After a change to the host's listing: a notification for their bell (verified, rejected,
 * admin_paused, admin_relisted), and the new listing, live, to any open app.
 * A closed app finds both the next time it opens.
 */
o.notify = async (hostId, kind) => {
  // Best effort: the decision is already saved, and the app also finds it by polling.
  try {
    await notify.send(hostId, 'host', kind);
    const host = await prisma.user.findUnique({ where: { id: hostId } });
    const first = await prisma.charger.findFirst({ where: { hostId }, orderBy: { createdAt: 'asc' } });
    if (!first || !global.io?.toUser) return;
    global.io.toUser(hostId, { type: 'listing_updated', listing: listing.toResponse(first, host, await listing.reviewFor(host)) });
  } catch (e) {
    console.error('Could not notify the host:', e.message);
    metrics.notificationFailed();
    systemLog.error('api', 'Could not notify a host', e, { kind });
  }
};

module.exports = o;
