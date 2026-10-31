'use strict'

/*
|--------------------------------------------------------------------------
| Verify a host (development)
|--------------------------------------------------------------------------
|
| Until the admin panel exists: marks a host and their charger as verified.
| Usage: npm run verify-host -- 3001234567
|
*/

require('dotenv').config();
const prisma = require('../config/database');

async function main() {
  const phone = process.argv[2];
  if (!/^3\d{9}$/.test(phone || '')) throw new Error('Give the host\'s number without +92, for example 3001234567.');
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user?.isHost) throw new Error('No host with that number.');
  const now = new Date();
  await prisma.user.update({ where: { id: user.id }, data: { hostVerificationStatus: 'verified' } });
  const { count } = await prisma.charger.updateMany({ where: { hostId: user.id, verifiedAt: null }, data: { verifiedAt: now } });
  console.log(`Verified the host and ${count} charger(s).`);
}

main()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
