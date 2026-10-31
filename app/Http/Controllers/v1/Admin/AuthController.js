'use strict'

const json     = require('../../../../Traits/ApiResponser');
const audit    = require('../../../../Traits/AdminAudit');
const password = require('../../../../Traits/Password');
const totp     = require('../../../../Traits/Totp');
const crypto   = require('../../../../Traits/Crypto');
const prisma   = require('../../../../../config/database');
const config   = require('../../../../../config/admin');
const session  = require('./AdminSession');
const systemLog = require('../../../../Traits/SystemLog');

const WRONG = 'That email and password do not match.';

let o = {}

const lockedFor = (admin) => (admin.lockedUntil && admin.lockedUntil > new Date() ? admin.lockedUntil : null);

const lockedMessage = (until) => {
  const minutes = Math.max(1, Math.ceil((until - Date.now()) / 60000));
  return `Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
};

/** Counts a wrong password or code. The fifth in a row locks the account for 15 minutes. */
async function recordFailure(admin) {
  const failures = admin.failedLogins + 1;
  const lock = failures >= config.maxFailedLogins;
  systemLog.security(lock ? 'Admin account locked after wrong attempts' : 'Admin sign-in failed', { level: lock ? 'error' : 'warn' });
  await prisma.admin.update({
    where: { id: admin.id },
    data: lock
      ? { failedLogins: 0, lockedUntil: new Date(Date.now() + config.lockMinutes * 60000) }
      : { failedLogins: failures },
  });
}

/** Signs the admin in: clears failures, sets the cookie, logs it. */
async function finish(req, res, admin, extra = {}) {
  const updated = await prisma.admin.update({
    where: { id: admin.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), ...extra },
  });
  session.start(res, updated);
  req.admin = updated;
  await audit.log(req, 'auth.login', 'admin', updated.id);
  json.successResponse(res, { twoFactor: false, admin: session.profile(updated) });
}

/** Step 1: email and password. With 2FA on, answers a short challenge for step 2 instead of signing in. */
o.login = async (req, res, next) => {
  try {
    const admin = await prisma.admin.findUnique({ where: { email: req.body.email } });
    if (!admin) {
      systemLog.security('Admin sign-in with an unknown email');
      await password.dummyVerify(req.body.password);
      return json.errorResponse(res, WRONG, 401);
    }
    const locked = lockedFor(admin);
    if (locked) return json.errorResponse(res, lockedMessage(locked), 429);
    if (!(await password.verify(req.body.password, admin.passwordHash))) {
      await recordFailure(admin);
      return json.errorResponse(res, WRONG, 401);
    }
    if (admin.status !== 'active') return json.errorResponse(res, 'This account is suspended. Ask the super admin.', 403);
    if (admin.twoFactorEnabledAt) {
      return json.successResponse(res, { twoFactor: true, challenge: session.challenge(admin) });
    }
    await finish(req, res, admin);
  } catch (e) {
    next(e);
  }
}

/** Step 2, only with 2FA on: the 6-digit code from the authenticator app. */
o.twoFactor = async (req, res, next) => {
  try {
    const admin = await session.readChallenge(req.body.challenge);
    if (!admin || !admin.twoFactorEnabledAt || admin.status !== 'active') {
      return json.errorResponse(res, 'That sign-in has expired. Enter your password again.', 401);
    }
    const locked = lockedFor(admin);
    if (locked) return json.errorResponse(res, lockedMessage(locked), 429);
    const step = totp.verify(crypto.decrypt(admin.twoFactorSecret), req.body.code, admin.twoFactorLastStep);
    if (step === null) {
      await recordFailure(admin);
      return json.errorResponse(res, 'That code is not right. Check the app and try again.', 401);
    }
    await finish(req, res, admin, { twoFactorLastStep: step });
  } catch (e) {
    next(e);
  }
}

/** Ends this browser's login. Works even when the login has already expired. */
o.logout = (req, res) => {
  session.end(res);
  json.successResponse(res, { signedOut: true });
}

module.exports = o;
