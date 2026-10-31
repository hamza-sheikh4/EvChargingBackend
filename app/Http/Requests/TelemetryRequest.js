'use strict'

const { z } = require('zod');

const short = (max) => z.string().trim().max(max).optional();
const device = {
  appVersion: short(40),
  platform: short(20),
  osVersion: short(40),
  device: short(80),
  env: short(20),
};

/** A crash, an error or a network problem from the app, the admin site or the landing site. */
exports.error = z.object({
  source: z.enum(['mobile', 'admin', 'landing']),
  type: z.enum(['crash', 'error', 'network']).default('error'),
  title: z.string().trim().min(1).max(300),
  message: short(2000),
  stack: short(8000),
  /** Screen name in the app, page path on the web. */
  where: short(200),
  ...device,
});

/** One app open, for the crash-free rate and the versions in use. */
exports.ping = z.object(device);

/** "Report a problem" from the app's Settings. */
exports.bugReport = z.object({
  description: z.string().trim().min(10, 'Tell us a little more, at least a sentence.').max(2000),
  screenshotKey: short(300),
  role: z.enum(['driver', 'host']).optional(),
  where: short(200),
  ...device,
});
