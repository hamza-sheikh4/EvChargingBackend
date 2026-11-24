'use strict'

const { z } = require('zod');
const auth  = require('../../../config/auth');

const email = z.string().trim().toLowerCase().max(254).pipe(z.email({ error: 'Enter a valid email.' }));
const password = z.string()
  .min(auth.passwordMin, { error: `Use at least ${auth.passwordMin} characters.` })
  .max(auth.passwordMax)
  .regex(/\d/, { error: 'Include at least one number.' });
const purpose = z.enum(['login', 'register', 'reset']);
const code = z.string().regex(new RegExp(`^\\d{${auth.otpDigits}}$`), { error: 'Enter the code we sent.' });

exports.register = z.object({ email, password });
exports.login = z.object({ email, password: z.string().min(1).max(auth.passwordMax) });
exports.sendOtp = z.object({ email, purpose });
exports.verifyOtp = z.object({ email, purpose, code });
exports.resetPassword = z.object({ resetToken: z.string().min(1).max(2000), password });
