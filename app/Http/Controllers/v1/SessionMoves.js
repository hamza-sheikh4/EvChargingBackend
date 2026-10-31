'use strict'

let json    = require('../../../Traits/ApiResponser');
let rules   = require('../../../Traits/SessionRules');
let prisma  = require('../../../../config/database');
let present = require('./SessionPresenter');
let expiry  = require('../../../Jobs/ExpireRequests');

/*
|--------------------------------------------------------------------------
| Booking Moves
|--------------------------------------------------------------------------
|
| Each move checks the state machine and who is making it, then changes the
| state only if nobody else changed it first (the update matches the old
| state). Both sides' apps get the new copy live; some moves also notify.
|
*/

module.exports = (o, { UUID, actorFor, proofsOk }) => {
  /**
   * One move. to: the new state. prepare(row, actor) returns { patch, note, then } or an error
   * string. kinds(actor) says who to notify. then: a system move straight after (end).
   */
  const move = (to, { prepare, kinds } = {}) => async (req, res, next) => {
    try {
      if (to === 'accepted' || to === 'declined') await expiry.run();
      let row = UUID.test(req.params.id) ? await prisma.session.findUnique({ where: { id: req.params.id } }) : null;
      const actor = row && actorFor(row, req.user.id);
      if (!actor) return json.errorResponse(res, 'That booking was not found.', 404);
      if (row.state === 'expired' && to === 'accepted') return json.errorResponse(res, 'This request has expired.', 409);
      if (!rules.can(row.state, to, actor)) return json.errorResponse(res, 'This booking cannot change that way now.', 409);
      const prepared = prepare ? await prepare(row, actor, req.body) : {};
      if (typeof prepared === 'string') return json.errorResponse(res, prepared, 422);
      let events = rules.withEvent(row.events, row.state, to, actor, prepared.note);
      let state = to;
      if (prepared.then) {
        events = rules.withEvent(events, to, prepared.then, 'system');
        state = prepared.then;
      }
      const changed = await prisma.session.updateMany({
        where: { id: row.id, state: row.state },
        data: { state, events, ...(prepared.patch || {}) },
      });
      if (changed.count === 0) return json.errorResponse(res, 'This booking just changed. Pull to refresh.', 409);
      row = await prisma.session.findUnique({ where: { id: row.id } });
      await present.broadcast(row, kinds ? kinds(actor) : {});
      json.successResponse(res, { session: await present.toSession(row, actor) });
    } catch (e) {
      next(e);
    }
  };

  o.accept = move('accepted', { kinds: () => ({ driver: 'accepted' }) });
  o.decline = move('declined', { kinds: () => ({ driver: 'declined' }) });
  // The driver can cancel a request or an accepted booking; the host only an accepted one.
  o.cancel = move('cancelled', { kinds: (actor) => (actor === 'driver' ? { host: 'cancelled' } : { driver: 'cancelled' }) });

  o.start = move('active', {
    prepare: (row, actor, body) => ({ patch: { startPercent: body.startPercent } }),
    kinds: () => ({ host: 'started' }),
  });

  o.interrupt = move('interrupted', {
    prepare: (row, actor, body) => ({ patch: { interruptionReason: body.reason }, note: body.reason }),
  });

  o.resume = move('active');

  // Ending hands over to billing, which is not built yet, so the booking waits for the host's kWh.
  o.end = move('ended', {
    prepare: async (row, actor, body) => {
      if (row.startPercent !== null && body.endPercent < row.startPercent) {
        return 'The battery level at the end cannot be lower than at the start.';
      }
      if (!(await proofsOk(row.driverId, body.proofKeys))) return 'A photo did not upload. Please try again.';
      return { patch: { endPercent: body.endPercent, proofKeys: body.proofKeys }, then: 'awaiting_host_energy' };
    },
    kinds: () => ({ host: 'ended' }),
  });
};
