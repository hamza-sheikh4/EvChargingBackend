'use strict'

const json    = require('../../../../Traits/ApiResponser');
const audit   = require('../../../../Traits/AdminAudit');
const prisma  = require('../../../../../config/database');
const present = require('./UserPresenter');

/*
|--------------------------------------------------------------------------
| Users
|--------------------------------------------------------------------------
|
| Every app account: drivers, hosts, or both. Admins can suspend one, which
| signs them out everywhere and stops them signing in, and lift it again.
| The CNIC is never shown here; it stays in Host verification.
|
*/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FILTERS = {
  all: {},
  drivers: { isDriver: true },
  hosts: { isHost: true },
  suspended: { suspendedAt: { not: null } },
};

let o = {}

const searchFor = (q) => {
  if (!q) return {};
  const digits = q.replace(/\D/g, '');
  return {
    OR: [
      { fullName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      ...(digits ? [{ phone: { contains: digits } }] : []),
    ],
  };
};

const findUser = (id) => (UUID.test(id || '') ? prisma.user.findUnique({ where: { id } }) : null);

/** Counts per filter and one filter's accounts, newest first. */
o.list = async (req, res, next) => {
  try {
    const filter = FILTERS[req.query.filter] ? req.query.filter : 'all';
    const q = String(req.query.q || '').trim().slice(0, 80);
    const [counts, users] = await Promise.all([
      Promise.all(Object.entries(FILTERS).map(async ([name, where]) => [name, await prisma.user.count({ where })])),
      prisma.user.findMany({
        where: { ...FILTERS[filter], ...searchFor(q) },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { _count: { select: { vehicles: true } } },
      }),
    ]);
    json.successResponse(res, { counts: Object.fromEntries(counts), users: users.map(present.summary) });
  } catch (e) {
    next(e);
  }
}

/** One account: profile, vehicles, chargers and past suspensions. */
o.show = async (req, res, next) => {
  try {
    const id = UUID.test(req.params.id || '') ? req.params.id : null;
    const user = id
      ? await prisma.user.findUnique({
          where: { id },
          include: { vehicles: { orderBy: { createdAt: 'asc' } }, chargers: { orderBy: { createdAt: 'asc' } }, _count: { select: { vehicles: true } } },
        })
      : null;
    if (!user) return json.errorResponse(res, 'That user was not found.', 404);
    const history = await prisma.adminAction.findMany({
      where: { targetType: 'user', targetId: user.id, action: { in: ['user.suspend', 'user.unsuspend'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    json.successResponse(res, await present.detail(user, history));
  } catch (e) {
    next(e);
  }
}

/** Signs them out everywhere at once (token version and open sockets) and blocks new sign-ins. */
o.suspend = async (req, res, next) => {
  try {
    const user = await findUser(req.params.id);
    if (!user) return json.errorResponse(res, 'That user was not found.', 404);
    if (user.suspendedAt) return json.errorResponse(res, 'This user is already suspended.', 409);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { suspendedAt: new Date(), tokenVersion: { increment: 1 } } });
      await audit.log(req, 'user.suspend', 'user', user.id, { reason: req.body.reason }, tx);
    });
    global.io?.in(`user:${user.id}`).disconnectSockets(true);
    json.successResponse(res, { suspended: true });
  } catch (e) {
    next(e);
  }
}

/** Lets them sign in again. Their old logins stay ended. */
o.unsuspend = async (req, res, next) => {
  try {
    const user = await findUser(req.params.id);
    if (!user) return json.errorResponse(res, 'That user was not found.', 404);
    if (!user.suspendedAt) return json.errorResponse(res, 'This user is not suspended.', 409);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { suspendedAt: null } });
      await audit.log(req, 'user.unsuspend', 'user', user.id, null, tx);
    });
    json.successResponse(res, { suspended: false });
  } catch (e) {
    next(e);
  }
}

module.exports = o;
