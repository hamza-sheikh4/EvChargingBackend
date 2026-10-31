'use strict'

const json     = require('../../../../Traits/ApiResponser');
const audit    = require('../../../../Traits/AdminAudit');
const password = require('../../../../Traits/Password');
const prisma   = require('../../../../../config/database');
const session  = require('./AdminSession');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let o = {}

/**
 * The member this request may change, or answers and returns null. Nobody changes the
 * super admin or themselves here (their own account is in Settings).
 */
async function editable(req, res) {
  const member = UUID.test(req.params.id) ? await prisma.admin.findUnique({ where: { id: req.params.id } }) : null;
  const refusal =
    !member ? ['That team member was not found.', 404]
    : member.role === 'superadmin' ? ['The super admin cannot be changed here.', 403]
    : member.id === req.admin.id ? ['Change your own account in Settings.', 403]
    : null;
  if (!refusal) return member;
  json.errorResponse(res, ...refusal);
  return null;
}

/** Only the super admin hands out permissions they do not hold themselves. */
const beyondOwn = (req, permissions) => permissions.filter((permission) => !session.has(req.admin, permission));

o.list = async (req, res, next) => {
  try {
    // The enum lists superadmin first, so it sorts to the top.
    const team = await prisma.admin.findMany({ orderBy: [{ role: 'asc' }, { createdAt: 'asc' }] });
    json.successResponse(res, team.map(session.profile));
  } catch (e) {
    next(e);
  }
}

/** Adds an admin with a temporary password, shown once. They change it in Settings. */
o.add = async (req, res, next) => {
  try {
    const { fullName, email, permissions } = req.body;
    if (beyondOwn(req, permissions).length) return json.errorResponse(res, 'You can only give permissions you have.', 403);
    if (await prisma.admin.findUnique({ where: { email } })) {
      return json.errorResponse(res, 'Someone on the team already uses that email.', 409);
    }
    const temporaryPassword = password.temporary();
    const member = await prisma.admin.create({
      data: { fullName, email, permissions, passwordHash: await password.hash(temporaryPassword), createdById: req.admin.id },
    });
    await audit.log(req, 'team.add', 'admin', member.id, { email, permissions });
    json.successResponse(res, { member: session.profile(member), temporaryPassword }, 201);
  } catch (e) {
    next(e);
  }
}

/** Changes permissions or suspends. Suspending signs them out everywhere at once. */
o.update = async (req, res, next) => {
  try {
    const member = await editable(req, res);
    if (!member) return;
    const { permissions, status } = req.body;
    if (permissions && !session.has(req.admin, 'team_edit')) return json.errorResponse(res, 'You cannot change permissions.', 403);
    if (status && !session.has(req.admin, 'team_suspend')) return json.errorResponse(res, 'You cannot suspend admins.', 403);
    if (permissions && beyondOwn(req, permissions).length) {
      return json.errorResponse(res, 'You can only give permissions you have.', 403);
    }
    const updated = await prisma.admin.update({
      where: { id: member.id },
      data: {
        ...(permissions ? { permissions } : {}),
        ...(status ? { status } : {}),
        ...(status === 'suspended' ? { tokenVersion: { increment: 1 } } : {}),
      },
    });
    await audit.log(req, 'team.update', 'admin', member.id, {
      before: { permissions: member.permissions, status: member.status },
      after: { permissions: updated.permissions, status: updated.status },
    });
    json.successResponse(res, session.profile(updated));
  } catch (e) {
    next(e);
  }
}

/** A new temporary password, for a forgotten one. Also unlocks the account and signs them out. */
o.resetPassword = async (req, res, next) => {
  try {
    const member = await editable(req, res);
    if (!member) return;
    const temporaryPassword = password.temporary();
    await prisma.admin.update({
      where: { id: member.id },
      data: { passwordHash: await password.hash(temporaryPassword), failedLogins: 0, lockedUntil: null, tokenVersion: { increment: 1 } },
    });
    await audit.log(req, 'team.reset_password', 'admin', member.id);
    json.successResponse(res, { temporaryPassword });
  } catch (e) {
    next(e);
  }
}

/** Turns off 2FA for someone who lost their phone. They can set it up again in Settings. */
o.resetTwoFactor = async (req, res, next) => {
  try {
    const member = await editable(req, res);
    if (!member) return;
    const updated = await prisma.admin.update({
      where: { id: member.id },
      data: { twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorLastStep: null },
    });
    await audit.log(req, 'team.reset_two_factor', 'admin', member.id);
    json.successResponse(res, session.profile(updated));
  } catch (e) {
    next(e);
  }
}

/** Removes them from the team. Their past actions stay in the log under their email. */
o.remove = async (req, res, next) => {
  try {
    const member = await editable(req, res);
    if (!member) return;
    await prisma.admin.delete({ where: { id: member.id } });
    await audit.log(req, 'team.remove', 'admin', member.id, { email: member.email });
    json.successResponse(res, { removed: true });
  } catch (e) {
    next(e);
  }
}

module.exports = o;
