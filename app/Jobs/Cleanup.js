'use strict'

let prisma  = require('../../config/database');
let metrics = require('../Traits/Metrics');
let systemLog = require('../Traits/SystemLog');

/*
|--------------------------------------------------------------------------
| 30-day Cleanup
|--------------------------------------------------------------------------
|
| Once a day, removes Health page rows not seen for 30 days. Open bug
| reports stay until closed; closed ones go 30 days after closing. Errors
| that keep happening stay, since their last-seen time keeps moving.
| Bookings, users, the audit log and notifications are never touched.
|
*/

const KEEP_DAYS = 30;
const EVERY_MS = 24 * 60 * 60 * 1000;

let o = { KEEP_DAYS }

o.run = async () => {
  const started = Date.now();
  const cutoff = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000);
  try {
    const { count } = await prisma.systemEvent.deleteMany({
      where: {
        OR: [
          { kind: { not: 'bug_report' }, lastSeenAt: { lt: cutoff } },
          { kind: 'bug_report', status: 'resolved', resolvedAt: { lt: cutoff } },
        ],
      },
    });
    metrics.job('cleanup', { ms: Date.now() - started, result: { removed: count } });
    return count;
  } catch (e) {
    metrics.job('cleanup', { ms: Date.now() - started, error: e.message });
    systemLog.error('job', '30-day cleanup failed', e);
    return 0;
  }
};

o.start = () => {
  setTimeout(() => o.run(), 60 * 1000).unref();
  setInterval(() => o.run(), EVERY_MS).unref();
};

module.exports = o;
