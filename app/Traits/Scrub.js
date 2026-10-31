'use strict'

/*
|--------------------------------------------------------------------------
| Scrub
|--------------------------------------------------------------------------
|
| Removes personal data from anything stored in system_events: tokens,
| emails, CNICs, Pakistani phone numbers and long secrets. Run on every
| title, message, stack and context value before it is saved.
|
*/

const RULES = [
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]'],
  [/\b\d{5}-?\d{7}-?\d\b/g, '[cnic]'],
  [/(\+?92|0)?3\d{2}[\s-]?\d{7}\b/g, '[phone]'],
  [/\b[a-f0-9]{32,}\b/gi, '[secret]'],
];

const MAX = 4000;

let o = {}

o.text = (value) => {
  if (value === undefined || value === null) return null;
  let text = String(value);
  for (const [pattern, replacement] of RULES) text = text.replace(pattern, replacement);
  return text.length > MAX ? `${text.slice(0, MAX)}…` : text;
};

/** A small JSON value with every string scrubbed. Keys named like secrets are dropped. */
o.json = (value, depth = 0) => {
  if (value === null || value === undefined || depth > 4) return null;
  if (typeof value === 'string') return o.text(value);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => o.json(item, depth + 1));
  const out = {};
  for (const [key, item] of Object.entries(value).slice(0, 50)) {
    if (/password|token|secret|cnic|authorization|cookie/i.test(key)) continue;
    out[key] = o.json(item, depth + 1);
  }
  return out;
};

module.exports = o;
