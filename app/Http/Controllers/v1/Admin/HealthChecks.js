'use strict'

const fs      = require('fs');
const path    = require('path');
const prisma  = require('../../../../../config/database');
const storage = require('../../../../Traits/Storage');

/*
|--------------------------------------------------------------------------
| Health Checks
|--------------------------------------------------------------------------
|
| Live checks for the Health page, run when it loads. Each one times itself
| and never throws: a failed check is a red card, not a broken page.
|
*/

let o = {}

const MIGRATIONS_DIR = path.join(__dirname, '../../../../../prisma/migrations');

/** Runs one check: { ok, ms, ...result } or { ok: false, ms, error }. */
const timed = async (check) => {
  const started = Date.now();
  try {
    return { ok: true, ...(await check()), ms: Date.now() - started };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, error: e.message };
  }
};

/** Connection, query time, size, rows per table, migrations, and clock drift against the server. */
o.database = () =>
  timed(async () => {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const queryMs = Date.now() - started;
    const [[{ size, now }], applied] = await Promise.all([
      prisma.$queryRaw`SELECT pg_database_size(current_database())::bigint AS size, now() AS now`,
      prisma.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at`,
    ]);
    const local = fs.readdirSync(MIGRATIONS_DIR).filter((name) => /^\d{14}_/.test(name)).sort();
    const done = applied.filter((m) => m.finished_at && !m.rolled_back_at).map((m) => m.migration_name);
    const failed = applied.filter((m) => !m.finished_at && !m.rolled_back_at).map((m) => m.migration_name);
    const tables = {
      users: prisma.user, vehicles: prisma.vehicle, chargers: prisma.charger, sessions: prisma.session,
      notifications: prisma.notification, admins: prisma.admin, admin_actions: prisma.adminAction,
      otp_codes: prisma.otpCode, system_events: prisma.systemEvent,
    };
    const counts = await Promise.all(Object.entries(tables).map(async ([name, model]) => [name, await model.count()]));
    return {
      queryMs,
      sizeBytes: Number(size),
      rows: Object.fromEntries(counts),
      migrations: {
        applied: done.length,
        pending: local.filter((name) => !done.includes(name)),
        failed,
        latest: done[done.length - 1] ?? null,
      },
      clockDriftMs: new Date(now).getTime() - Date.now(),
      host: new URL(process.env.DATABASE_URL).hostname,
    };
  });

/** Upload through a signed link and find the file again. */
o.storage = () => timed(() => storage.probe());

/** Open sockets and people with the app open right now. */
o.realtime = () =>
  timed(async () => {
    const io = global.io;
    if (!io) throw new Error('The realtime server is not running.');
    const rooms = [...io.of('/').adapter.rooms.keys()].filter((room) => room.startsWith('user:'));
    return { sockets: io.engine.clientsCount, usersOnline: rooms.length };
  });

const version = (name) => {
  try {
    return require(`${name}/package.json`).version;
  } catch {
    return null;
  }
};

const SECRETS = ['JWT_SECRET', 'OTP_SECRET', 'ADMIN_JWT_SECRET', 'DATABASE_URL', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'CNIC_ENCRYPTION_KEY'];

/** Versions, addresses, config checks and which secrets are set. Never a secret's value. */
o.environment = () => {
  const production = process.env.NODE_ENV === 'production';
  const otpDevMode = process.env.OTP_DEV_MODE === 'true';
  const pkg = require('../../../../../package.json');
  return {
    name: process.env.NODE_ENV || 'development',
    versions: { app: pkg.version, node: process.version, express: version('express'), prisma: version('@prisma/client'), socketIo: version('socket.io') },
    commit: process.env.GIT_COMMIT || null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    platform: `${process.platform} ${process.arch}`,
    addresses: { apiPort: process.env.PORT || null, admin: process.env.APP_URL || null, landing: process.env.LANDING_URL || null },
    checks: [
      { id: 'otp_dev_mode', ok: !otpDevMode || !production, value: otpDevMode ? 'On' : 'Off', warn: otpDevMode },
      // Off is expected in development, where the admin site runs on plain http.
      { id: 'secure_cookie', ok: true, value: production ? 'On' : 'Off (development)' },
      { id: 'cors', ok: Boolean(process.env.APP_URL), value: [process.env.APP_URL, process.env.LANDING_URL].filter(Boolean).join(', ') || 'Not set' },
      { id: 'rate_limits', ok: true, value: 'Sign-in 30 per 15 min per IP; reports 120 per 15 min per IP' },
      { id: 'landing_url', ok: Boolean(process.env.LANDING_URL), value: process.env.LANDING_URL || 'Not set: uptime checks are off' },
    ],
    secrets: SECRETS.map((name) => ({ name, set: Boolean(process.env[name]) })),
  };
};

module.exports = o;
