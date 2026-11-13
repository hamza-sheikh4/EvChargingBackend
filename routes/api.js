'use strict'

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Every route here is mounted at /api/v1. Group routes by resource, as in
| AGENT.md.
|
*/

const express   = require('express');
const limits    = require('./limits');
require('express-group-routes');

/** Controllers **/
const healthCtrl = require('../app/Http/Controllers/v1/HealthController');
const authCtrl   = require('../app/Http/Controllers/v1/AuthController');
const userCtrl   = require('../app/Http/Controllers/v1/UserController');
const uploadCtrl = require('../app/Http/Controllers/v1/UploadController');
const listingCtrl = require('../app/Http/Controllers/v1/ListingController');
const chargerCtrl = require('../app/Http/Controllers/v1/ChargerController');
const sessionCtrl = require('../app/Http/Controllers/v1/SessionController');
const telemetryCtrl = require('../app/Http/Controllers/v1/TelemetryController');
const notificationCtrl = require('../app/Http/Controllers/v1/NotificationController');
const waitlistCtrl = require('../app/Http/Controllers/v1/WaitlistController');

/** Validation **/
const validate = require('../app/Http/Requests/Validate');
const authReq  = require('../app/Http/Requests/AuthRequest');
const userReq  = require('../app/Http/Requests/UserRequest');
const uploadReq = require('../app/Http/Requests/UploadRequest');
const listingReq = require('../app/Http/Requests/ListingRequest');
const sessionReq = require('../app/Http/Requests/SessionRequest');
const telemetryReq = require('../app/Http/Requests/TelemetryRequest');
const waitlistReq = require('../app/Http/Requests/WaitlistRequest');

const app = express.Router();

app.group('/health', (Route) => {

  Route.get('/', healthCtrl.index);

});

app.group('/auth', (Route) => {

  Route.post('/otp/request', limits.auth, validate(authReq.requestOtp), authCtrl.requestOtp);
  Route.post('/otp/verify',  limits.auth, validate(authReq.verifyOtp),  authCtrl.verifyOtp);

});

app.group('/me', (Route) => {

  Route.get('/',         authCtrl.authenticate, userCtrl.me);
  Route.patch('/',       authCtrl.authenticate, validate(userReq.updateProfile), userCtrl.updateProfile);
  Route.put('/driver',   authCtrl.authenticate, validate(userReq.saveDriver), userCtrl.saveDriver);
  Route.post('/vehicles',       authCtrl.authenticate, validate(userReq.saveVehicle), userCtrl.addVehicle);
  Route.put('/vehicles/:id',    authCtrl.authenticate, validate(userReq.saveVehicle), userCtrl.updateVehicle);
  Route.delete('/vehicles/:id', authCtrl.authenticate, userCtrl.removeVehicle);

});

app.group('/uploads', (Route) => {

  Route.post('/', authCtrl.authenticate, validate(uploadReq.create), uploadCtrl.create);

});

app.group('/listings', (Route) => {

  Route.post('/',       authCtrl.authenticate, limits.listing, validate(listingReq.submit), listingCtrl.submit);
  Route.get('/mine',    authCtrl.authenticate, listingCtrl.mine);
  Route.patch('/mine',  authCtrl.authenticate, validate(listingReq.update), listingCtrl.update);

});

app.group('/chargers', (Route) => {

  Route.get('/', authCtrl.authenticate, limits.search, chargerCtrl.search);

});

app.group('/sessions', (Route) => {

  Route.get('/',              authCtrl.authenticate, sessionCtrl.list);
  Route.post('/',             authCtrl.authenticate, validate(sessionReq.create), sessionCtrl.request);
  Route.get('/:id/access',    authCtrl.authenticate, sessionCtrl.access);
  Route.post('/:id/accept',   authCtrl.authenticate, sessionCtrl.accept);
  Route.post('/:id/decline',  authCtrl.authenticate, sessionCtrl.decline);
  Route.post('/:id/cancel',   authCtrl.authenticate, sessionCtrl.cancel);
  Route.post('/:id/start',    authCtrl.authenticate, validate(sessionReq.start), sessionCtrl.start);
  Route.post('/:id/interrupt', authCtrl.authenticate, validate(sessionReq.interrupt), sessionCtrl.interrupt);
  Route.post('/:id/resume',   authCtrl.authenticate, sessionCtrl.resume);
  Route.post('/:id/end',      authCtrl.authenticate, validate(sessionReq.end), sessionCtrl.end);

});

app.group('/notifications', (Route) => {

  Route.get('/',          authCtrl.authenticate, notificationCtrl.list);
  Route.post('/read-all', authCtrl.authenticate, notificationCtrl.readAll);

});

app.group('/telemetry', (Route) => {

  Route.post('/errors', limits.telemetry, validate(telemetryReq.error), telemetryCtrl.error);
  Route.post('/ping',   limits.telemetry, validate(telemetryReq.ping),  telemetryCtrl.ping);

});

app.group('/support', (Route) => {

  Route.post('/bug-report', limits.telemetry, authCtrl.authenticate, validate(telemetryReq.bugReport), telemetryCtrl.bugReport);

});

// The landing page's waitlist form. No login.
app.group('/waitlist', (Route) => {

  Route.post('/', limits.waitlist, validate(waitlistReq.join), waitlistCtrl.join);

});

require('./admin')(app, { authLimit: limits.auth, validate });

module.exports = app;
