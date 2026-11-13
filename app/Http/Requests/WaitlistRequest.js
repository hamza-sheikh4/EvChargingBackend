'use strict'

const { z } = require('zod');

/** The landing page's waitlist form. website is a hidden field only bots fill in. */
exports.join = z.object({
  email: z.string().trim().max(254).pipe(z.email({ error: 'Enter a valid email address.' })),
  website: z.string().max(200).optional(),
});
