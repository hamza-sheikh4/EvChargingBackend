'use strict'

let o = {}

/** Pakistani mobile number without +92, as the app sends it: 3 then 9 digits. */
o.PATTERN = /^3\d{9}$/;

/** 3001234567 to 300****567, for logs. Full numbers never appear in logs (vision rule 9). */
o.mask = (phone) => `${phone.slice(0, 3)}****${phone.slice(-3)}`;

module.exports = o;
