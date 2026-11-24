'use strict'

/*
|--------------------------------------------------------------------------
| Keep Alive
|--------------------------------------------------------------------------
|
| Every 10 minutes, the server opens its own public health address. The
| request comes in from outside, so Render counts it as traffic and does not
| put a free service to sleep, and the health check runs SELECT 1, which keeps
| the Supabase project from pausing. Render sets RENDER_EXTERNAL_URL itself;
| KEEP_ALIVE_URL overrides it. Off when neither is set (local development).
|
*/

const EVERY_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 20 * 1000;

let o = {}

o.url = () => {
  const base = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
  return base ? `${base.replace(/\/+$/, '')}/api/v1/health` : null;
};

o.ping = async () => {
  const url = o.url();
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return response.status;
  } catch (e) {
    console.error('Keep-alive ping failed:', e.message);
    return 0;
  }
};

o.start = () => {
  if (!o.url()) return;
  setInterval(() => o.ping(), EVERY_MS).unref();
};

module.exports = o;
