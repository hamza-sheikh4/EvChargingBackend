'use strict'

const json    = require('../../../../Traits/ApiResponser');
const audit   = require('../../../../Traits/AdminAudit');
const prisma  = require('../../../../../config/database');
const present = require('./HostPresenter');
const session = require('./AdminSession');

/*
|--------------------------------------------------------------------------
| Host Verification
|--------------------------------------------------------------------------
|
| The review queue. Opening a host decrypts their CNIC, so every open is
| logged. Approving verifies the host and their chargers and tells the
| host's app straight away. Rejection reasons live in the audit log.
|
*/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['pending', 'verified', 'rejected'];

let o = {}

const findHost = (id) =>
  UUID.test(id || '')
    ? prisma.user.findFirst({
        where: { id, hostVerificationStatus: { not: null } },
        include: { chargers: { orderBy: { createdAt: 'asc' } } },
      })
    : null;

/** Search by name or phone number. */
const searchFor = (q) => {
  if (!q) return {};
  const digits = q.replace(/\D/g, '');
  return { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, ...(digits ? [{ phone: { contains: digits } }] : [])] };
};

/** Queue counts and one tab of hosts. Pending shows the oldest first, so nobody waits longest. */
o.list = async (req, res, next) => {
  try {
    const status = STATUSES.includes(req.query.status) ? req.query.status : 'pending';
    const q = String(req.query.q || '').trim().slice(0, 80);
    const [groups, hosts] = await Promise.all([
      prisma.user.groupBy({ by: ['hostVerificationStatus'], where: { hostVerificationStatus: { not: null } }, _count: true }),
      prisma.user.findMany({
        where: { hostVerificationStatus: status, ...searchFor(q) },
        orderBy: status === 'pending' ? { hostOnboardedAt: 'asc' } : { updatedAt: 'desc' },
        take: 100,
        include: { chargers: { select: { areaId: true, locationType: true }, orderBy: { createdAt: 'asc' } } },
      }),
    ]);
    const counts = Object.fromEntries(
      STATUSES.map((s) => [s, groups.find((g) => g.hostVerificationStatus === s)?._count ?? 0]),
    );
    json.successResponse(res, { counts, hosts: hosts.map(present.summary) });
  } catch (e) {
    next(e);
  }
}

/** Everything needed to decide. The CNIC and its photos need hosts_view_documents; opening them is logged. */
o.show = async (req, res, next) => {
  try {
    const host = await findHost(req.params.id);
    if (!host) return json.errorResponse(res, 'That host was not found.', 404);
    const history = await prisma.adminAction.findMany({
      where: { targetType: 'user', targetId: host.id, action: { in: ['host.approve', 'host.reject'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const documents = session.has(req.admin, 'hosts_view_documents');
    if (documents) await audit.log(req, 'host.view', 'user', host.id);
    json.successResponse(res, await present.detail(host, history, { documents }));
  } catch (e) {
    next(e);
  }
}

/** Verifies the host and every charger they have. From pending, or after a rejection. */
o.approve = async (req, res, next) => {
  try {
    const host = await findHost(req.params.id);
    if (!host) return json.errorResponse(res, 'That host was not found.', 404);
    if (host.hostVerificationStatus === 'verified') return json.errorResponse(res, 'This host is already verified.', 409);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: host.id }, data: { hostVerificationStatus: 'verified' } });
      await tx.charger.updateMany({ where: { hostId: host.id }, data: { verifiedAt: new Date() } });
      await audit.log(req, 'host.approve', 'user', host.id, { from: host.hostVerificationStatus }, tx);
    });
    await present.notify(host.id, 'verified');
    json.successResponse(res, { status: 'verified' });
  } catch (e) {
    next(e);
  }
}

/** Rejects a pending host, or takes verification back from a verified one. Their chargers go unverified. */
o.reject = async (req, res, next) => {
  try {
    const host = await findHost(req.params.id);
    if (!host) return json.errorResponse(res, 'That host was not found.', 404);
    if (host.hostVerificationStatus === 'rejected') return json.errorResponse(res, 'This host is already rejected.', 409);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: host.id }, data: { hostVerificationStatus: 'rejected' } });
      await tx.charger.updateMany({ where: { hostId: host.id }, data: { verifiedAt: null } });
      await audit.log(req, 'host.reject', 'user', host.id, { from: host.hostVerificationStatus, reason: req.body.reason }, tx);
    });
    await present.notify(host.id, 'rejected');
    json.successResponse(res, { status: 'rejected' });
  } catch (e) {
    next(e);
  }
}

module.exports = o;
