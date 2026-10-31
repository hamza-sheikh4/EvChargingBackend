'use strict'

let json = require('../../Traits/ApiResponser');

/** Checks req.body against a zod schema and replaces it with the parsed value, or answers 422. */
module.exports = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) return json.errorResponse(res, result.error.issues[0].message, 422);
  req.body = result.data;
  next();
};
