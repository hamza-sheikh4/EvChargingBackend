'use strict'

const { z } = require('zod');

const connector = z.enum(['type2', 'ccs2', 'chademo', 'gbt']);

const fullName = z.string().trim().min(2, { error: 'Enter your full name.' }).max(100);
const email = z.union([z.literal(''), z.email({ error: 'Enter a valid email.' })]);
const photoKey = z.string().max(300);

const vehicle = z.object({
  category: z.enum(['car', 'bike']),
  manufacturer: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  connectors: z.array(connector).min(1, { error: 'Pick at least one connector.' }),
  usesAdapter: z.boolean(),
});

/** The driver's onboarding answers (SaveDriverRequest in the app). */
exports.saveDriver = z.object({
  profile: z.object({ fullName, email: email.optional(), photoKey: photoKey.optional() }),
  vehicle,
});

/** Profile edits. Only the fields sent change. */
exports.updateProfile = z.object({ fullName: fullName.optional(), email: email.optional(), photoKey: photoKey.optional() });

exports.saveVehicle = vehicle;
