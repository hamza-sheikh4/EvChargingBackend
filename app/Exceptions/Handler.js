'use strict'

let config = require('../../config/app');

/*
|--------------------------------------------------------------------------
| Exception Handler
|--------------------------------------------------------------------------
|
| Unknown routes get a 404. Any error passed to next() gets a 500. The stack
| trace is logged, and only sent to the client in development.
|
*/

module.exports = function handler(app) {

  app.use(function notFound(req, res) {
    res.status(404).json({
      error: 'This specified URL cannot be found',
      code: '404'
    });
  });

  // Express treats a handler with four arguments as the error handler.
  // eslint-disable-next-line no-unused-vars
  app.use(function errorHandler(err, req, res, next) {
    console.error(err.stack || err);
    res.status(err.status || 500).json({
      error: config.env === 'development' ? (err.stack || String(err)) : 'Something failed!',
      code: String(err.status || 500)
    });
  });

}
