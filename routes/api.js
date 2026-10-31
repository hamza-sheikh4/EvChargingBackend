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
const rateLimit = require('express-rate-limit');
require('express-group-routes');

/** Controllers **/
const healthCtrl = require('../app/Http/Controllers/v1/HealthController');
const authCtrl   = require('../app/Http/Controllers/v1/AuthController');
const userCtrl   = require('../app/Http/Controllers/v1/UserController');
const uploadCtrl = require('../app/Http/Controllers/v1/UploadController');
const listingCtrl = require('../app/Http/Controllers/v1/ListingController');

/** Validation **/
const validate = require('../app/Http/Requests/Validate');
const authReq  = require('../app/Http/Requests/AuthRequest');
const userReq  = require('../app/Http/Requests/UserRequest');
const uploadReq = require('../app/Http/Requests/UploadRequest');
const listingReq = require('../app/Http/Requests/ListingRequest');

const app = express.Router();

// Per IP, on top of the per-number limits in AuthController.
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.', code: 429 },
});

app.group('/health', (Route) => {

  Route.get('/', healthCtrl.index);

});

app.group('/auth', (Route) => {

  Route.post('/otp/request', authLimit, validate(authReq.requestOtp), authCtrl.requestOtp);
  Route.post('/otp/verify',  authLimit, validate(authReq.verifyOtp),  authCtrl.verifyOtp);

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

  Route.post('/',       authCtrl.authenticate, validate(listingReq.submit), listingCtrl.submit);
  Route.get('/mine',    authCtrl.authenticate, listingCtrl.mine);
  Route.patch('/mine',  authCtrl.authenticate, validate(listingReq.update), listingCtrl.update);

});

module.exports = app;
