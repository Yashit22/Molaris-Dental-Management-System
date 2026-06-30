/**
 * One-time migration: add placeholder license numbers to Doctor records
 * that don't already have one.
 *
 * Run once from the project root:
 *   node --experimental-vm-modules dms_backend/seeds/migrateDoctorLicenseNumbers.js
 *
 * Or via the tenant DB directly if you have MONGO_URI set:
 *   MONGO_URI=... node dms_backend/seeds/migrateDoctorLicenseNumbers.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI not set — add it to .env or prefix the command');
  process.exit(1);
}

// Placeholder numbers — update these before running in production
const PLACEHOLDER_LICENSES = [
  'MH-12345',
  'MH-12346',
  'MH-12347',
  'MH-12348',
  'MH-12349',
];

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  // Try every "doctors" collection across tenant databases.
  // If you're multi-tenant, list the tenant DB names below.
  // For a single-tenant setup, the DB name is already in the MONGO_URI.
  const collections = await db.listCollections({ name: 'doctors' }).toArray();

  if (!collections.length) {
    console.log('No "doctors" collection found in the connected database.');
    await mongoose.disconnect();
    return;
  }

  const doctors = await db.collection('doctors').find({}).toArray();
  console.log(`Found ${doctors.length} doctor(s).`);

  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < doctors.length; i++) {
    const doc = doctors[i];
    if (doc.license_number) {
      console.log(`  ✓  ${doc.name} — already has license number: ${doc.license_number}`);
      skipped++;
      continue;
    }

    const placeholder = PLACEHOLDER_LICENSES[i] || `REG-${String(i + 1).padStart(4, '0')}`;
    await db.collection('doctors').updateOne(
      { _id: doc._id },
      { $set: { license_number: placeholder } }
    );
    console.log(`  ✏️  ${doc.name} — set license_number = ${placeholder}`);
    updated++;
  }

  console.log(`\nDone. Updated: ${updated}, Skipped (already had number): ${skipped}`);
  console.log('⚠️  These are placeholder values. Go to Settings → Doctors and update each doctor\'s actual registration number.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
