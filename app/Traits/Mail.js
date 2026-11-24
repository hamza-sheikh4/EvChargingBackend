'use strict'

const nodemailer = require('nodemailer');
const auth = require('../../config/auth');

/** The only place an email leaves the server. Changing provider (Resend later) is a change here. */
let transport;

let o = {}

o.send = async (to, subject, text, html) => {
  if (!auth.smtp.user) {
    // Development only: no SMTP set, so the message is printed instead of sent.
    console.log(`[mail] not sent (no SMTP_USER). To: ${to}. ${subject}\n${text}`);
    return;
  }
  transport ??= nodemailer.createTransport({ service: 'gmail', auth: { user: auth.smtp.user, pass: auth.smtp.pass } });
  await transport.sendMail({ from: auth.smtp.from, to, subject, text, html });
};

module.exports = o;
