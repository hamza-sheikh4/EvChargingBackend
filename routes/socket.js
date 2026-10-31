'use strict'

/*
|--------------------------------------------------------------------------
| Realtime
|--------------------------------------------------------------------------
|
| Only logged-in users connect: the app sends its token in the handshake.
| Each socket joins "user:<id>", so events go only to that account. Events
| are sent on the "realtime" channel, as the app's RealtimeEvent.
|
*/

const jwt    = require('jsonwebtoken');
const auth   = require('../config/auth');
const prisma = require('../config/database');

const io = global.io;

io.use(async (socket, next) => {
  try {
    const payload = jwt.verify(socket.handshake.auth?.token, auth.jwtSecret);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.tokenVersion !== payload.v || user.suspendedAt) return next(new Error('unauthorized'));
    socket.data.userId = user.id;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.data.userId}`);
});

/** Sends one RealtimeEvent to every device the user is logged in on. */
io.toUser = (userId, event) => {
  require('../app/Traits/Metrics').socketEvent();
  io.to(`user:${userId}`).emit('realtime', event);
};

module.exports = io;
