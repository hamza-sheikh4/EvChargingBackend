'use strict'

const { z } = require('zod');
const Phone = require('../../Traits/Phone');
const auth  = require('../../../config/auth');

const connector = z.enum(['type2', 'ccs2', 'chademo', 'gbt']);

const fullName = z.string().trim().min(2, { error: 'Enter your full name.' }).max(100);
const email = z.union([z.literal(''), z.email({ error: 'Enter a valid email.' })]);
const phone = z.string().regex(Phone.PATTERN, { error: 'Enter a 10-digit mobile number that starts with 3.' });
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
  profile: z.object({ fullName, phone, email: email.optional(), photoKey: photoKey.optional() }),
  vehicle,
});

/** Profile edits. Only the fields sent change. */
exports.updateProfile = z.object({ fullName: fullName.optional(), phone: phone.optional(), photoKey: photoKey.optional() });

exports.saveVehicle = vehicle;

/** currentPassword is needed only when the account already has a password. */
exports.changePassword = z.object({
  currentPassword: z.string().max(auth.passwordMax).optional(),
  password: z.string()
    .min(auth.passwordMin, { error: `Use at least ${auth.passwordMin} characters.` })
    .max(auth.passwordMax)
    .regex(/\d/, { error: 'Include at least one number.' }),
});

/** password is needed only when the account has one. */
exports.deleteAccount = z.object({ password: z.string().max(auth.passwordMax).optional() });
