'use strict'

/*
|--------------------------------------------------------------------------
| Admin Panel Auth
|--------------------------------------------------------------------------
|
| Email and password, with optional 2FA from an authenticator app. Separate
| from the app's phone login: its own secret, so an app token never opens
| an /admin route. The login lives in an httpOnly cookie sent only to /admin.
|
*/

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing from .env (see .env-example).`);
  return value;
}

const production = process.env.NODE_ENV === 'production';

const config = {
  jwtSecret        : required('ADMIN_JWT_SECRET'),
  sessionHours     : 12,
  challengeMinutes : 5,          // time to enter the 2FA code after the password
  cookieName       : 'admin_session',
  cookiePath       : '/api/v1/admin',
  cookieSecure     : production,
  maxFailedLogins  : 5,
  lockMinutes      : 15,
  passwordMinLength: 10,
  totpIssuer       : 'PakVolt Admin',
  totpDigits       : 6,
  totpPeriodSeconds: 30,
  /** By panel page. The first of each group is "see the page"; the others need it. */
  permissionGroups : {
    hosts   : ['hosts_view', 'hosts_view_documents', 'hosts_approve', 'hosts_reject'],
    listings: ['listings_view', 'listings_view_location', 'listings_pause', 'listings_relist'],
    users   : ['users_view', 'users_suspend', 'users_unsuspend'],
    bookings: ['bookings_view', 'bookings_view_photos'],
    team    : ['team_view', 'team_add', 'team_edit', 'team_suspend', 'team_reset', 'team_remove'],
    health  : ['health_view', 'health_view_logs', 'health_resolve'],
  },
};

config.permissions = Object.values(config.permissionGroups).flat();

module.exports = config;
