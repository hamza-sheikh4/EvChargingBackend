'use strict'

const auth  = require('../../config/auth');
const phone = require('./Phone');

let o = {}

/**
 * Sends a text message. TODO(sms): connect the SMS provider. Until then only dev
 * mode works, and nothing is sent. The code itself is never logged.
 */
o.send = async (to) => {
  if (auth.otpDevMode) {
    console.log(`[sms] dev mode, not sent to ${phone.mask(to)}`);
    return;
  }
  throw new Error('No SMS provider is configured.');
};

module.exports = o;
