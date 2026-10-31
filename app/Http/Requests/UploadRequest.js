'use strict'

const { z } = require('zod');

/** The kinds the app uploads (UploadKind in the app). */
exports.KINDS = ['cnic_front', 'cnic_back', 'charger_photo', 'connector_photo', 'profile_photo', 'session_proof'];

exports.create = z.object({
  kind: z.enum(exports.KINDS),
  sessionId: z.string().uuid().optional(),
});
