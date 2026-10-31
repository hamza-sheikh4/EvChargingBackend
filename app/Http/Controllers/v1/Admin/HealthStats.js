'use strict'

const prisma = require('../../../../../config/database');

/*
|--------------------------------------------------------------------------
| Health Stats
|--------------------------------------------------------------------------
|
| Numbers from system_events for the Health page: the mobile app, the
| landing site, the admin site, open problems and security, plus the
| banners that light up when something crosses a limit.
|
*/

let o = {}

const since = (hours) => new Date(Date.now() - hours * 3600000);
const sum = (rows) => rows.reduce((total, row) => total + row.count, 0);

/** Opens, crash-free rate, versions in use, network problems and the latest crashes (7 days). */
o.mobile = async () => {
  const [pings, crashes, network] = await Promise.all([
    prisma.systemEvent.findMany({ where: { kind: 'ping', lastSeenAt: { gte: since(24 * 7) } } }),
    prisma.systemEvent.findMany({ where: { kind: 'crash', source: 'mobile', lastSeenAt: { gte: since(24 * 7) } }, orderBy: { lastSeenAt: 'desc' } }),
    prisma.systemEvent.findMany({ where: { kind: 'error', source: 'mobile', title: { startsWith: 'Network:' }, lastSeenAt: { gte: since(24) } } }),
  ]);
  const opens = sum(pings);
  const crashCount = sum(crashes);
  const versions = new Map();
  for (const ping of pings) {
    const key = `${ping.appVersion} ${ping.platform}`;
    const v = versions.get(key) || { version: ping.appVersion, platform: ping.platform, opens: 0, lastSeenAt: ping.lastSeenAt };
    v.opens += ping.count;
    if (ping.lastSeenAt > v.lastSeenAt) v.lastSeenAt = ping.lastSeenAt;
    versions.set(key, v);
  }
  return {
    opens7d: opens,
    crashes7d: crashCount,
    crashFreeRate: opens ? Math.max(0, 1 - crashCount / opens) : null,
    versions: [...versions.values()].sort((a, b) => b.opens - a.opens),
    networkProblems24h: sum(network),
    latestCrashes: crashes.slice(0, 5).map((c) => ({ id: c.id, title: c.title, count: c.count, lastSeenAt: c.lastSeenAt, appVersion: c.appVersion })),
  };
};

/** The last 24 hours of uptime checks, oldest first, and page errors in 7 days. */
o.landing = async () => {
  const [checks, errors] = await Promise.all([
    prisma.systemEvent.findMany({ where: { kind: 'uptime', firstSeenAt: { gte: since(24) } }, orderBy: { firstSeenAt: 'asc' } }),
    prisma.systemEvent.findMany({ where: { source: 'landing', kind: { in: ['error', 'crash'] }, lastSeenAt: { gte: since(24 * 7) } } }),
  ]);
  const strip = checks.map((c) => ({ at: c.firstSeenAt, up: c.level !== 'error', ms: c.context?.ms ?? null, status: c.context?.status ?? null }));
  const up = strip.filter((c) => c.up).length;
  return { checks: strip, uptime24h: strip.length ? up / strip.length : null, last: strip[strip.length - 1] ?? null, errors7d: sum(errors) };
};

/** Open problems and security activity at a glance. */
o.totals = async () => {
  const [openErrors, openBugs, security, adminErrors] = await Promise.all([
    prisma.systemEvent.count({ where: { kind: { in: ['error', 'crash'] }, status: 'open', NOT: { title: { startsWith: 'Network:' } } } }),
    prisma.systemEvent.count({ where: { kind: 'bug_report', status: 'open' } }),
    prisma.systemEvent.findMany({ where: { kind: 'security', lastSeenAt: { gte: since(24) } } }),
    prisma.systemEvent.findMany({ where: { source: 'admin', kind: { in: ['error', 'crash'] }, lastSeenAt: { gte: since(24 * 7) } } }),
  ]);
  return { openErrors, openBugReports: openBugs, security24h: sum(security), adminErrors7d: sum(adminErrors) };
};

/**
 * The banners at the top of the page, worst first. Each has a level (error or warn) and an id
 * the page turns into words. Limits are set here.
 */
o.banners = ({ api, database, storage, realtime, environment, jobs, mobile, landing }) => {
  const list = [];
  const add = (level, id, value) => list.push({ level, id, value });
  if (!database.ok) add('error', 'database_down', database.error);
  else if (database.queryMs > 500) add('warn', 'database_slow', database.queryMs);
  if (database.ok && database.migrations.failed.length) add('error', 'migration_failed', database.migrations.failed.join(', '));
  if (database.ok && database.migrations.pending.length) add('warn', 'migration_pending', database.migrations.pending.length);
  if (!storage.ok) add('error', 'storage_down', storage.error);
  if (!realtime.ok) add('error', 'realtime_down', realtime.error);
  if (api.last15.requests >= 20 && api.last15.errorRate > 0.02) add('error', 'error_rate', Math.round(api.last15.errorRate * 1000) / 10);
  if (environment.name === 'production' && environment.checks.some((c) => c.id === 'otp_dev_mode' && c.warn)) add('error', 'otp_dev_mode');
  if (environment.secrets.some((s) => !s.set)) add('error', 'secret_missing', environment.secrets.filter((s) => !s.set).map((s) => s.name).join(', '));
  if (landing.last && !landing.last.up) add('error', 'landing_down', landing.last.status);
  for (const [name, job] of Object.entries(jobs)) if (job.lastError && job.failures > 0 && job.lastResult === null) add('warn', 'job_failed', name);
  if (mobile.opens7d >= 20 && mobile.crashFreeRate !== null && mobile.crashFreeRate < 0.95) add('warn', 'crash_rate', Math.round(mobile.crashFreeRate * 1000) / 10);
  return list.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
};

module.exports = o;
