'use strict'

const rateLimit = require('express-rate-limit');
const metrics   = require('../app/Traits/Metrics');
const systemLog = require('../app/Traits/SystemLog');

/*
|--------------------------------------------------------------------------
| Rate Limits
|--------------------------------------------------------------------------
|
| Every limit counts toward the Health page and logs a security event once
| an hour per route. Limits after sign-in count per user, so people behind
| one mobile network address do not share a limit; the rest count per IP.
|
*/

const MINUTE = 60 * 1000;

const limit = ({ minutes, max, error, perUser = false }) => rateLimit({
  windowMs: minutes * MINUTE,
  limit: max,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error, code: 429 },
  ...(perUser ? { keyGenerator: (req) => `user:${req.user.id}` } : {}),
  handler: (req, res, next, options) => {
    metrics.rateLimited();
    systemLog.security(`Rate limit hit on ${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`);
    res.status(options.statusCode).json(options.message);
  },
});

module.exports = {
  // Sign-in and sign-up codes, on top of the per-number limits in AuthController.
  auth: limit({ minutes: 15, max: 30, error: 'Too many attempts. Try again later.' }),
  // Telemetry needs no login, so it gets its own limit.
  telemetry: limit({ minutes: 15, max: 120, error: 'Too many reports. Try again later.' }),
  // A host sends a listing once, or again after a rejection.
  listing: limit({ minutes: 60, max: 10, error: 'Too many listing attempts. Try again later.', perUser: true }),
  // The map refreshes every 15 to 30 seconds while open (vision 8.2), well under this.
  search: limit({ minutes: 1, max: 60, error: 'Too many searches. Try again in a minute.', perUser: true }),
  waitlist: limit({ minutes: 15, max: 10, error: 'Too many sign-ups. Try again later.' }),
};
