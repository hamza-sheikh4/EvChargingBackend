'use strict'

let json   = require('../../../Traits/ApiResponser');
let prisma = require('../../../../config/database');

let o = {}

/**
 * Confirms the server is up and can reach the database.
 */
o.index = async (req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    json.successResponse(res, { status: 'ok', database: 'connected' });
  } catch (e) {
    next(e);
  }
}

module.exports = o;
