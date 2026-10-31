'use strict'

const json    = require('../../../../Traits/ApiResponser');
const metrics = require('../../../../Traits/Metrics');
const storage = require('../../../../Traits/Storage');
const prisma  = require('../../../../../config/database');
const checks  = require('./HealthChecks');
const stats   = require('./HealthStats');
const cleanup = require('../../../../Jobs/Cleanup');

/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
|
| The admin Health page. overview: every section with banners and an
| overall status. events: the error log, crashes, bug reports, system and
| security logs (needs health_view_logs). resolve and reopen need
| health_resolve. Everything here is about the system, never about users.
|
*/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ['error', 'crash', 'bug_report', 'event', 'security'];
const SOURCES = ['api', 'job', 'mobile', 'admin', 'landing'];

let o = {}

o.overview = async (req, res, next) => {
  try {
    const [database, storageCheck, realtime, mobile, landing, totals] = await Promise.all([
      checks.database(), checks.storage(), checks.realtime(), stats.mobile(), stats.landing(), stats.totals(),
    ]);
    const counters = metrics.counters();
    const api = {
      startedAt: metrics.startedAt.toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      cpuSeconds: Math.round(process.cpuUsage().user / 1e6),
      last15: metrics.window(15),
      last60: metrics.window(60),
      last24h: metrics.window(24 * 60),
      hourly: metrics.hourly(),
      routes: metrics.routes(),
      rateLimited: counters.rateLimited,
    };
    const environment = checks.environment();
    const sections = { api, database, storage: storageCheck, realtime: { ...realtime, eventsLastHour: counters.socketEventsLastHour }, environment, jobs: counters.jobs, mobile, landing };
    const banners = stats.banners(sections);
    json.successResponse(res, {
      checkedAt: new Date().toISOString(),
      status: !database.ok ? 'down' : banners.some((b) => b.level === 'error') ? 'degraded' : banners.length ? 'warning' : 'normal',
      banners,
      ...sections,
      notifications: { sent: counters.notifications, failed: counters.notificationFailures },
      totals,
      retentionDays: cleanup.KEEP_DAYS,
    });
  } catch (e) {
    next(e);
  }
}

const row = (e) => ({
  id: e.id, kind: e.kind, source: e.source, level: e.level, title: e.title, count: e.count,
  firstSeenAt: e.firstSeenAt.toISOString(), lastSeenAt: e.lastSeenAt.toISOString(), status: e.status,
  appVersion: e.appVersion, platform: e.platform,
});

/** One kind of event (?kind=error|crash|bug_report|event|security), with filters, most recent first. */
o.events = async (req, res, next) => {
  try {
    const kind = KINDS.includes(req.query.kind) ? req.query.kind : 'error';
    const where = {
      kind,
      ...(SOURCES.includes(req.query.source) ? { source: req.query.source } : {}),
      ...(['open', 'resolved'].includes(req.query.status) ? { status: req.query.status } : {}),
      ...(req.query.q ? { title: { contains: String(req.query.q).slice(0, 80), mode: 'insensitive' } } : {}),
    };
    const [events, open] = await Promise.all([
      prisma.systemEvent.findMany({ where, orderBy: { lastSeenAt: 'desc' }, take: 200 }),
      prisma.systemEvent.count({ where: { kind, status: 'open' } }),
    ]);
    json.successResponse(res, { events: events.map(row), open });
  } catch (e) {
    next(e);
  }
}

/** One event in full: message, stack, context, the screenshot and who reported it (bug reports). */
o.event = async (req, res, next) => {
  try {
    const e = UUID.test(req.params.id || '') ? await prisma.systemEvent.findUnique({ where: { id: req.params.id } }) : null;
    if (!e) return json.errorResponse(res, 'That event was not found.', 404);
    const reporter = e.userId ? await prisma.user.findUnique({ where: { id: e.userId }, select: { fullName: true, phone: true } }) : null;
    json.successResponse(res, {
      ...row(e),
      message: e.message, stack: e.stack, context: e.context, device: e.device,
      resolvedAt: e.resolvedAt?.toISOString() ?? null, resolvedBy: e.resolvedBy,
      screenshotUrl: e.screenshotKey ? await storage.viewUrl(e.screenshotKey) : null,
      reporter: reporter ? { fullName: reporter.fullName ?? '', phone: reporter.phone } : null,
    });
  } catch (err) {
    next(err);
  }
}

const setStatus = (status) => async (req, res, next) => {
  try {
    const e = UUID.test(req.params.id || '') ? await prisma.systemEvent.findUnique({ where: { id: req.params.id } }) : null;
    if (!e) return json.errorResponse(res, 'That event was not found.', 404);
    await prisma.systemEvent.update({
      where: { id: e.id },
      data: status === 'resolved' ? { status, resolvedAt: new Date(), resolvedBy: req.admin.email } : { status, resolvedAt: null, resolvedBy: null },
    });
    json.successResponse(res, { status });
  } catch (err) {
    next(err);
  }
};

/** Resolved: fixed, or a bug report closed. An error that happens again reopens by itself. */
o.resolve = setStatus('resolved');
o.reopen = setStatus('open');

module.exports = o;
