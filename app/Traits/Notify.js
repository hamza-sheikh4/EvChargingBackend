'use strict'

let prisma  = require('../../config/database');
let metrics = require('./Metrics');

/*
|--------------------------------------------------------------------------
| In-app Notifications
|--------------------------------------------------------------------------
|
| Saves a row for the bell and the Notifications screen, and sends it live
| to every device the user has the app open on. There is no push service:
| a closed app sees it the next time it opens.
|
*/

let o = {}

/** The notification as the app reads it (NotificationItem). */
o.toItem = (row) => ({
  id: row.id,
  kind: row.kind,
  sessionId: row.sessionId ?? undefined,
  at: row.createdAt.toISOString(),
  read: row.readAt !== null,
});

/** role is "driver" or "host"; kind is one of the app's notification kinds. */
o.send = async (userId, role, kind, sessionId = null) => {
  const row = await prisma.notification.create({ data: { userId, role, kind, sessionId } });
  metrics.notification(kind);
  if (global.io?.toUser) global.io.toUser(userId, { type: 'notification', role, notification: o.toItem(row) });
  return row;
};

module.exports = o;
