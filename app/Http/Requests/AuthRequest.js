'use strict'

const { z } = require('zod');
const auth  = require('../../../config/auth');
const phone = require('../../Traits/Phone');

const phoneField = z.string().regex(phone.PATTERN, { error: 'Enter a valid mobile number.' });

exports.requestOtp = z.object({ phone: phoneField });

exports.verifyOtp = z.object({
  phone: phoneField,
  code: z.string().regex(new RegExp(`^\\d{${auth.otpDigits}}$`), { error: 'Enter the code we sent.' }),
});
