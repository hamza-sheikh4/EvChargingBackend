'use strict'

/*
|--------------------------------------------------------------------------
| Auth
|--------------------------------------------------------------------------
|
| Sign-up and sign-in use an email and password, or a 6-digit code sent to
| the email. Codes go out through Gmail SMTP (an App Password). Without
| SMTP_USER, a code is printed to the server console in development only;
| production refuses to start.
|
*/

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing from .env (see .env-example).`);
  return value;
}

const production = process.env.NODE_ENV === 'production';
if (production) { required('SMTP_USER'); required('SMTP_PASS'); }

module.exports = {
  jwtSecret    : required('JWT_SECRET'),
  jwtExpiresIn : process.env.JWT_EXPIRES_IN || '30d',
  otpSecret    : required('OTP_SECRET'),
  otpDigits    : 6,
  otpTtlMinutes: 10,
  otpMaxAttempts: 5,
  otpResendSeconds: 60,
  otpMaxPerHour: 5,
  resetMinutes : 10,
  passwordMin  : 8,
  passwordMax  : 128,
  production,
  smtp: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || `PakVolt <${process.env.SMTP_USER}>`,
  },
};
