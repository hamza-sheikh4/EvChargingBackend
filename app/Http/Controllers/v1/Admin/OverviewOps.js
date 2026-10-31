'use strict'

const prisma = require('../../../../../config/database');
const rules  = require('../../../../Traits/SessionRules');

/*
|--------------------------------------------------------------------------
| Overview: operations
|--------------------------------------------------------------------------
|
| Host queue, listings, coverage by area and bookings for the admin
| Overview. Days are Lahore days (UTC+5, no daylight saving).
|
*/

const DAY_MS = 24 * 60 * 60 * 1000;
const PKT_MS = 5 * 60 * 60 * 1000;

let o = {}

const ago = (days) => new Date(Date.now() - days * DAY_MS);

/** Midnight in Lahore, as a UTC Date. */
const lahoreMidnight = (daysBack = 0) => {
  const local = new Date(Date.now() + PKT_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - PKT_MS - daysBack * DAY_MS);
};

/** Counts per Lahore day for the last `days`, oldest first. */
o.perDay = (dates, days = 14) =>
  Array.from({ length: days }, (_, i) => {
    const from = lahoreMidnight(days - 1 - i);
    const to = new Date(from.getTime() + DAY_MS);
    return { day: new Date(from.getTime() + PKT_MS).toISOString().slice(0, 10), count: dates.filter((d) => d >= from && d < to).length };
  });

o.hosts = async () => {
  const [pending, oldest, decisions] = await Promise.all([
    prisma.user.count({ where: { hostVerificationStatus: 'pending' } }),
    prisma.user.findMany({
      where: { hostVerificationStatus: 'pending' },
      orderBy: { hostOnboardedAt: 'asc' },
      take: 4,
      include: { chargers: { select: { areaId: true }, take: 1 } },
    }),
    prisma.adminAction.groupBy({ by: ['action'], where: { action: { in: ['host.approve', 'host.reject'] }, createdAt: { gte: ago(7) } }, _count: true }),
  ]);
  const decided = (action) => decisions.find((d) => d.action === action)?._count ?? 0;
  return {
    pending,
    oldest: oldest.map((h) => ({ id: h.id, fullName: h.fullName ?? '', areaId: h.chargers[0]?.areaId ?? null, waitingSince: (h.hostOnboardedAt ?? h.updatedAt).toISOString() })),
    approved7d: decided('host.approve'),
    rejected7d: decided('host.reject'),
  };
};

o.listings = async () => {
  const verified = { verifiedAt: { not: null } };
  const [live, paused, inReview, quiet, emergency, byArea, bookingsByArea] = await Promise.all([
    prisma.charger.count({ where: { ...verified, listed: true } }),
    prisma.charger.count({ where: { ...verified, listed: false } }),
    prisma.charger.count({ where: { verifiedAt: null } }),
    prisma.charger.count({ where: { ...verified, listed: true, OR: [{ lastCheckInAt: null }, { lastCheckInAt: { lt: ago(7) } }] } }),
    prisma.charger.count({ where: { ...verified, listed: true, emergencyAvailability: true } }),
    prisma.charger.groupBy({ by: ['areaId'], where: { ...verified, listed: true }, _count: true }),
    prisma.session.findMany({ where: { createdAt: { gte: ago(7) } }, select: { chargerSnapshot: true } }),
  ]);
  const areas = new Map(byArea.map((a) => [a.areaId, { areaId: a.areaId, chargers: a._count, bookings7d: 0 }]));
  for (const { chargerSnapshot } of bookingsByArea) {
    const areaId = chargerSnapshot?.areaId;
    if (!areaId) continue;
    const area = areas.get(areaId) || { areaId, chargers: 0, bookings7d: 0 };
    area.bookings7d += 1;
    areas.set(areaId, area);
  }
  return {
    live, paused, inReview, quiet, emergency,
    areas: [...areas.values()].sort((a, b) => b.chargers + b.bookings7d - (a.chargers + a.bookings7d)).slice(0, 6),
  };
};

const STAGES = {
  upcoming: ['requested', 'accepted'],
  charging: ['active', 'interrupted'],
  ended: ['ended', 'awaiting_host_energy', 'billed', 'flagged', 'paid', 'disputed', 'reviewed', 'resolved'],
  closed: ['declined', 'expired', 'cancelled'],
};

/** Today by stage, charging now, 14 days of bookings, and how hosts answer (7 days). */
o.bookings = async () => {
  const [today, chargingNow, recent, waiting] = await Promise.all([
    prisma.session.groupBy({ by: ['state'], where: { createdAt: { gte: lahoreMidnight() } }, _count: true }),
    prisma.session.findMany({ where: { state: { in: STAGES.charging } }, orderBy: { updatedAt: 'desc' }, take: 5 }),
    prisma.session.findMany({ where: { createdAt: { gte: lahoreMidnight(13) } }, select: { createdAt: true, state: true, events: true } }),
    prisma.session.count({ where: { state: 'requested' } }),
  ]);
  const stage = (states) => today.filter((t) => states.includes(t.state)).reduce((n, t) => n + t._count, 0);
  const week = recent.filter((r) => r.createdAt >= ago(7));
  const answered = week.filter((r) => r.events.some((e) => e.to === 'accepted' || e.to === 'declined'));
  const accepted = week.filter((r) => r.events.some((e) => e.to === 'accepted')).length;
  const unanswered = week.filter((r) => r.state === 'expired').length;
  const responseSeconds = answered.map((r) => {
    const asked = r.events.find((e) => e.to === 'requested');
    const reply = r.events.find((e) => e.to === 'accepted' || e.to === 'declined');
    return asked && reply ? (new Date(reply.at) - new Date(asked.at)) / 1000 : null;
  }).filter((s) => s !== null);
  return {
    today: Object.fromEntries(Object.entries(STAGES).map(([name, states]) => [name, stage(states)])),
    waitingForHost: waiting,
    chargingNow: chargingNow.map((s) => ({
      id: s.id, driver: s.driverSnapshot?.firstName ?? '', host: s.chargerSnapshot?.hostName ?? '', areaId: s.chargerSnapshot?.areaId ?? null,
      state: s.state, since: s.updatedAt.toISOString(),
    })),
    daily: o.perDay(recent.map((r) => r.createdAt)),
    acceptanceRate7d: answered.length + unanswered ? accepted / (answered.length + unanswered) : null,
    avgResponseSeconds7d: responseSeconds.length ? Math.round(responseSeconds.reduce((a, b) => a + b, 0) / responseSeconds.length) : null,
    busyChargers: await prisma.session.count({ where: { state: { in: rules.BUSY } } }),
  };
};

module.exports = o;
