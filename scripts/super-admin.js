'use strict'

/*
|--------------------------------------------------------------------------
| Super admins (the only way to make or remove one)
|--------------------------------------------------------------------------
|
| Whoever can run this already holds the server and database credentials.
| The admin panel can never make or remove a super admin. Up to 3 at once.
|
|   npm run super-admin              menu
|   npm run super-admin -- list
|   npm run super-admin -- add
|   npm run super-admin -- remove
|   npm run super-admin -- replace
|   npm run super-admin -- reset-password
|   npm run super-admin -- reset-2fa
|
*/

require('dotenv').config();
const readline = require('readline/promises');
const prisma   = require('../config/database');
const supers   = require('../app/Traits/SuperAdmins');

const { Refused, MAX_SUPER_ADMINS } = supers;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const ask = async (question) => (await rl.question(question)).trim();
const yes = async (question) => /^y(es)?$/i.test(await ask(`${question} (yes/no) `));

/** Asked twice: a typo would make the wrong address a super admin. */
async function askEmail(label) {
  const email = supers.normalizeEmail(await ask(`${label}: `));
  if (!supers.validEmail(email)) throw new Refused('That is not a valid email address. Nothing changed.');
  if (supers.normalizeEmail(await ask('Type it again: ')) !== email) throw new Refused('The emails do not match. Nothing changed.');
  return email;
}

/** A new person needs a name; an existing admin keeps theirs. */
async function askNewPerson(label) {
  const email = await askEmail(label);
  const existing = await supers.findAdmin(email);
  const fullName = existing ? existing.fullName : await ask('Full name: ');
  if (!existing && fullName.length < 2) throw new Refused('Enter their full name. Nothing changed.');
  return { email, fullName, existing };
}

/** Pick by number, then retype that person's email to confirm. */
async function pick(list, verb) {
  await printList(list);
  const chosen = list[Number(await ask(`Number to ${verb}: `)) - 1];
  if (!chosen) throw new Refused('No super admin with that number. Nothing changed.');
  if (supers.normalizeEmail(await ask(`Type ${chosen.email} to confirm: `)) !== chosen.email) {
    throw new Refused('That email does not match. Nothing changed.');
  }
  return chosen;
}

async function confirmWrite(question) {
  console.log(`\nDatabase: ${supers.databaseLabel()}`);
  if (!(await yes('Is this the database you mean to change?'))) throw new Refused('Nothing changed.');
  if (!(await yes(question))) throw new Refused('Nothing changed.');
}

async function printList(list) {
  console.log(`\nSuper admins: ${list.length} of ${MAX_SUPER_ADMINS}`);
  list.forEach((admin, index) => {
    const notes = [admin.status === 'suspended' && 'DISABLED', !admin.lastLoginAt && 'not signed in yet'].filter(Boolean);
    console.log(`  ${index + 1}. ${admin.email} (${admin.fullName})${notes.length ? ` - ${notes.join(', ')}` : ''}`);
  });
}

function report(result) {
  const { admin, outcome, temporaryPassword } = result;
  if (outcome === 'nothing') return console.log(`${admin.email} is already an active super admin. Nothing to do.`);
  if (outcome === 'reenabled') console.log(`${admin.email} was disabled and is enabled again.`);
  if (outcome === 'promoted') console.log(`${admin.email} was an admin and is now a super admin. Their password is unchanged.`);
  if (outcome === 'created') console.log(`Made ${admin.email} a super admin.`);
  if (temporaryPassword) console.log(`Temporary password (shown once): ${temporaryPassword}\nChange it in Settings > Security after signing in.`);
}

const commands = {
  async list() {
    await printList(await supers.list());
  },

  async add() {
    if ((await supers.list()).length >= MAX_SUPER_ADMINS) {
      throw new Refused(`There are already ${MAX_SUPER_ADMINS} super admins. Use replace.`);
    }
    const person = await askNewPerson('Email of the new super admin');
    await confirmWrite(`Make ${person.email} a super admin?`);
    report(await supers.grant(person));
  },

  async remove() {
    const chosen = await pick(await supers.list(), 'remove');
    await confirmWrite(`Remove ${chosen.email}? Their admin account is deleted.`);
    await supers.revoke(chosen.id);
    console.log(`Removed ${chosen.email} as a super admin.`);
  },

  async replace() {
    const old = await pick(await supers.list(), 'replace');
    const person = await askNewPerson('Email of the new super admin');
    if (person.email === old.email) throw new Refused('That is the same person. Nothing changed.');
    await confirmWrite(`Replace ${old.email} with ${person.email}?`);
    report(await supers.replace(old.id, person));
    console.log(`Replaced ${old.email} with ${person.email}.`);
  },

  async 'reset-password'() {
    const chosen = await pick(await supers.list(), 'reset the password for');
    await confirmWrite(`Reset the password for ${chosen.email}? They are signed out everywhere.`);
    const { temporaryPassword } = await supers.resetPassword(chosen.id);
    console.log(`Temporary password (shown once): ${temporaryPassword}`);
  },

  async 'reset-2fa'() {
    const chosen = await pick(await supers.list(), 'turn off 2FA for');
    await confirmWrite(`Turn off 2FA for ${chosen.email}?`);
    await supers.resetTwoFactor(chosen.id);
    console.log(`2FA is off for ${chosen.email}. They can set it up again in Settings > Security.`);
  },
};

async function main() {
  let name = process.argv[2];
  if (!name) {
    const names = Object.keys(commands);
    names.forEach((command, index) => console.log(`  ${index + 1}. ${command}`));
    name = names[Number(await ask('Choose: ')) - 1];
  }
  const command = commands[name];
  if (!command) throw new Refused(`Commands: ${Object.keys(commands).join(', ')}`);
  await command();
}

main()
  .catch((e) => {
    console.error(e instanceof Refused ? e.message : `Failed: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await prisma.$disconnect();
  });
