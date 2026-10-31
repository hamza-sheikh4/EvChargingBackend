'use strict'

let prisma = require('../../../../config/database');

/*
|--------------------------------------------------------------------------
| Listing Presenter
|--------------------------------------------------------------------------
|
| The host's listing as the app reads it (ListingResponse), including the
| latest review decision for the congrats or "needs changes" screen.
| Never the CNIC or its photos.
|
*/

let o = {}

/**
 * pending, or the latest decision: when it was made and, for a rejection, the reason the
 * admin wrote. decidedAt lets the app show each decision's screen once.
 */
o.reviewFor = async (user) => {
  const status = user.hostVerificationStatus ?? 'pending';
  if (status === 'pending') return { status };
  const last = await prisma.adminAction.findFirst({
    where: { targetType: 'user', targetId: user.id, action: status === 'verified' ? 'host.approve' : 'host.reject' },
    orderBy: { createdAt: 'desc' },
  });
  return {
    status,
    decidedAt: last?.createdAt.toISOString(),
    reason: status === 'rejected' ? (last?.details?.reason ?? undefined) : undefined,
  };
};

o.toResponse = (charger, user, review) => ({
  fullName: user.fullName ?? '',
  address: user.address ?? '',
  location: charger.locationType,
  areaId: charger.areaId,
  coordinates: { latitude: charger.latitude, longitude: charger.longitude },
  instructions: charger.instructions,
  connectors: charger.connectors,
  powerKw: charger.powerKw,
  reportsEnergy: charger.reportsEnergy,
  photoKeys: { charger: charger.chargerPhotoKey ?? undefined, connector: charger.connectorPhotoKey ?? undefined },
  ratePaisa: charger.ratePaisa,
  hours: charger.hours,
  emergencyAvailability: charger.emergencyAvailability,
  verifiedAt: charger.verifiedAt?.toISOString(),
  listed: charger.listed,
  lastCheckInAt: charger.lastCheckInAt?.toISOString(),
  review,
});


module.exports = o;
