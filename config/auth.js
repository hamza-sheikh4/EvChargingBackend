'use strict'

/*
|--------------------------------------------------------------------------
| Auth
|--------------------------------------------------------------------------
|
| Login is a phone OTP. In dev mode no SMS is sent and any code except 0000
| logs in. Dev mode can never run in production: the server refuses to start.
|
*/

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing from .env (see .env-example).`);
  return value;
}

const devMode = process.env.OTP_DEV_MODE === 'true';

if (devMode && process.env.NODE_ENV === 'production') {
  throw new Error('OTP_DEV_MODE must be false in production.');
}

module.exports = {
  jwtSecret    : required('JWT_SECRET'),
  jwtExpiresIn : process.env.JWT_EXPIRES_IN || '30d',
  otpSecret    : required('OTP_SECRET'),
  otpDevMode   : devMode,
  otpDigits    : 4,
  otpTtlMinutes: 5,
  otpMaxAttempts: 5,
  otpResendSeconds: 30,
  otpMaxPerHour: 5,
  otpRejectedDevCode: '0000',
};
