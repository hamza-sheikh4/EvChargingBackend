'use strict'

let prisma  = require('../../config/database');
let rules   = require('../Traits/SessionRules');
let metrics = require('../Traits/Metrics');
let systemLog = require('../Traits/SystemLog');

/*
|--------------------------------------------------------------------------
| Expire Unanswered Requests
|--------------------------------------------------------------------------
|
| A request the host has not answered by respondBy becomes expired, which
| frees the charger and tells both sides. Runs every 30 seconds while the
| server is up, and before any read or answer that depends on it.
|
*/

const EVERY_MS = 30 * 1000;

let o = {}
let running = null;

async function sweep() {
  const started = Date.now();
  try {
    const expired = await expireDue();
    metrics.job('expire_requests', { ms: Date.now() - started, result: { expired } });
  } catch (e) {
    metrics.job('expire_requests', { ms: Date.now() - started, error: e.message });
    systemLog.error('job', 'Expiring booking requests failed', e);
    throw e;
  }
}

async function expireDue() {
  let expired = 0;
  const due = await prisma.session.findMany({ where: { state: 'requested', respondBy: { lt: new Date() } }, take: 100 });
  for (const row of due) {
    const changed = await prisma.session.updateMany({
      where: { id: row.id, state: 'requested' },
      data: { state: 'expired', events: rules.withEvent(row.events, 'requested', 'expired', 'system') },
    });
    if (changed.count === 0) continue;
    expired += 1;
    // Loaded here so the job and the presenter do not require each other at start.
    const present = require('../Http/Controllers/v1/SessionPresenter');
    await present.broadcast({ ...row, state: 'expired' }, { driver: 'expired', host: 'expired' });
  }
  return expired;
}

/** One sweep. Calls made while a sweep runs wait for that one instead of starting another. */
o.run = () => {
  running ??= sweep().finally(() => {
    running = null;
  });
  return running;
};

o.start = () => {
  const timer = setInterval(() => o.run().catch((e) => console.error('Expiring requests failed:', e.message)), EVERY_MS);
  timer.unref();
};

module.exports = o;
