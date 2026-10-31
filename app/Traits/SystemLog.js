'use strict'

const crypto = require('crypto');
const prisma = require('../../config/database');
const scrub  = require('./Scrub');

/*
|--------------------------------------------------------------------------
| System Log
|--------------------------------------------------------------------------
|
| Writes to system_events for the admin Health page. The same error twice
| is one row with a count: its fingerprint is the kind, source, title and
| first line of the stack. A resolved error that happens again reopens.
| Never throws: logging must not break what it is logging.
|
*/

let o = {}

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 40);

o.fingerprintFor = ({ kind, source, title, stack }) =>
  hash([kind, source, title, (stack || '').split('\n').slice(0, 2).join('|')].join('::'));

/**
 * One event. kind, source, title are required. fingerprint groups repeats; leave it out to
 * group by title and stack. unique: true always adds a new row (bug reports, uptime checks).
 */
o.record = async (event) => {
  try {
    const title = scrub.text(event.title) || 'Untitled';
    const data = {
      kind: event.kind,
      source: event.source,
      level: event.level || 'error',
      title,
      message: scrub.text(event.message),
      stack: scrub.text(event.stack),
      context: event.context ? scrub.json(event.context) : undefined,
      appVersion: scrub.text(event.appVersion),
      platform: scrub.text(event.platform),
      device: scrub.text(event.device),
      userId: event.userId,
      screenshotKey: event.screenshotKey,
    };
    const fingerprint = event.unique
      ? `${event.kind}:${crypto.randomUUID()}`
      : event.fingerprint || o.fingerprintFor({ ...event, title });
    const now = new Date();
    return await prisma.systemEvent.upsert({
      where: { fingerprint },
      create: { ...data, fingerprint, firstSeenAt: now, lastSeenAt: now },
      update: {
        count: { increment: event.increment ?? 1 },
        lastSeenAt: now,
        message: data.message,
        context: data.context,
        appVersion: data.appVersion,
        // It happened again, so it is not resolved any more.
        status: 'open',
        resolvedAt: null,
        resolvedBy: null,
      },
    });
  } catch (e) {
    console.error('Could not write a system event:', e.message);
    return null;
  }
};

/** Shorthand for a failure inside the server. */
o.error = (source, title, error, context) =>
  o.record({ kind: 'error', source, title, message: error?.message, stack: error?.stack, context });

/** Shorthand for a log line, grouped per hour so a busy event stays one row an hour. */
o.event = (title, { level = 'info', source = 'api', context } = {}) =>
  o.record({ kind: 'event', source, level, title, context, fingerprint: `event:${hash(title)}:${new Date().toISOString().slice(0, 13)}` });

/** A security event, grouped per hour and type. */
o.security = (title, { level = 'warn', context } = {}) =>
  o.record({ kind: 'security', source: 'api', level, title, context, fingerprint: `security:${hash(title)}:${new Date().toISOString().slice(0, 13)}` });

module.exports = o;
