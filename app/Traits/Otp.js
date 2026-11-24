'use strict'

const crypto = require('crypto');
const auth   = require('../../config/auth');

let o = {}

/** A random code of the configured length, such as 042713. */
o.generate = () => String(crypto.randomInt(0, 10 ** auth.otpDigits)).padStart(auth.otpDigits, '0');

/** Codes are stored hashed with the email and purpose, so the database never holds a usable code. */
o.hash = (email, purpose, code) => crypto.createHmac('sha256', auth.otpSecret).update(`${email}:${purpose}:${code}`).digest('hex');

o.matches = (email, purpose, code, codeHash) => {
  const given = Buffer.from(o.hash(email, purpose, code), 'hex');
  const saved = Buffer.from(codeHash, 'hex');
  return given.length === saved.length && crypto.timingSafeEqual(given, saved);
};

module.exports = o;
