'use strict'

const { z } = require('zod');
const admin = require('../../../config/admin');

const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(160);
const password = z.string().min(1, 'Enter your password.').max(200);
const newPassword = z
  .string()
  .min(admin.passwordMinLength, `Use at least ${admin.passwordMinLength} characters.`)
  .max(200, 'That password is too long.');
const code = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app.');
/** Any action on a page needs that page's view permission, so it is added when missing. */
const withViews = (list) => {
  const set = new Set(list);
  for (const group of Object.values(admin.permissionGroups)) {
    if (group.some((permission) => set.has(permission))) set.add(group[0]);
  }
  return admin.permissions.filter((permission) => set.has(permission));
};
const permissions = z.array(z.enum(admin.permissions)).max(admin.permissions.length).transform(withViews);

let o = {}

o.login = z.object({ email, password });

o.twoFactor = z.object({ challenge: z.string().min(1).max(2000), code });

o.changePassword = z.object({ currentPassword: password, newPassword });

o.enableTwoFactor = z.object({ code });

o.disableTwoFactor = z.object({ password });

o.addMember = z.object({
  fullName: z.string().trim().min(2, 'Enter their full name.').max(80),
  email,
  permissions: z.array(z.enum(admin.permissions)).min(1, 'Give at least one permission.').transform(withViews),
});

o.updateMember = z
  .object({
    permissions: z.array(z.enum(admin.permissions)).min(1, 'Give at least one permission.').transform(withViews).optional(),
    status: z.enum(['active', 'suspended']).optional(),
  })
  .refine((body) => body.permissions || body.status, 'Nothing to change.');

o.rejectHost = z.object({
  reason: z.string().trim().min(5, 'Say why, so the host knows what to fix.').max(500, 'Keep the reason under 500 characters.'),
});

/** Pausing needs a reason for the log; listing again does not. */
o.setListed = z
  .object({
    listed: z.boolean(),
    reason: z.string().trim().max(500, 'Keep the reason under 500 characters.').optional(),
  })
  .refine((body) => body.listed || (body.reason && body.reason.length >= 5), {
    message: 'Say why you are pausing it.',
  });

o.suspendUser = z.object({
  reason: z.string().trim().min(5, 'Say why you are suspending them.').max(500, 'Keep the reason under 500 characters.'),
});

module.exports = o;
