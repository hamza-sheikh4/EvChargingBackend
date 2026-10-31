'use strict'

const json     = require('../../../../Traits/ApiResponser');
const audit    = require('../../../../Traits/AdminAudit');
const password = require('../../../../Traits/Password');
const totp     = require('../../../../Traits/Totp');
const crypto   = require('../../../../Traits/Crypto');
const prisma   = require('../../../../../config/database');
const session  = require('./AdminSession');
const systemLog = require('../../../../Traits/SystemLog');

let o = {}

/** The signed-in admin. */
o.me = (req, res) => json.successResponse(res, session.profile(req.admin));

/** Changes the password and signs out every other device. This browser stays signed in. */
o.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!(await password.verify(currentPassword, req.admin.passwordHash))) {
      return json.errorResponse(res, 'Your current password is not right.', 422);
    }
    const admin = await prisma.admin.update({
      where: { id: req.admin.id },
      data: { passwordHash: await password.hash(newPassword), tokenVersion: { increment: 1 } },
    });
    session.start(res, admin);
    await audit.log(req, 'account.password', 'admin', admin.id);
    json.successResponse(res, { changed: true });
  } catch (e) {
    next(e);
  }
}

/** Ends every login for this admin, including this one. */
o.signOutAll = async (req, res, next) => {
  try {
    await prisma.admin.update({ where: { id: req.admin.id }, data: { tokenVersion: { increment: 1 } } });
    await audit.log(req, 'account.sign_out_all', 'admin', req.admin.id);
    systemLog.security('An admin signed out everywhere', { level: 'info' });
    session.end(res);
    json.successResponse(res, { signedOut: true });
  } catch (e) {
    next(e);
  }
}

/** 2FA step 1: a new secret to add to the authenticator app. It only counts once a code confirms it. */
o.setupTwoFactor = async (req, res, next) => {
  try {
    if (req.admin.twoFactorEnabledAt) return json.errorResponse(res, '2FA is already on.', 409);
    const secret = totp.generateSecret();
    await prisma.admin.update({ where: { id: req.admin.id }, data: { twoFactorSecret: crypto.encrypt(secret) } });
    json.successResponse(res, { secret, uri: totp.uri(secret, req.admin.email) });
  } catch (e) {
    next(e);
  }
}

/** 2FA step 2: a code from the app proves it was added, and turns 2FA on. */
o.enableTwoFactor = async (req, res, next) => {
  try {
    const { twoFactorSecret, twoFactorEnabledAt } = req.admin;
    if (twoFactorEnabledAt) return json.errorResponse(res, '2FA is already on.', 409);
    if (!twoFactorSecret) return json.errorResponse(res, 'Start the setup again.', 409);
    const step = totp.verify(crypto.decrypt(twoFactorSecret), req.body.code);
    if (step === null) return json.errorResponse(res, 'That code is not right. Check the app and try again.', 422);
    await prisma.admin.update({
      where: { id: req.admin.id },
      data: { twoFactorEnabledAt: new Date(), twoFactorLastStep: step },
    });
    await audit.log(req, 'account.two_factor_on', 'admin', req.admin.id);
    json.successResponse(res, { enabled: true });
  } catch (e) {
    next(e);
  }
}

/** Turns 2FA off. Needs the password, so a borrowed open session cannot do it. */
o.disableTwoFactor = async (req, res, next) => {
  try {
    if (!(await password.verify(req.body.password, req.admin.passwordHash))) {
      return json.errorResponse(res, 'Your password is not right.', 422);
    }
    await prisma.admin.update({
      where: { id: req.admin.id },
      data: { twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorLastStep: null },
    });
    await audit.log(req, 'account.two_factor_off', 'admin', req.admin.id);
    json.successResponse(res, { enabled: false });
  } catch (e) {
    next(e);
  }
}

module.exports = o;
