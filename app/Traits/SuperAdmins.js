'use strict'

const prisma   = require('../../config/database');
const password = require('./Password');

/*
|--------------------------------------------------------------------------
| Super Admins
|--------------------------------------------------------------------------
|
| Used only by scripts/super-admin.js: the panel can never make or remove a
| super admin. Each write takes a Postgres advisory lock, then re-reads the
| list and re-checks the limits, since another run may have changed it
| while the operator was typing.
|
*/

const MAX_SUPER_ADMINS = 3;
const ACTOR = 'Server script (scripts/super-admin.js)';

/** An expected refusal: printed plainly, nothing changed. */
class Refused extends Error {}

let o = { MAX_SUPER_ADMINS, Refused }

o.normalizeEmail = (value) => (value || '').trim().toLowerCase();
o.validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 160;

/** host:port/dbname from DATABASE_URL. Never the user or password. */
o.databaseLabel = (url = process.env.DATABASE_URL) => {
  const parsed = new URL(url);
  return `${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`;
};

o.list = (db = prisma) => db.admin.findMany({ where: { role: 'superadmin' }, orderBy: { createdAt: 'asc' } });

o.findAdmin = (email, db = prisma) => db.admin.findUnique({ where: { email } });

async function locked(run) {
  return prisma.$transaction(async (tx) => {
    // ::text because Prisma cannot read the void that pg_advisory_xact_lock returns.
    await tx.$queryRaw`select pg_advisory_xact_lock(hashtext('super-admins'))::text`;
    return run(tx);
  }, { timeout: 20000 });
}

/** Every change goes to the audit log, and a line to the Health page's system log. */
const systemLog = require('./SystemLog');

const log = (tx, action, target, message) => {
  systemLog.event(`Super admin script: ${action.replace('super_admin.', '').replace(/_/g, ' ')}`, { level: 'warn' });
  return tx.adminAction.create({
    data: { adminId: null, actorEmail: ACTOR, action, targetType: 'admin', targetId: target.id, details: { email: target.email, message } },
  });
};

/**
 * Makes email a super admin. An existing admin keeps their password; a new one gets a
 * temporary password, returned once. freeingId is a super admin the same transaction is
 * about to remove (replace), so it does not count toward the limit.
 */
async function grantIn(tx, { email, fullName }, freeingId = null) {
  const supers = await o.list(tx);
  const existing = await o.findAdmin(email, tx);

  if (existing?.role === 'superadmin') {
    if (existing.status === 'active') return { outcome: 'nothing', admin: existing };
    const admin = await tx.admin.update({ where: { id: existing.id }, data: { status: 'active' } });
    await log(tx, 'super_admin.reenable', admin, `Re-enabled ${email} as a super admin`);
    return { outcome: 'reenabled', admin };
  }
  if (supers.filter((s) => s.id !== freeingId).length >= MAX_SUPER_ADMINS) {
    throw new Refused(`There are already ${MAX_SUPER_ADMINS} super admins. Use replace.`);
  }
  if (existing) {
    const admin = await tx.admin.update({
      where: { id: existing.id },
      data: { role: 'superadmin', status: 'active', permissions: [] },
    });
    await log(tx, 'super_admin.grant', admin, `Made ${email} a super admin`);
    return { outcome: 'promoted', admin };
  }
  if (!fullName) throw new Refused('A new admin needs a full name.');
  const temporaryPassword = password.temporary();
  const admin = await tx.admin.create({
    data: { email, fullName, role: 'superadmin', passwordHash: await password.hash(temporaryPassword) },
  });
  await log(tx, 'super_admin.grant', admin, `Made ${email} a super admin`);
  return { outcome: 'created', admin, temporaryPassword };
}

/** Removes a super admin's account, so their next request is refused. Never the last active one. */
async function revokeIn(tx, id, { replacing = false } = {}) {
  const supers = await o.list(tx);
  const target = supers.find((s) => s.id === id);
  if (!target) throw new Refused('That super admin is no longer on the list. Nothing changed.');
  const otherActive = supers.filter((s) => s.id !== id && s.status === 'active');
  if (!replacing && target.status === 'active' && otherActive.length === 0) {
    throw new Refused(`${target.email} is the last active super admin. Use replace instead.`);
  }
  await tx.admin.delete({ where: { id } });
  if (!replacing) await log(tx, 'super_admin.remove', target, `Removed ${target.email} as a super admin`);
  return target;
}

o.grant = (input) => locked((tx) => grantIn(tx, input));

o.revoke = (id) => locked((tx) => revokeIn(tx, id));

/** Grant the new one and remove the old one together. Works at 3 of 3; a failure changes nothing. */
o.replace = (oldId, input) =>
  locked(async (tx) => {
    const granted = await grantIn(tx, input, oldId);
    const removed = await revokeIn(tx, oldId, { replacing: true });
    await log(tx, 'super_admin.replace', granted.admin, `Replaced ${removed.email} with ${granted.admin.email}`);
    return { ...granted, removed };
  });

/** For a forgotten password or a lost 2FA phone. Signs them out everywhere. */
o.resetPassword = (id) =>
  locked(async (tx) => {
    const temporaryPassword = password.temporary();
    const admin = await tx.admin.update({
      where: { id },
      data: { passwordHash: await password.hash(temporaryPassword), failedLogins: 0, lockedUntil: null, tokenVersion: { increment: 1 } },
    });
    await log(tx, 'super_admin.reset_password', admin, `Reset the password for ${admin.email}`);
    return { admin, temporaryPassword };
  });

o.resetTwoFactor = (id) =>
  locked(async (tx) => {
    const admin = await tx.admin.update({
      where: { id },
      data: { twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorLastStep: null },
    });
    await log(tx, 'super_admin.reset_two_factor', admin, `Turned off 2FA for ${admin.email}`);
    return admin;
  });

module.exports = o;
