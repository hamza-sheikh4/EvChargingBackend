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

let app = express();

/*
|--------------------------------------------------------------------------
| Cross Origin
|--------------------------------------------------------------------------
|
| The mobile app is not affected by CORS. This only matters for a browser
| client, such as a future admin panel at APP_URL.
|
*/

app.all('*', function(req, res, next) {
  res.header('Access-Control-Allow-Origin', process.env.APP_URL || 'http://localhost:3000');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-access-token');
  // Answer the preflight here, before it reaches a route that has no OPTIONS handler.
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// One proxy in front (Cloudflare or the reverse proxy), so rate limits see the real client IP.
app.set('trust proxy', 1);
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

app.use('/api/v1', api);

require('./../app/Exceptions/Handler')(app);

module.exports = app;
