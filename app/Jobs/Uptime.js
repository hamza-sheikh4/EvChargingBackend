'use strict'

let metrics = require('../Traits/Metrics');
let systemLog = require('../Traits/SystemLog');

/*
|--------------------------------------------------------------------------
| Landing Uptime
|--------------------------------------------------------------------------
|
| Every 5 minutes, loads the landing site at LANDING_URL and keeps the
| status code and response time (30 days). Off when LANDING_URL is unset.
|
*/

const EVERY_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 10 * 1000;

let o = {}

o.url = () => process.env.LANDING_URL || null;

o.check = async () => {
  const url = o.url();
  if (!url) return null;
  const started = Date.now();
  let status = 0;
  let error = null;
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
    status = response.status;
  } catch (e) {
    error = e.name === 'TimeoutError' ? 'Timed out' : e.message;
  }
  const ms = Date.now() - started;
  const up = status >= 200 && status < 400;
  await systemLog.record({
    kind: 'uptime',
    source: 'landing',
    level: up ? 'info' : 'error',
    title: up ? 'Landing site up' : 'Landing site down',
    context: { status, ms, error },
    unique: true,
  });
  metrics.job('landing_uptime', { ms, result: { status, up }, error: up ? undefined : error || `HTTP ${status}` });
  return { status, ms, up };
};

o.start = () => {
  if (!o.url()) return;
  setTimeout(() => o.check(), 15 * 1000).unref();
  setInterval(() => o.check(), EVERY_MS).unref();
};

module.exports = o;
