'use strict'

let prisma  = require('../../config/database');
let fresh   = require('../Traits/Freshness');
let notify  = require('../Traits/Notify');
let metrics = require('../Traits/Metrics');
let systemLog = require('../Traits/SystemLog');

/*
|--------------------------------------------------------------------------
| Stale Listings
|--------------------------------------------------------------------------
|
| Every hour, tells each host whose listing went stale that drivers can no
| longer see it, once per stale spell: a host already told since their last
| check-in is not told again. Search already hides stale listings by itself.
|
*/

const EVERY_MS = 60 * 60 * 1000;
const KIND = 'stale';

let o = {}

o.run = async () => {
  const started = Date.now();
  try {
    const stale = await prisma.charger.findMany({
      where: { verifiedAt: { not: null }, listed: true, lastCheckInAt: { lt: fresh.staleBefore() }, host: { suspendedAt: null } },
      select: { hostId: true, lastCheckInAt: true },
      take: 500,
    });
    let told = 0;
    for (const charger of stale) {
      const already = await prisma.notification.findFirst({
        where: { userId: charger.hostId, kind: KIND, createdAt: { gte: charger.lastCheckInAt } },
        select: { id: true },
      });
      if (already) continue;
      await notify.send(charger.hostId, 'host', KIND);
      told += 1;
    }
    metrics.job('stale_listings', { ms: Date.now() - started, result: { stale: stale.length, told } });
    return told;
  } catch (e) {
    metrics.job('stale_listings', { ms: Date.now() - started, error: e.message });
    systemLog.error('job', 'Checking for stale listings failed', e);
    return 0;
  }
};

o.start = () => {
  setTimeout(() => o.run(), 2 * 60 * 1000).unref();
  setInterval(() => o.run(), EVERY_MS).unref();
};

module.exports = o;
