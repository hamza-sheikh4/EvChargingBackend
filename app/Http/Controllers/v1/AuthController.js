'use strict'

const jwt    = require('jsonwebtoken');
const json   = require('../../../Traits/ApiResponser');
const otp    = require('../../../Traits/Otp');
const mail   = require('../../../Traits/Mail');
const templates = require('../../../Traits/MailTemplates');
const passwords = require('../../../Traits/Password');
const prisma = require('../../../../config/database');
const auth   = require('../../../../config/auth');
const systemLog = require('../../../Traits/SystemLog');

const SECOND = 1000;
const HOUR   = 60 * 60 * SECOND;
const SUSPENDED = 'This account is suspended. Contact PakVolt support.';
const WRONG = 'Email or password is incorrect.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let o = {}

/** Emails a code, limited per address. Too soon or too many sends nothing and says nothing, so replies stay neutral. */
async function sendCode(email, purpose) {
  const now = Date.now();
  const recent = await prisma.otpCode.findMany({
    where: { email, createdAt: { gte: new Date(now - HOUR) } },
    orderBy: { createdAt: 'desc' },
  });
  if (recent[0] && now - recent[0].createdAt.getTime() < auth.otpResendSeconds * SECOND) return;
  if (recent.length >= auth.otpMaxPerHour) {
    systemLog.security('Email code limit hit (5 an hour per address)');
    return;
  }
  const code = otp.generate();
  await prisma.otpCode.create({
    data: { email, purpose, codeHash: otp.hash(email, purpose, code), expiresAt: new Date(now + auth.otpTtlMinutes * 60 * SECOND) },
  });
  const { subject, text, html } = templates[purpose]({ code, minutes: auth.otpTtlMinutes });
  await mail.send(email, subject, text, html);
}

/** Creates the account, unverified, and emails the code that verifies it. */
o.register = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing?.emailVerifiedAt) return json.errorResponse(res, 'An account with this email already exists. Sign in instead.', 409);
    const passwordHash = await passwords.hash(password);
    await prisma.user.upsert({ where: { email }, create: { email, passwordHash }, update: { passwordHash } });
    await sendCode(email, 'register');
    json.successResponse(res, { sent: true }, 201);
  } catch (e) {
    next(e);
  }
}

/** Sends a code for login, register (verify again) or reset. Answers the same whether or not the account exists. */
o.sendOtp = async (req, res, next) => {
  try {
    const { email, purpose } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    const eligible = user && !user.suspendedAt && (purpose === 'register' ? !user.emailVerifiedAt : user.emailVerifiedAt);
    if (eligible) await sendCode(email, purpose);
    json.successResponse(res, { sent: true });
  } catch (e) {
    next(e);
  }
}

/**
 * Checks the code. A wrong, expired or used code answers { token: null }.
 * Login and register answer { token }; reset answers { resetToken }.
 */
o.verifyOtp = async (req, res, next) => {
  try {
    const { email, purpose, code } = req.body;
    const active = await prisma.otpCode.findFirst({
      where: { email, purpose, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!active || active.attempts >= auth.otpMaxAttempts) return json.successResponse(res, { token: null });

    if (!otp.matches(email, purpose, code, active.codeHash)) {
      await prisma.otpCode.update({ where: { id: active.id }, data: { attempts: { increment: 1 } } });
      return json.successResponse(res, { token: null });
    }

    // Marking it used only if still unused stops the same code working twice.
    const claimed = await prisma.otpCode.updateMany({ where: { id: active.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count === 0) return json.successResponse(res, { token: null });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return json.successResponse(res, { token: null });
    if (user.suspendedAt) {
      systemLog.security('A suspended user tried to sign in');
      return json.errorResponse(res, SUSPENDED, 403);
    }
    if (purpose === 'reset') return json.successResponse(res, { resetToken: o.signReset(user) });

    const signedIn = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), ...(purpose === 'register' ? { emailVerifiedAt: user.emailVerifiedAt ?? new Date() } : {}) },
    });
    json.successResponse(res, { token: o.sign(signedIn) });
  } catch (e) {
    next(e);
  }
}

/** Email and password. Never says which of the two was wrong. */
o.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = user?.passwordHash ? await passwords.verify(password, user.passwordHash) : await passwords.dummyVerify(password);
    if (!ok) {
      systemLog.security('App sign-in failed');
      return json.errorResponse(res, WRONG, 401);
    }
    if (user.suspendedAt) {
      systemLog.security('A suspended user tried to sign in');
      return json.errorResponse(res, SUSPENDED, 403);
    }
    if (!user.emailVerifiedAt) {
      await sendCode(email, 'register');
      return json.errorResponse(res, 'Verify your email first. We sent you a new code.', 403, 'email_not_verified');
    }
    const signedIn = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    json.successResponse(res, { token: o.sign(signedIn) });
  } catch (e) {
    next(e);
  }
}

/** Sets a new password with the token from a verified reset code, then signs the account out everywhere. */
o.resetPassword = async (req, res, next) => {
  try {
    const { resetToken, password } = req.body;
    const invalid = () => json.errorResponse(res, 'This reset link has expired. Ask for a new code.', 401);
    const userId = jwt.decode(resetToken)?.sub;
    const user = UUID.test(userId) ? await prisma.user.findUnique({ where: { id: userId } }) : null;
    if (!user || user.suspendedAt) return invalid();
    try {
      jwt.verify(resetToken, o.resetSecret(user), { audience: 'password-reset' });
    } catch {
      return invalid();
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await passwords.hash(password), tokenVersion: { increment: 1 }, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
    });
    json.successResponse(res, { reset: true });
  } catch (e) {
    next(e);
  }
}

/** Tied to the current password hash, so a reset token works once: the reset itself changes the hash. */
o.resetSecret = (user) => `${auth.jwtSecret}:reset:${user.passwordHash ?? ''}`;

o.signReset = (user) => jwt.sign({}, o.resetSecret(user), { subject: user.id, audience: 'password-reset', expiresIn: `${auth.resetMinutes}m` });

o.sign = (user) => jwt.sign({ v: user.tokenVersion }, auth.jwtSecret, { subject: user.id, expiresIn: auth.jwtExpiresIn });

/** Middleware: requires a valid token in x-access-token and puts the user on req.user. */
o.authenticate = async (req, res, next) => {
  try {
    const token = req.headers['x-access-token'];
    if (!token) return json.errorResponse(res, 'Please log in.', 401);
    let payload;
    try {
      payload = jwt.verify(token, auth.jwtSecret);
    } catch {
      return json.errorResponse(res, 'Your login has expired. Please log in again.', 401);
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    // A raised token_version logs the user out everywhere. Suspending raises it too; the check is a backstop.
    if (!user || user.tokenVersion !== payload.v || user.suspendedAt) return json.errorResponse(res, 'Please log in again.', 401);
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = o;
