'use strict'

let json   = require('../../../Traits/ApiResponser');
let notify = require('../../../Traits/Notify');
let prisma = require('../../../../config/database');

let o = {}

const roleOf = (value) => (value === 'host' ? 'host' : 'driver');

/** The latest 50 for one side of the app (?as=driver or ?as=host), newest first. */
o.list = async (req, res, next) => {
  try {
    const rows = await prisma.notification.findMany({
      where: { userId: req.user.id, role: roleOf(req.query.as) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    json.successResponse(res, { notifications: rows.map(notify.toItem) });
  } catch (e) {
    next(e);
  }
}

/** Marks every notification on that side as read. */
o.readAll = async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, role: roleOf(req.body.as), readAt: null },
      data: { readAt: new Date() },
    });
    json.successResponse(res, { read: true });
  } catch (e) {
    next(e);
  }
}

module.exports = o;
