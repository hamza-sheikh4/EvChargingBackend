'use strict'

let json   = require('../../../Traits/ApiResponser');
let prisma = require('../../../../config/database');

/*
|--------------------------------------------------------------------------
| Waitlist
|--------------------------------------------------------------------------
|
| Sign-ups from the landing page. Every sign-up gets the same answer, even
| a bot or an email already on the list, so the form cannot be used to
| find out who has signed up. The email is never logged.
|
*/

let o = {}

o.join = async (req, res, next) => {
  try {
    // Bots fill the hidden field. Answer as if it worked, and save nothing.
    if (req.body.website) return json.successResponse(res, { joined: true }, 201);
    const email = req.body.email.toLowerCase();
    // An email already on the list keeps its first sign-up and consent time.
    await prisma.waitlistEntry.upsert({ where: { email }, update: {}, create: { email, consentAt: new Date() } });
    json.successResponse(res, { joined: true }, 201);
  } catch (e) {
    next(e);
  }
}

module.exports = o;
