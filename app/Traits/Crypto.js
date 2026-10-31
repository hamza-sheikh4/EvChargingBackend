'use strict'

const crypto = require('crypto');

/*
|--------------------------------------------------------------------------
| Field Encryption
|--------------------------------------------------------------------------
|
| AES-256-GCM for personal numbers kept at rest, such as the CNIC (vision
| 10.5). Stored as iv:tag:ciphertext in hex. Never logged, never sent back.
|
*/

function key() {
  const hex = process.env.CNIC_ENCRYPTION_KEY || '';
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('CNIC_ENCRYPTION_KEY must be 64 hex characters (see .env-example).');
  return Buffer.from(hex, 'hex');
}

let o = {}

o.encrypt = (text) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString('hex')).join(':');
};

o.decrypt = (stored) => {
  const [iv, tag, data] = stored.split(':').map((part) => Buffer.from(part, 'hex'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
};

module.exports = o;
