'use strict'

let json    = require('../../../Traits/ApiResponser');
let prisma  = require('../../../../config/database');
let storage = require('../../../Traits/Storage');

let o = {}

const PHOTO = 'profile_photo';

/** A photo key is only accepted if it is this user's and the file was really uploaded. */
const photoOk = async (key, userId) => storage.ownsKey(key, PHOTO, userId) && (await storage.exists(key));

const vehicleData = (vehicle) => ({
  category: vehicle.category,
  manufacturer: vehicle.manufacturer || null,
  model: vehicle.model || null,
  connectors: vehicle.connectors,
  usesAdapter: vehicle.usesAdapter,
});

/** The vehicle as the app reads it (SavedVehicle). */
const toVehicle = (v) => ({
  id: v.id,
  category: v.category,
  manufacturer: v.manufacturer ?? undefined,
  model: v.model ?? undefined,
  connectors: v.connectors,
  usesAdapter: v.usesAdapter,
});

/** Onboarding saves the driver's first vehicle; saving onboarding again updates that one. */
const saveFirstVehicle = async (tx, userId, vehicle) => {
  const existing = await tx.vehicle.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
  if (existing) return tx.vehicle.update({ where: { id: existing.id }, data: vehicleData(vehicle) });
  return tx.vehicle.create({ data: { ...vehicleData(vehicle), userId } });
};

/** One of this user's vehicles, or null. Never another user's. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ownVehicle = (userId, id) => (UUID.test(id) ? prisma.vehicle.findFirst({ where: { id, userId } }) : null);

/** The logged-in account as the app reads it (AccountResponse). Never the CNIC. */
o.me = async (req, res, next) => {
  try {
    const user = req.user;
    const vehicles = await prisma.vehicle.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
    json.successResponse(res, {
      phone: user.phone,
      roles: [user.isDriver && 'driver', user.isHost && 'host'].filter(Boolean),
      onboarded: { driver: Boolean(user.driverOnboardedAt), host: Boolean(user.hostOnboardedAt) },
      profile: {
        fullName: user.fullName ?? '',
        email: user.email ?? '',
        photoUrl: user.photoKey ? await storage.viewUrl(user.photoKey) : null,
        memberSince: user.createdAt.toISOString(),
      },
      vehicles: vehicles.map(toVehicle),
    });
  } catch (e) {
    next(e);
  }
}

/** Saves the driver's profile and vehicle and finishes driver onboarding. Saving again updates both. */
o.saveDriver = async (req, res, next) => {
  try {
    const { profile, vehicle } = req.body;
    const user = req.user;
    if (profile.photoKey && !(await photoOk(profile.photoKey, user.id))) {
      return json.errorResponse(res, 'The profile photo did not upload. Please try again.', 422);
    }
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          fullName: profile.fullName,
          email: profile.email || null,
          ...(profile.photoKey ? { photoKey: profile.photoKey } : {}),
          isDriver: true,
          driverOnboardedAt: user.driverOnboardedAt ?? new Date(),
        },
      });
      await saveFirstVehicle(tx, user.id, vehicle);
    });
    json.successResponse(res, { saved: true });
  } catch (e) {
    next(e);
  }
}

/** Edits the name, email or photo. Only the fields sent change. */
o.updateProfile = async (req, res, next) => {
  try {
    const { fullName, email, photoKey } = req.body;
    if (photoKey && !(await photoOk(photoKey, req.user.id))) {
      return json.errorResponse(res, 'The profile photo did not upload. Please try again.', 422);
    }
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(fullName !== undefined ? { fullName } : {}),
        ...(email !== undefined ? { email: email || null } : {}),
        ...(photoKey ? { photoKey } : {}),
      },
    });
    json.successResponse(res, { saved: true });
  } catch (e) {
    next(e);
  }
}

/** Adds a vehicle. */
o.addVehicle = async (req, res, next) => {
  try {
    const vehicle = await prisma.vehicle.create({ data: { ...vehicleData(req.body), userId: req.user.id } });
    json.successResponse(res, toVehicle(vehicle), 201);
  } catch (e) {
    next(e);
  }
}

/** Changes one of the driver's vehicles. */
o.updateVehicle = async (req, res, next) => {
  try {
    if (!(await ownVehicle(req.user.id, req.params.id))) return json.errorResponse(res, 'That vehicle was not found.', 404);
    const vehicle = await prisma.vehicle.update({ where: { id: req.params.id }, data: vehicleData(req.body) });
    json.successResponse(res, toVehicle(vehicle));
  } catch (e) {
    next(e);
  }
}

/** Removes a vehicle. A driver always keeps at least one. */
o.removeVehicle = async (req, res, next) => {
  try {
    if (!(await ownVehicle(req.user.id, req.params.id))) return json.errorResponse(res, 'That vehicle was not found.', 404);
    if ((await prisma.vehicle.count({ where: { userId: req.user.id } })) <= 1) {
      return json.errorResponse(res, 'Add another vehicle before removing this one.', 409);
    }
    await prisma.vehicle.delete({ where: { id: req.params.id } });
    json.successResponse(res, { removed: true });
  } catch (e) {
    next(e);
  }
}

module.exports = o;
