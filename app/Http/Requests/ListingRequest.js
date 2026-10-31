'use strict'

const { z } = require('zod');

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Use HH:MM times.' });
const day = z.object({ open: z.boolean(), opensAt: time, closesAt: time });
const hours = z.object({ mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day });
const coordinates = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const key = z.string().min(1).max(300);

/** Price per kWh in paisa: PKR 10 to 300, as the app allows. */
const ratePaisa = z.number().int().min(1000).max(30000);
const instructions = z.string().trim().max(500);

/** The host's onboarding answers (HostListingDraft in the app). */
exports.submit = z.object({
  fullName: z.string().trim().min(3, { error: 'Enter your full name.' }).max(100),
  cnic: z.string().regex(/^\d{13}$/, { error: 'Enter the 13-digit CNIC number.' }),
  address: z.string().trim().min(10, { error: 'Enter your full address.' }).max(300),
  identity: z.object({ frontKey: key, backKey: key }),
  location: z.enum(['home', 'business']),
  areaId: z.string().min(1, { error: 'Pick your area.' }).max(100),
  coordinates,
  instructions: instructions.optional(),
  connectors: z.array(z.enum(['type2', 'ccs2', 'chademo', 'gbt'])).min(1, { error: 'Pick at least one connector.' }),
  powerKw: z.number().positive().max(400),
  reportsEnergy: z.boolean(),
  photoKeys: z.object({ charger: key.optional(), connector: key.optional() }),
  ratePaisa,
  hours,
  emergencyAvailability: z.boolean(),
});

/** Changes from the host's dashboard (UpdateListingRequest in the app). */
exports.update = z.object({
  ratePaisa: ratePaisa.optional(),
  hours: hours.optional(),
  emergencyAvailability: z.boolean().optional(),
  areaId: z.string().min(1).max(100).optional(),
  coordinates: coordinates.optional(),
  instructions: instructions.optional(),
  listed: z.boolean().optional(),
});
