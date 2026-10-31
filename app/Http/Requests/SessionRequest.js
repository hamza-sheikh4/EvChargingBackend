'use strict'

const { z } = require('zod');

const percent = z.number().int().min(0, 'Enter a battery level from 0 to 100.').max(100, 'Enter a battery level from 0 to 100.');
const proofKey = z.string().max(300).optional();

exports.create = z.object({
  chargerId: z.string().uuid(),
  /** The car the driver picked; their first car when missing. */
  vehicleId: z.string().uuid().optional(),
});

exports.start = z.object({ startPercent: percent });

exports.interrupt = z.object({ reason: z.string().trim().min(2, 'Say what happened.').max(300) });

exports.end = z.object({
  endPercent: percent,
  proofKeys: z.object({ chargerDisplay: proofKey, carScreen: proofKey }).default({}),
});
