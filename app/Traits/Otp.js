'use strict'

const crypto = require('crypto');
const auth   = require('../../config/auth');

let o = {}

/** A random code of the configured length, such as 0427. */
o.generate = () => String(crypto.randomInt(0, 10 ** auth.otpDigits)).padStart(auth.otpDigits, '0');

/** Codes are stored hashed with the phone, so the database never holds a usable code. */
o.hash = (phone, code) => crypto.createHmac('sha256', auth.otpSecret).update(`${phone}:${code}`).digest('hex');

o.matches = (phone, code, codeHash) => {
  const given = Buffer.from(o.hash(phone, code), 'hex');
  const saved = Buffer.from(codeHash, 'hex');
  return given.length === saved.length && crypto.timingSafeEqual(given, saved);
};

/** Dev mode: any code passes except the one kept for testing the "wrong code" state. */
o.devAccepts = (code) => code !== auth.otpRejectedDevCode;

module.exports = o;
