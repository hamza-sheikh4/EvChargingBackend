'use strict'

const crypto = require('crypto');
const admin  = require('../../config/admin');

/*
|--------------------------------------------------------------------------
| Authenticator Codes (TOTP)
|--------------------------------------------------------------------------
|
| Our own RFC 6238, the standard Google Authenticator, Authy and 1Password
| use: HMAC-SHA1 of the 30-second step count, cut down to 6 digits. Secrets
| are base32, which is what those apps expect when typed in or scanned.
|
*/

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

let o = {}

o.base32Encode = (buffer) => {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
};

o.base32Decode = (text) => {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = '';
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Not a base32 secret.');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
};

/** A new 160-bit secret, as base32. */
o.generateSecret = () => o.base32Encode(crypto.randomBytes(20));

o.stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / admin.totpPeriodSeconds);

/** The code for one time step (RFC 4226 HOTP with the step as the counter). */
o.codeAt = (secret, step, digits = admin.totpDigits) => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', o.base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(value).padStart(digits, '0');
};

/**
 * Checks a code against the current step and one either side, for clock drift.
 * Returns the matching step, or null. Pass lastStep to refuse a code already used.
 */
o.verify = (secret, code, lastStep = null, now = Date.now()) => {
  if (!/^\d{6}$/.test(code || '')) return null;
  const current = o.stepAt(now);
  for (const step of [current - 1, current, current + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    const expected = Buffer.from(o.codeAt(secret, step));
    if (crypto.timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
};

/** The otpauth:// link authenticator apps read from a QR code or a tap on a phone. */
o.uri = (secret, email) => {
  const label = encodeURIComponent(`${admin.totpIssuer}:${email}`);
  const params = new URLSearchParams({ secret, issuer: admin.totpIssuer, digits: String(admin.totpDigits), period: String(admin.totpPeriodSeconds) });
  return `otpauth://totp/${label}?${params}`;
};

module.exports = o;
