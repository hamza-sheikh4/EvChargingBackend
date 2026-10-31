'use strict'

/*
|--------------------------------------------------------------------------
| Admin Routes
|--------------------------------------------------------------------------
|
| Mounted with the rest of the API at /api/v1, under /admin. Registered from
| routes/api.js, which passes in its shared rate limit and validator.
|
*/

const adminSession = require('../app/Http/Controllers/v1/Admin/AdminSession');
const adminAuthCtrl = require('../app/Http/Controllers/v1/Admin/AuthController');
const adminAccountCtrl = require('../app/Http/Controllers/v1/Admin/AccountController');
const adminTeamCtrl = require('../app/Http/Controllers/v1/Admin/TeamController');
const adminHostCtrl = require('../app/Http/Controllers/v1/Admin/HostController');
const adminListingCtrl = require('../app/Http/Controllers/v1/Admin/ListingController');
const adminUserCtrl = require('../app/Http/Controllers/v1/Admin/UserController');
const adminBookingCtrl = require('../app/Http/Controllers/v1/Admin/BookingController');
const adminHealthCtrl = require('../app/Http/Controllers/v1/Admin/HealthController');
const adminOverviewCtrl = require('../app/Http/Controllers/v1/Admin/OverviewController');
const adminReq  = require('../app/Http/Requests/AdminRequest');

module.exports = (app, { authLimit, validate }) => {
  /*
  | Admin panel. Its own login (email, password, optional 2FA) in an httpOnly
  | cookie; app tokens never work here. Every change is written to admin_actions.
  */
  const admin = adminSession.authenticate;
  const can   = adminSession.can;

  app.group('/admin/auth', (Route) => {

    Route.post('/login',      authLimit, validate(adminReq.login),     adminAuthCtrl.login);
    Route.post('/two-factor', authLimit, validate(adminReq.twoFactor), adminAuthCtrl.twoFactor);
    Route.post('/logout',     adminAuthCtrl.logout);

  });

  app.group('/admin/me', (Route) => {

    Route.get('/',                    admin, adminAccountCtrl.me);
    Route.patch('/password',          admin, authLimit, validate(adminReq.changePassword), adminAccountCtrl.changePassword);
    Route.post('/sign-out-all',       admin, adminAccountCtrl.signOutAll);
    Route.post('/two-factor/setup',   admin, adminAccountCtrl.setupTwoFactor);
    Route.post('/two-factor/enable',  admin, authLimit, validate(adminReq.enableTwoFactor), adminAccountCtrl.enableTwoFactor);
    Route.post('/two-factor/disable', admin, authLimit, validate(adminReq.disableTwoFactor), adminAccountCtrl.disableTwoFactor);

  });

  app.group('/admin/team', (Route) => {

    Route.get('/',                       admin, can('team_view'),   adminTeamCtrl.list);
    Route.post('/',                      admin, can('team_add'),    validate(adminReq.addMember), adminTeamCtrl.add);
    // team_edit for permissions, team_suspend for status: checked in the controller.
    Route.patch('/:id',                  admin, can('team_view'),   validate(adminReq.updateMember), adminTeamCtrl.update);
    Route.post('/:id/reset-password',    admin, can('team_reset'),  adminTeamCtrl.resetPassword);
    Route.post('/:id/reset-two-factor',  admin, can('team_reset'),  adminTeamCtrl.resetTwoFactor);
    Route.delete('/:id',                 admin, can('team_remove'), adminTeamCtrl.remove);

  });

  app.group('/admin/hosts', (Route) => {

    Route.get('/',             admin, can('hosts_view'),   adminHostCtrl.list);
    Route.get('/:id',          admin, can('hosts_view'),   adminHostCtrl.show);
    Route.post('/:id/approve', admin, can('hosts_approve'), adminHostCtrl.approve);
    Route.post('/:id/reject',  admin, can('hosts_reject'),  validate(adminReq.rejectHost), adminHostCtrl.reject);

  });

  app.group('/admin/listings', (Route) => {

    Route.get('/',      admin, can('listings_view'),   adminListingCtrl.list);
    Route.get('/:id',   admin, can('listings_view'),   adminListingCtrl.show);
    // listings_pause or listings_relist, by direction: checked in the controller.
    Route.patch('/:id', admin, can('listings_view'),   validate(adminReq.setListed), adminListingCtrl.setListed);

  });

  app.group('/admin/users', (Route) => {

    Route.get('/',               admin, can('users_view'),    adminUserCtrl.list);
    Route.get('/:id',            admin, can('users_view'),    adminUserCtrl.show);
    Route.post('/:id/suspend',   admin, can('users_suspend'), validate(adminReq.suspendUser), adminUserCtrl.suspend);
    Route.post('/:id/unsuspend', admin, can('users_unsuspend'), adminUserCtrl.unsuspend);

  });

  app.group('/admin/bookings', (Route) => {

    Route.get('/',    admin, can('bookings_view'), adminBookingCtrl.list);
    Route.get('/:id', admin, can('bookings_view'), adminBookingCtrl.show);

  });

  app.group('/admin/health', (Route) => {

    Route.get('/',                    admin, can('health_view'),      adminHealthCtrl.overview);
    Route.get('/events',              admin, can('health_view_logs'), adminHealthCtrl.events);
    Route.get('/events/:id',          admin, can('health_view_logs'), adminHealthCtrl.event);
    Route.post('/events/:id/resolve', admin, can('health_resolve'),   adminHealthCtrl.resolve);
    Route.post('/events/:id/reopen',  admin, can('health_resolve'),   adminHealthCtrl.reopen);

  });

  // Any signed-in admin; each section inside checks its own page's permission.
  app.group('/admin/overview', (Route) => {

    Route.get('/', admin, adminOverviewCtrl.show);

  });
};
