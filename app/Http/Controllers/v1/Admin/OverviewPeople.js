'use strict'

const prisma = require('../../../../../config/database');
const ops    = require('./OverviewOps');

/*
|--------------------------------------------------------------------------
| Overview: people and system
|--------------------------------------------------------------------------
|
| Users, the team, recent admin activity and a light system check for the
| admin Overview. The full checks stay on the Health page.
|
*/

const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (days) => new Date(Date.now() - days * DAY_MS);

/** Admin actions worth showing in a feed; sign-ins and opening a host are left out as noise. */
const FEED = [
  'host.approve', 'host.reject', 'listing.pause', 'listing.relist', 'user.suspend', 'user.unsuspend',
  'team.add', 'team.update', 'team.remove', 'team.reset_password', 'team.reset_two_factor',
];

let o = {}

o.users = async () => {
  const [total, drivers, hosts, suspended, recent] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isDriver: true } }),
    prisma.user.count({ where: { isHost: true } }),
    prisma.user.count({ where: { suspendedAt: { not: null } } }),
    prisma.user.findMany({ where: { createdAt: { gte: ago(14) } }, select: { createdAt: true } }),
  ]);
  return {
    total, drivers, hosts, suspended,
    new7d: recent.filter((u) => u.createdAt >= ago(7)).length,
    daily: ops.perDay(recent.map((u) => u.createdAt)),
  };
};

o.team = async () => {
  const [admins, recent] = await Promise.all([
    prisma.admin.groupBy({ by: ['role'], _count: true }),
    prisma.admin.findMany({ where: { lastLoginAt: { not: null } }, orderBy: { lastLoginAt: 'desc' }, take: 5 }),
  ]);
  const count = (role) => admins.find((a) => a.role === role)?._count ?? 0;
  return {
    superadmins: count('superadmin'),
    admins: count('admin'),
    recent: recent.map((a) => ({ id: a.id, fullName: a.fullName, role: a.role, lastLoginAt: a.lastLoginAt.toISOString() })),
  };
};

o.activity = async () => {
  const rows = await prisma.adminAction.findMany({ where: { action: { in: FEED } }, orderBy: { createdAt: 'desc' }, take: 8 });
  return rows.map((r) => ({ id: r.id, actor: r.actorEmail, action: r.action, at: r.createdAt.toISOString() }));
};

/** Database reachable, and open problems from system_events. No storage upload: that stays on Health. */
o.system = async () => {
  let database = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = false;
  }
  const [openErrors, openBugReports, security24h, crashes7d] = await Promise.all([
    prisma.systemEvent.count({ where: { kind: { in: ['error', 'crash'] }, status: 'open', NOT: { title: { startsWith: 'Network:' } } } }),
    prisma.systemEvent.count({ where: { kind: 'bug_report', status: 'open' } }),
    prisma.systemEvent.aggregate({ where: { kind: 'security', lastSeenAt: { gte: ago(1) } }, _sum: { count: true } }),
    prisma.systemEvent.aggregate({ where: { kind: 'crash', source: 'mobile', lastSeenAt: { gte: ago(7) } }, _sum: { count: true } }),
  ]);
  return { database, openErrors, openBugReports, security24h: security24h._sum.count ?? 0, crashes7d: crashes7d._sum.count ?? 0 };
};

module.exports = o;
