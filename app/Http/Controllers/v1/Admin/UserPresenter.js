'use strict'

const storage = require('../../../../Traits/Storage');

/*
|--------------------------------------------------------------------------
| User Presenter
|--------------------------------------------------------------------------
|
| App accounts as the admin panel reads them. Never the CNIC.
|
*/

let o = {}

const roles = (u) => [u.isDriver && 'driver', u.isHost && 'host'].filter(Boolean);

o.summary = (u) => ({
  id: u.id,
  fullName: u.fullName ?? '',
  phone: u.phone,
  email: u.email ?? null,
  roles: roles(u),
  hostStatus: u.hostVerificationStatus ?? null,
  vehicleCount: u._count?.vehicles ?? 0,
  joinedAt: u.createdAt.toISOString(),
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  suspendedAt: u.suspendedAt?.toISOString() ?? null,
});

/** One account with vehicles, chargers and past suspensions. */
o.detail = async (user, history) => ({
  ...o.summary(user),
  photoUrl: user.photoKey ? await storage.viewUrl(user.photoKey) : null,
  driverSince: user.driverOnboardedAt?.toISOString() ?? null,
  hostSince: user.hostOnboardedAt?.toISOString() ?? null,
  vehicles: user.vehicles.map((v) => ({
    id: v.id, category: v.category, manufacturer: v.manufacturer, model: v.model, connectors: v.connectors, usesAdapter: v.usesAdapter,
  })),
  chargers: user.chargers.map((c) => ({
    id: c.id, areaId: c.areaId, locationType: c.locationType, listed: c.listed, verified: c.verifiedAt !== null,
  })),
  history: history.map((entry) => ({
    action: entry.action === 'user.suspend' ? 'suspended' : 'unsuspended',
    by: entry.actorEmail,
    at: entry.createdAt.toISOString(),
    reason: entry.details?.reason ?? null,
  })),
});

module.exports = o;
