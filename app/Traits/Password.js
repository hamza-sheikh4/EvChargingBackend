'use strict'

const crypto = require('crypto');
const { promisify } = require('util');

/*
|--------------------------------------------------------------------------
| Passwords
|--------------------------------------------------------------------------
|
| scrypt from Node's crypto: slow and memory-hard on purpose. Stored as
| scrypt$N$r$p$salt$hash so the cost can be raised later without breaking
| existing passwords.
|
*/

const scrypt = promisify(crypto.scrypt);
const COST = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
// No 0/O, 1/l/I: temporary passwords are read off a screen and typed in.
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

let o = {}

o.hash = async (password) => {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('hex'), key.toString('hex')].join('$');
};

o.verify = async (password, stored) => {
  const [scheme, N, r, p, salt, hash] = (stored || '').split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'hex');
  const key = await scrypt(password, Buffer.from(salt, 'hex'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(key, expected);
};

/** A hash of nothing, so a login for an unknown email takes as long as a real one. */
let dummy;
o.dummyVerify = async (password) => {
  dummy ??= await o.hash(crypto.randomBytes(16).toString('hex'));
  await o.verify(password, dummy);
  return false;
};

/** A 16-character password for a new admin or a reset. Shown once, then changed in Settings. */
o.temporary = (length = 16) => {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (byte) => TEMP_ALPHABET[byte % TEMP_ALPHABET.length]).join('');
};

module.exports = o;
