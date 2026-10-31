'use strict'

let prisma = require('../../config/database');

/*
|--------------------------------------------------------------------------
| Admin Audit Log
|--------------------------------------------------------------------------
|
| One row in admin_actions per change an admin makes. Pass a transaction
| client as db to log inside the same transaction as the change.
|
*/

let o = {}

o.log = (req, action, targetType, targetId, details = null, db = prisma) =>
  db.adminAction.create({
    data: {
      adminId: req.admin.id,
      actorEmail: req.admin.email,
      action,
      targetType,
      targetId: String(targetId),
      details,
      ip: req.ip,
    },
  });

module.exports = o;
