'use strict'

const jwt    = require('jsonwebtoken');
const json   = require('../../../../Traits/ApiResponser');
const prisma = require('../../../../../config/database');
const config = require('../../../../../config/admin');

/*
|--------------------------------------------------------------------------
| Admin Session
|--------------------------------------------------------------------------
|
| Issues and checks the admin login cookie, and the permission guard used
| on every /admin route. Audiences keep the 12-hour login and the 5-minute
| 2FA challenge from ever standing in for each other.
|
*/

const SESSION = 'admin';
const CHALLENGE = 'admin-2fa';

let o = {}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure,
  path: config.cookiePath,
});

o.start = (res, admin) => {
  const token = jwt.sign({ v: admin.tokenVersion }, config.jwtSecret, {
    subject: admin.id,
    audience: SESSION,
    expiresIn: `${config.sessionHours}h`,
  });
  res.cookie(config.cookieName, token, { ...cookieOptions(), maxAge: config.sessionHours * 60 * 60 * 1000 });
};

o.end = (res) => res.clearCookie(config.cookieName, cookieOptions());

o.challenge = (admin) =>
  jwt.sign({ v: admin.tokenVersion }, config.jwtSecret, {
    subject: admin.id,
    audience: CHALLENGE,
    expiresIn: `${config.challengeMinutes}m`,
  });

/** The admin a 2FA challenge belongs to, or null if it is expired, forged or outdated. */
o.readChallenge = async (challenge) => {
  try {
    const payload = jwt.verify(challenge, config.jwtSecret, { audience: CHALLENGE });
    const admin = await prisma.admin.findUnique({ where: { id: payload.sub } });
    return admin && admin.tokenVersion === payload.v ? admin : null;
  } catch {
    return null;
  }
};

/** Middleware: requires a live admin login and puts the admin on req.admin. */
o.authenticate = async (req, res, next) => {
  try {
    const token = readCookie(req, config.cookieName);
    if (!token) return json.errorResponse(res, 'Please sign in.', 401);
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { audience: SESSION });
    } catch {
      return json.errorResponse(res, 'Your session has ended. Please sign in again.', 401);
    }
    const admin = await prisma.admin.findUnique({ where: { id: payload.sub } });
    if (!admin || admin.tokenVersion !== payload.v || admin.status !== 'active') {
      o.end(res);
      return json.errorResponse(res, 'Please sign in again.', 401);
    }
    req.admin = admin;
    next();
  } catch (e) {
    next(e);
  }
};

o.has = (admin, permission) => admin.role === 'superadmin' || admin.permissions.includes(permission);

/** Middleware, after authenticate: allows only admins with this permission. */
o.can = (permission) => (req, res, next) =>
  o.has(req.admin, permission) ? next() : json.errorResponse(res, 'You do not have access to this.', 403);

/** The admin as the panel reads it. Never the password hash or the 2FA secret. */
o.profile = (admin) => ({
  id: admin.id,
  email: admin.email,
  fullName: admin.fullName,
  role: admin.role,
  permissions: admin.role === 'superadmin' ? config.permissions : admin.permissions,
  status: admin.status,
  twoFactorEnabled: Boolean(admin.twoFactorEnabledAt),
  lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
  createdAt: admin.createdAt.toISOString(),
});

module.exports = o;
