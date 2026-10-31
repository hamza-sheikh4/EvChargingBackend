'use strict'

/*
|--------------------------------------------------------------------------
| Create The Application
|--------------------------------------------------------------------------
|
| Builds the Express app: headers, logging, body parsing and the API routes.
| server.js starts it.
|
*/

let express = require('express');
let helmet  = require('helmet');
let morgan  = require('morgan');

let api = require('../routes/api');
let metrics = require('../app/Traits/Metrics');

let app = express();

/*
|--------------------------------------------------------------------------
| Cross Origin
|--------------------------------------------------------------------------
|
| The mobile app is not affected by CORS. This is for the admin panel at
| APP_URL, which sends its login cookie, so credentials are allowed, and
| the landing site at LANDING_URL, which only reports page errors.
|
*/

const origins = [process.env.APP_URL || 'http://localhost:3000', process.env.LANDING_URL].filter(Boolean);

app.all('*', function(req, res, next) {
  const origin = origins.includes(req.headers.origin) ? req.headers.origin : origins[0];
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-access-token');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Vary', 'Origin');
  // Answer the preflight here, before it reaches a route that has no OPTIONS handler.
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// One proxy in front (Cloudflare or the reverse proxy), so rate limits see the real client IP.
app.set('trust proxy', 1);
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

// Times every API request for the admin Health page (in memory, last 24 hours).
app.use('/api/v1', metrics.middleware);
app.use('/api/v1', api);

require('./../app/Exceptions/Handler')(app);

module.exports = app;
