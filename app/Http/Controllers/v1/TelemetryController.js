'use strict'

let json      = require('../../../Traits/ApiResponser');
let storage   = require('../../../Traits/Storage');
let systemLog = require('../../../Traits/SystemLog');

/*
|--------------------------------------------------------------------------
| Telemetry
|--------------------------------------------------------------------------
|
| Where the app, the admin site and the landing site report problems, for
| the admin Health page. No login needed for errors and app opens (a page
| that crashed may have none); bug reports need one, so the team can follow
| up. Everything is scrubbed of personal data before it is saved.
|
*/

let o = {}

const day = () => new Date().toISOString().slice(0, 10);

/** A crash or error. Network problems are grouped per day, place and message, so a bad hour is one row. */
o.error = async (req, res, next) => {
  try {
    const b = req.body;
    const network = b.type === 'network';
    await systemLog.record({
      kind: b.type === 'crash' ? 'crash' : 'error',
      source: b.source,
      level: network ? 'warn' : 'error',
      title: network ? `Network: ${b.title}` : b.title,
      message: b.message,
      stack: b.stack,
      context: { type: b.type, where: b.where, osVersion: b.osVersion, env: b.env },
      appVersion: b.appVersion,
      platform: b.platform,
      device: b.device,
      ...(network ? { fingerprint: `network:${b.source}:${day()}:${b.where}:${b.title}`.slice(0, 300) } : {}),
    });
    json.successResponse(res, { received: true }, 202);
  } catch (e) {
    next(e);
  }
}

/** One app open, counted per day, app version and platform. */
o.ping = async (req, res, next) => {
  try {
    const b = req.body;
    const version = b.appVersion || 'unknown';
    const platform = b.platform || 'unknown';
    await systemLog.record({
      kind: 'ping',
      source: 'mobile',
      level: 'info',
      title: `App opened (${version}, ${platform})`,
      context: { day: day(), env: b.env },
      appVersion: version,
      platform,
      fingerprint: `ping:${day()}:${version}:${platform}`,
    });
    json.successResponse(res, { received: true }, 202);
  } catch (e) {
    next(e);
  }
}

/** A bug report, with an optional screenshot from the reporter's own uploads. Never grouped. */
o.bugReport = async (req, res, next) => {
  try {
    const b = req.body;
    if (b.screenshotKey && !(storage.ownsKey(b.screenshotKey, 'bug_screenshot', req.user.id) && (await storage.exists(b.screenshotKey)))) {
      return json.errorResponse(res, 'The screenshot did not upload. Please try again.', 422);
    }
    await systemLog.record({
      kind: 'bug_report',
      source: 'mobile',
      level: 'warn',
      title: b.description.split('\n')[0].slice(0, 120),
      message: b.description,
      context: { role: b.role, where: b.where, osVersion: b.osVersion, env: b.env },
      appVersion: b.appVersion,
      platform: b.platform,
      device: b.device,
      userId: req.user.id,
      screenshotKey: b.screenshotKey,
      unique: true,
    });
    json.successResponse(res, { received: true }, 201);
  } catch (e) {
    next(e);
  }
}

module.exports = o;
