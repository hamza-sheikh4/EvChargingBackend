'use strict'

require('dotenv').config();
let config     = {};
    config.app = require('./config/app');

/*
 |--------------------------------------------------------------------------
 | EV Charging Solutions - Backend API
 |--------------------------------------------------------------------------
 |
 | Starts the HTTP server and Socket.IO once the database is reachable.
 |
 */

let express  = require('express');
let prisma   = require('./config/database');
let autoload = require('./bootstrap/autoload');

let app = express();
app.use('/', autoload);

let http = require('http').Server(app);
const { Server } = require('socket.io');
global.io = new Server(http, {
  path: '/socket.io',
  cors: {
    origin: process.env.APP_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});
require('./routes/socket');

/**
 * Start server after verifying database connection.
 */
async function main() {
  await prisma.$connect();
  console.log('Connected to database...');

  http.listen(config.app.port, () => {
    console.log('Server Running on port ' + config.app.port);
    // Unanswered booking requests expire after 10 minutes.
    require('./app/Jobs/ExpireRequests').start();
    // Health page: 30-day cleanup, landing-site uptime, and a log line for every start.
    require('./app/Jobs/Cleanup').start();
    require('./app/Jobs/Uptime').start();
    require('./app/Traits/SystemLog').event(`Server started (${process.env.NODE_ENV || 'development'})`);
  });

  http.on('error', onError);
  http.on('listening', onListening);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

process.on('beforeExit', async () => {
  await prisma.$disconnect();
  console.log('Disconnected from database.');
});

/**
 * Event listener for HTTP server "error" event.
 */
function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  let bind = typeof config.app.port === 'string'
    ? 'Pipe ' + config.app.port
    : 'Port ' + config.app.port;

  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */
function onListening() {
  let addr = http.address();
  let bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  console.log('Listening on ' + bind);
}
