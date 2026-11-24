'use strict'

/*
|--------------------------------------------------------------------------
| Email Templates
|--------------------------------------------------------------------------
|
| The PakVolt email design (Design/PakVolt email templates.html) rebuilt for
| mail apps: tables and inline styles, no flex, CSS variables or SVG, which
| Gmail drops. Light by default, dark through prefers-color-scheme. The logo
| is a letter mark and the line-art band is left out until the images can be
| hosted. Only the code and the time are put in, and both are generated here.
|
*/

const BRAND = '#1F7A5A';
const FONT = "Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const DARK = `
@media (prefers-color-scheme: dark) {
  .bg { background:#050706 !important }
  .surf { background:#0E1411 !important; border-color:#26302B !important }
  .txt { color:#F6F8F5 !important }
  .sub { color:#9FB3A8 !important }
  .brd { border-color:#26302B !important; background:#050706 !important }
  .tint { background:#12291F !important; color:#3DDC97 !important }
  .note { background:#12291F !important; color:#F6F8F5 !important }
  .amb { background:#2A2412 !important; color:#F6F8F5 !important }
  .mark { background:#3DDC97 !important; color:#050706 !important }
}`;

const pill = (text) => `<span class="tint" style="display:inline-block;padding:4px 10px;border-radius:999px;background:#E3F3EC;color:${BRAND};font-size:12px;font-weight:500">${text}</span>`;

const layout = ({ tag, title, intro, code, minutes, extra = '', note, noteClass = 'note', noteBg = '#E3F3EC', why }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${title}</title><style>${DARK}</style></head>
<body class="bg" style="margin:0;padding:0;background:#F6F8F5;font-family:${FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:#F6F8F5"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="632" cellpadding="0" cellspacing="0" style="width:100%;max-width:632px">
  <tr><td style="padding:0 0 20px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td><table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td class="mark" width="36" height="36" align="center" style="width:36px;height:36px;border-radius:11px;background:${BRAND};color:#FFFFFF;font:800 18px ${FONT}">P</td>
        <td class="txt" style="padding-left:10px;font:800 19px ${FONT};letter-spacing:-0.02em;color:#111815">PakVolt</td>
      </tr></table></td>
      <td align="right">${pill(tag)}</td>
    </tr></table>
  </td></tr>
  <tr><td class="surf" style="background:#FFFFFF;border:1px solid #E2E8E4;border-radius:18px;padding:28px 32px 32px">
    <h1 class="txt" style="margin:0;font:700 26px/1.15 ${FONT};letter-spacing:-0.02em;color:#111815">${title}</h1>
    <p class="sub" style="margin:8px 0 0;font:15px/1.55 ${FONT};color:#5C6B64">${intro}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr>
      <td class="brd txt" align="center" style="border:1px solid #E2E8E4;border-radius:14px;background:#F6F8F5;padding:22px 16px;font:800 36px ${FONT};letter-spacing:0.24em;color:#111815">${code}</td>
    </tr></table>
    <p align="center" style="margin:12px 0 0">${pill(`Expires in ${minutes} minutes`)}</p>
    ${extra}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr>
      <td class="${noteClass}" style="border-radius:14px;background:${noteBg};padding:14px 16px;font:14px/1.5 ${FONT};color:#111815">${note}</td>
    </tr></table>
  </td></tr>
  <tr><td class="sub" align="center" style="padding:20px 0 0;font:12px/1.6 ${FONT};color:#5C6B64">
    <p style="margin:0">${why}</p><p style="margin:0">PakVolt, Lahore, Pakistan</p>
  </td></tr>
</table></td></tr></table></body></html>`;

/** "482916" to "482 916". */
const spaced = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** The time in Lahore, as the sign-in email shows it. */
const lahoreTime = (date = new Date()) =>
  date.toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

const plain = (lines) => lines.join('\n\n');

const templates = {
  register: ({ code, minutes }) => ({
    subject: 'Verify your PakVolt email',
    text: plain([`Your PakVolt code is ${spaced(code)}.`, `Enter it in the app to finish creating your account. It works for ${minutes} minutes.`, "Didn't sign up? Ignore this email. No account is created until the code is entered."]),
    html: layout({
      tag: 'Account', title: 'Verify your email', intro: 'Enter this code in PakVolt to finish creating your account.', code: spaced(code), minutes,
      note: "Didn't sign up for PakVolt? You can ignore this email. No account is created until the code is entered.",
      why: "You're getting this because this email was used to sign up for PakVolt.",
    }),
  }),

  login: ({ code, minutes }) => ({
    subject: 'Your PakVolt sign-in code',
    text: plain([`Your PakVolt sign-in code is ${spaced(code)}.`, `It works for ${minutes} minutes. Time: ${lahoreTime()}.`, "Never share this code. PakVolt will never ask for it by phone or chat. If this wasn't you, change your password."]),
    html: layout({
      tag: 'Sign in', title: 'Your sign-in code', intro: 'Use this one-time code to sign in to PakVolt.', code: spaced(code), minutes,
      extra: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="brd" style="margin-top:20px;border:1px solid #E2E8E4;border-radius:14px"><tr>
        <td class="sub" style="padding:14px 16px;font:14px ${FONT};color:#5C6B64">Time</td>
        <td class="txt" align="right" style="padding:14px 16px;font:600 14px ${FONT};color:#111815">${lahoreTime()}</td></tr></table>`,
      note: "<b>Never share this code.</b> PakVolt will never ask for it by phone or chat. If this wasn't you, change your password.",
      noteClass: 'amb', noteBg: '#FFF3D6',
      why: "You're getting this because someone tried to sign in to your PakVolt account.",
    }),
  }),

  reset: ({ code, minutes }) => ({
    subject: 'Reset your PakVolt password',
    text: plain([`Your PakVolt password reset code is ${spaced(code)}.`, `Enter it in the app to choose a new password. It works for ${minutes} minutes.`, "Didn't ask for a reset? Ignore this email. Your password stays the same."]),
    html: layout({
      tag: 'Password', title: 'Reset your password', intro: 'Enter this code in PakVolt to choose a new password.', code: spaced(code), minutes,
      note: "Didn't ask for a reset? You can ignore this email. Your password stays the same.",
      why: "You're getting this because a password reset was requested for your PakVolt account.",
    }),
  }),
};

module.exports = templates;
