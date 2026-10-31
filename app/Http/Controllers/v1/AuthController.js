'use strict'

const jwt    = require('jsonwebtoken');
const json   = require('../../../Traits/ApiResponser');
const otp    = require('../../../Traits/Otp');
const sms    = require('../../../Traits/Sms');
const prisma = require('../../../../config/database');
const auth   = require('../../../../config/auth');
const systemLog = require('../../../Traits/SystemLog');

const SECOND = 1000;
const HOUR   = 60 * 60 * SECOND;
const SUSPENDED = 'This account is suspended. Contact PakVolt support.';

let o = {}

/** Sends a login code, limited per number. Answers the same whether or not the number has an account. */
o.requestOtp = async (req, res, next) => {
  try {
    const { phone } = req.body;
    const now = Date.now();
    const recent = await prisma.otpCode.findMany({
      where: { phone, createdAt: { gte: new Date(now - HOUR) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent[0] && now - recent[0].createdAt.getTime() < auth.otpResendSeconds * SECOND) {
      return json.errorResponse(res, 'Please wait a moment before asking for a new code.', 429);
    }
    if (recent.length >= auth.otpMaxPerHour) {
      systemLog.security('Sign-in code limit hit (5 an hour per number)');
      return json.errorResponse(res, 'Too many codes requested. Try again in an hour.', 429);
    }
    const code = otp.generate();
    await prisma.otpCode.create({
      data: { phone, codeHash: otp.hash(phone, code), expiresAt: new Date(now + auth.otpTtlMinutes * 60 * SECOND) },
    });
    await sms.send(phone, code);
    json.successResponse(res, { sent: true });
  } catch (e) {
    next(e);
  }
}

/** Checks the code. A wrong, expired or used code answers { token: null }, as the app expects. */
o.verifyOtp = async (req, res, next) => {
  try {
    const { phone, code } = req.body;
    const active = await prisma.otpCode.findFirst({
      where: { phone, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!active || active.attempts >= auth.otpMaxAttempts) return json.successResponse(res, { token: null });

    const accepted = auth.otpDevMode ? otp.devAccepts(code) : otp.matches(phone, code, active.codeHash);
    if (!accepted) {
      await prisma.otpCode.update({ where: { id: active.id }, data: { attempts: { increment: 1 } } });
      return json.successResponse(res, { token: null });
    }

    // Marking it used only if still unused stops the same code logging in twice.
    const claimed = await prisma.otpCode.updateMany({ where: { id: active.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count === 0) return json.successResponse(res, { token: null });

    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing?.suspendedAt) {
      systemLog.security('A suspended user tried to sign in');
      return json.errorResponse(res, SUSPENDED, 403);
    }

    const user = await prisma.user.upsert({
      where: { phone },
      create: { phone, lastLoginAt: new Date() },
      update: { lastLoginAt: new Date() },
    });
    json.successResponse(res, { token: o.sign(user) });
  } catch (e) {
    next(e);
  }
}

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
