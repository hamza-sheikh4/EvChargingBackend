'use strict'

let json    = require('../../../Traits/ApiResponser');
let storage = require('../../../Traits/Storage');

let o = {}

/** A short-lived link for the app to upload one photo straight to R2 (vision 10.4). */
o.create = async (req, res, next) => {
  try {
    const key = storage.keyFor(req.body.kind, req.user.id);
    json.successResponse(res, { uploadUrl: await storage.uploadUrl(key), key }, 201);
  } catch (e) {
    next(e);
  }
}

module.exports = o;
