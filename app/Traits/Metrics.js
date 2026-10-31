'use strict'

/*
|--------------------------------------------------------------------------
| Live Metrics
|--------------------------------------------------------------------------
|
| Numbers for the Health page, kept in memory for the last 24 hours: one
| bucket per minute. Cheap and instant, and reset when the server restarts
| (the page says since when). Nothing personal is kept: only route
| patterns such as POST /sessions/:id/accept, status codes and timings.
|
*/

const MINUTES = 24 * 60;
const SAMPLE = 120; // timings kept per minute for p50 / p95

const startedAt = new Date();
const buckets = new Map(); // minute number -> { count, errors, durations[], routes: Map }
const counters = { rateLimited: 0, socketEvents: [], notifications: new Map(), notificationFailures: 0 };
const jobs = {};

let o = { startedAt }

const minuteNow = () => Math.floor(Date.now() / 60000);

function bucket(minute) {
  if (!buckets.has(minute)) {
    buckets.set(minute, { count: 0, errors: 0, durations: [], routes: new Map() });
    for (const key of buckets.keys()) if (key < minute - MINUTES) buckets.delete(key);
  }
  return buckets.get(minute);
}

/** Express middleware: times every API request. */
o.middleware = (req, res, next) => {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const route = req.route ? `${req.method} ${req.baseUrl}${req.route.path}` : `${req.method} (no route)`;
    const b = bucket(minuteNow());
    const failed = res.statusCode >= 500;
    b.count += 1;
    if (failed) b.errors += 1;
    if (b.durations.length < SAMPLE) b.durations.push(ms);
    const r = b.routes.get(route) || { count: 0, errors: 0, durations: [] };
    r.count += 1;
    if (failed) r.errors += 1;
    if (r.durations.length < SAMPLE) r.durations.push(ms);
    b.routes.set(route, r);
  });
  next();
};

const percentile = (values, p) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]);
};

/** Totals over the last `minutes`. */
o.window = (minutes) => {
  const from = minuteNow() - minutes + 1;
  let count = 0, errors = 0;
  const durations = [];
  for (const [minute, b] of buckets) {
    if (minute < from) continue;
    count += b.count;
    errors += b.errors;
    durations.push(...b.durations);
  }
  return {
    requests: count,
    errors,
    errorRate: count ? errors / count : 0,
    perMinute: Math.round((count / minutes) * 10) / 10,
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
  };
};

/** Requests and errors per hour for the last 24 hours, oldest first, for the charts. */
o.hourly = () => {
  const now = minuteNow();
  return Array.from({ length: 24 }, (_, i) => {
    const end = now - (23 - i) * 60;
    let requests = 0, errors = 0;
    const durations = [];
    for (let m = end - 59; m <= end; m++) {
      const b = buckets.get(m);
      if (!b) continue;
      requests += b.count;
      errors += b.errors;
      durations.push(...b.durations);
    }
    return { hour: new Date(end * 60000).toISOString(), requests, errors, p95: percentile(durations, 95) };
  });
};

/** The 5 slowest and 5 most-failing routes over 24 hours. */
o.routes = () => {
  const all = new Map();
  for (const b of buckets.values()) {
    for (const [route, r] of b.routes) {
      const a = all.get(route) || { route, count: 0, errors: 0, durations: [] };
      a.count += r.count;
      a.errors += r.errors;
      a.durations.push(...r.durations);
      all.set(route, a);
    }
  }
  const rows = [...all.values()].map((r) => ({ route: r.route, count: r.count, errors: r.errors, p95: percentile(r.durations, 95) }));
  return {
    slowest: [...rows].sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0)).slice(0, 5),
    failing: rows.filter((r) => r.errors > 0).sort((a, b) => b.errors - a.errors).slice(0, 5),
  };
};

o.rateLimited = () => { counters.rateLimited += 1; };
o.socketEvent = () => {
  counters.socketEvents.push(Date.now());
  const hourAgo = Date.now() - 3600000;
  while (counters.socketEvents.length && counters.socketEvents[0] < hourAgo) counters.socketEvents.shift();
};
o.notification = (kind) => counters.notifications.set(kind, (counters.notifications.get(kind) || 0) + 1);
o.notificationFailed = () => { counters.notificationFailures += 1; };

/** A background job finished: name, how long, what it did, and whether it failed. */
o.job = (name, { ms, result, error }) => {
  const job = jobs[name] || { runs: 0, failures: 0 };
  jobs[name] = { ...job, runs: job.runs + 1, failures: job.failures + (error ? 1 : 0), lastRunAt: new Date().toISOString(), lastMs: Math.round(ms), lastResult: result ?? null, lastError: error ?? job.lastError ?? null };
};

o.counters = () => ({
  rateLimited: counters.rateLimited,
  socketEventsLastHour: counters.socketEvents.length,
  notifications: Object.fromEntries(counters.notifications),
  notificationFailures: counters.notificationFailures,
  jobs,
});

module.exports = o;
